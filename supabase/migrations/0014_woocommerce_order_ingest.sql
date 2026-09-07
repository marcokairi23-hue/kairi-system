-- WooCommerce paid orders -> Kairi. Service-role only; no credentials.
-- Source dimensions: labelled centimetres, verified against Woo v1 payload.
begin;
create table public.woocommerce_imports (
 source_order_id text primary key, order_id uuid not null unique references public.orders(id),
 source_modified_at timestamp not null, source_data jsonb not null, imported_at timestamptz not null default now()
);
alter table public.woocommerce_imports enable row level security;
revoke all on public.woocommerce_imports from anon, authenticated;
grant all on public.woocommerce_imports to service_role;
alter table public.order_items add column woo_item_key text;
create unique index order_items_woo_key on public.order_items(order_id,woo_item_key) where woo_item_key is not null;
alter table public.payments add column woo_payment_key text;
create unique index payments_woo_key on public.payments(woo_payment_key) where woo_payment_key is not null;
insert into public.settings(key,value) values ('woocommerce_import','{"agent_id":"d1bbfc1b-e092-4d8f-8a89-1e6d33bd2862","timezone":"Asia/Jerusalem","dimension_unit":"cm"}') on conflict(key) do nothing;
create function public.woo_normalize_phone(p text) returns text language sql immutable set search_path=public as $fn$
 select case when n like '00972%' then '0'||substring(n from 6) when n like '972%' then '0'||substring(n from 4) else n end from (select regexp_replace(coalesce(p,''),'[^0-9]','','g') n) s;
$fn$;
create function public.woo_meta(p jsonb, variadic keys text[]) returns text language sql immutable set search_path=public as $fn$
 select nullif(btrim(e->>'value'),'') from unnest(keys) with ordinality k(key,priority)
 cross join jsonb_array_elements(case when jsonb_typeof(p->'meta_data')='array' then p->'meta_data' when jsonb_typeof(p->'meta')='array' then p->'meta' else '[]'::jsonb end) e
 where e->>'key'=k.key and nullif(btrim(e->>'value'),'') is not null order by k.priority limit 1;
$fn$;
create function public.ingest_woocommerce_order(p_payload_text text) returns jsonb language plpgsql security definer set search_path=public as $fn$
declare
 p jsonb := p_payload_text::jsonb; cfg jsonb; src text; modified timestamp; paid timestamptz;
 agent uuid; cid uuid; oid uuid; num integer; old public.woocommerce_imports%rowtype;
 existing_status text; data jsonb; item jsonb; meta_size text; wmatch text[]; hmatch text[];
 width numeric; height numeric; qty integer; copy_index integer; item_index integer := 0;
 line_total numeric; item_price numeric; total numeric; items_sum numeric := 0; width_sum numeric := 0;
 v_phone text; fullname text; address_text text; email_text text;
 fam public.item_family; route public.production_route; itemkey text; keys text[] := '{}'; created boolean := false;
begin
 if jsonb_typeof(p) is distinct from 'object' then raise exception 'Expected order object'; end if;
 if p->>'status' is distinct from 'processing' or nullif(p->>'date_paid','') is null then return jsonb_build_object('result','skipped','reason','not_paid_processing'); end if;
 src := p->>'id';
 if src is null or src !~ '^[1-9][0-9]*$' then raise exception 'Invalid Woo order id'; end if;
 if p->>'currency' is distinct from 'ILS' then raise exception 'Only ILS orders are supported'; end if;
 if jsonb_typeof(p->'line_items') is distinct from 'array' or jsonb_array_length(p->'line_items')=0 then raise exception 'Order has no items'; end if;
 if coalesce(p->>'total','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Invalid total'; end if;
 total := (p->>'total')::numeric;
 select value into cfg from public.settings where key='woocommerce_import'; agent := (cfg->>'agent_id')::uuid;
 if not exists(select 1 from public.profiles where id=agent and is_active and role in ('admin','office','sales')) then raise exception 'Configure an active Woo import agent'; end if;
 paid := case when nullif(p->>'date_paid_gmt','') is not null then (p->>'date_paid_gmt')::timestamp at time zone 'UTC' else (p->>'date_paid')::timestamp at time zone coalesce(cfg->>'timezone','Asia/Jerusalem') end;
 modified := coalesce(nullif(p->>'date_modified','')::timestamp,(p->>'date_paid')::timestamp);
 data := jsonb_build_object('billing',p->'billing','items',p->'line_items','total',p->'total','paid',p->'date_paid','method',coalesce(p->>'payment_method_title',p->>'payment_method'),'note',p->'customer_note','discount',p->'discount_total');
 perform pg_advisory_xact_lock(hashtextextended('woo:order:'||src,0));
 select * into old from public.woocommerce_imports where source_order_id=src for update;
 if found then
  oid := old.order_id; select order_number,status::text into num,existing_status from public.orders where id=oid for update;
  if modified < old.source_modified_at or data=old.source_data then
   update public.woocommerce_imports set source_modified_at=greatest(source_modified_at,modified) where source_order_id=src;
   return jsonb_build_object('result','unchanged','order_id',oid,'order_number',num);
  end if;
  if existing_status <> 'ready' or exists(select 1 from public.order_items where order_id=oid and item_status not in ('new','cancelled')) then raise exception 'Woo order % changed after production started; manual review required',src; end if;
 elsif exists(select 1 from public.orders where client_draft_id='woo:'||src) then raise exception 'Existing Woo order lacks import tracking; review before retry'; end if;
 v_phone := public.woo_normalize_phone(p#>>'{billing,phone}');
 fullname := btrim(concat_ws(' ',p#>>'{billing,first_name}',p#>>'{billing,last_name}'));
 if v_phone='' or fullname='' then raise exception 'Customer name and phone are required'; end if;
 address_text := concat_ws(', ',nullif(p#>>'{billing,address_1}',''),nullif(p#>>'{billing,address_2}',''),nullif(p#>>'{billing,city}','')); email_text := nullif(p#>>'{billing,email}','');
 perform pg_advisory_xact_lock(hashtextextended('woo:phone:'||v_phone,0));
 if oid is not null then select customer_id into cid from public.orders where id=oid; end if;
 if cid is null then select id into cid from public.customers where public.woo_normalize_phone(customers.phone)=v_phone order by created_at,id limit 1; end if;
 if cid is null then insert into public.customers(full_name,phone,email,address,city) values(fullname,v_phone,email_text,address_text,p#>>'{billing,city}') returning id into cid;
 else update public.customers set full_name=fullname,phone=v_phone,email=coalesce(email_text,email),address=address_text,city=p#>>'{billing,city}' where id=cid; end if;
 if oid is null then
  insert into public.orders(client_draft_id,is_quote,status,customer_id,agent_id,customer_name_snapshot,phone_snapshot,address_snapshot,final_total,send_email,notes)
  values('woo:'||src,false,'ready',cid,agent,fullname,v_phone,address_text,total,email_text,concat_ws(E'
','WooCommerce order #'||src,nullif(p->>'customer_note',''))) returning id into oid;
  num := public.allocate_order_number(oid); if num is null then raise exception 'Order number counter is not configured'; end if; created := true;
 else update public.orders set customer_name_snapshot=fullname,phone_snapshot=v_phone,address_snapshot=address_text,final_total=total,send_email=email_text,updated_at=now() where id=oid; end if;
 for item in select value from jsonb_array_elements(p->'line_items') loop
  if coalesce(item->>'id','') !~ '^[1-9][0-9]*$' then raise exception 'Invalid line item id'; end if;
  if coalesce(item->>'quantity','') !~ '^[1-9][0-9]*$' then raise exception 'Invalid item quantity'; end if;
  qty := (item->>'quantity')::integer; if qty>100 then raise exception 'Item quantity exceeds import limit'; end if;
  if coalesce(item->>'total','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'Invalid line total'; end if;
  line_total := (item->>'total')::numeric; meta_size := public.woo_meta(item,'גודל');
  wmatch := regexp_match(meta_size,'רוחב[[:space:]]*:[[:space:]]*([0-9]+([.][0-9]+)?)'); hmatch := regexp_match(meta_size,'גובה[[:space:]]*:[[:space:]]*([0-9]+([.][0-9]+)?)');
  if wmatch is null or hmatch is null or cfg->>'dimension_unit' is distinct from 'cm' then raise exception 'Unrecognized dimensions for Woo item %: %',item->>'id',meta_size; end if;
  width := wmatch[1]::numeric/100; height := hmatch[1]::numeric/100;
  if width<=0 or height<=0 or width>50 or height>10 then raise exception 'Dimensions out of range'; end if;
  if coalesce(item->>'name','') ~ '(זברה|ונציאני|רומי|גלילה)' then fam := 'shading'; route := 'external';
  elsif coalesce(item->>'name','') like '%וילון%' then fam := 'curtain'; route := 'internal'; else raise exception 'Unmapped product family for %',item->>'name'; end if;
  items_sum := items_sum+line_total; width_sum := width_sum+width*qty;
  for copy_index in 1..qty loop
   itemkey := (item->>'id')||':'||copy_index; if itemkey=any(keys) then raise exception 'Duplicate Woo line id'; end if; keys := array_append(keys,itemkey);
   item_price := case when copy_index=qty then line_total-round(line_total/qty,2)*(qty-1) else round(line_total/qty,2) end;
   insert into public.order_items(order_id,woo_item_key,family,production_route,subtype,location,width_m,heights_m,sewing_type,is_split,mount_type,fabric_text,color_fabric_text,price,for_execution,item_status,notes,sort_order)
   values(oid,itemkey,fam,route,case when fam='shading' then item->>'name' end,coalesce(public.woo_meta(item,'חדר'),item->>'name'),width,array[height],public.woo_meta(item,'pa_sogtfira','סוג-תפירה'),coalesce(public.woo_meta(item,'pa_vilon','וילון-שלם-או-חצוי') like '%חצוי%',false),public.woo_meta(item,'pa_mesila','סוג-מסילה'),public.woo_meta(item,'pa_colorb','צבע'),public.woo_meta(item,'pa_colorb','צבע'),item_price,true,'new','Woo item '||itemkey||' | '||coalesce(item->>'name','')||' | '||meta_size,item_index)
   on conflict(order_id,woo_item_key) where woo_item_key is not null do update set family=excluded.family,production_route=excluded.production_route,subtype=excluded.subtype,location=excluded.location,width_m=excluded.width_m,heights_m=excluded.heights_m,sewing_type=excluded.sewing_type,is_split=excluded.is_split,mount_type=excluded.mount_type,fabric_text=excluded.fabric_text,color_fabric_text=excluded.color_fabric_text,price=excluded.price,sort_order=excluded.sort_order;
   item_index := item_index+1;
  end loop;
 end loop;
 if exists(select 1 from public.order_items where order_id=oid and woo_item_key is not null and not(woo_item_key=any(keys))) then raise exception 'Woo item removed or quantity reduced; manual review required'; end if;
 update public.orders set items_total=items_sum,total_width_m=width_sum,discount=coalesce(nullif(p->>'discount_total','')::numeric,0) where id=oid;
 insert into public.payments(order_id,woo_payment_key,amount,method,paid_at,received_by,note) values(oid,'woo:'||src,total,coalesce(p->>'payment_method_title',p->>'payment_method'),paid,agent,'תשלום WooCommerce #'||src)
 on conflict(woo_payment_key) where woo_payment_key is not null do update set amount=excluded.amount,method=excluded.method,paid_at=excluded.paid_at;
 if created then insert into public.order_status_history(order_id,to_status,changed_by,note) values(oid,'ready',agent,'הזמנה ששולמה יובאה מ-WooCommerce #'||src); end if;
 insert into public.woocommerce_imports(source_order_id,order_id,source_modified_at,source_data) values(src,oid,modified,data)
 on conflict(source_order_id) do update set source_modified_at=excluded.source_modified_at,source_data=excluded.source_data,imported_at=now();
 return jsonb_build_object('result',case when created then 'created' else 'updated' end,'order_id',oid,'order_number',num,'items',item_index);
end;
$fn$;
revoke all on function public.woo_normalize_phone(text) from public,anon,authenticated;
revoke all on function public.woo_meta(jsonb,text[]) from public,anon,authenticated;
revoke all on function public.ingest_woocommerce_order(text) from public,anon,authenticated;
grant execute on function public.ingest_woocommerce_order(text) to service_role;
notify pgrst,'reload schema';
commit;
