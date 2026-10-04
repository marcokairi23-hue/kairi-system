-- DRAFT: dedicated migrations sprint only. Not part of automatic migration discovery.
-- Requires verified production schema through 0015, meter columns (0010),
-- text subtype (0011), existing order_items.production_route and orders.notes.
-- Does not require or authorize stale routing migration 0016.
begin;

create table public.order_creation_requests_v1 (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id),
  payload_hash text not null,
  order_id uuid not null references public.orders(id),
  created_at timestamptz not null default now()
);
alter table public.order_creation_requests_v1 enable row level security;
create policy creation_request_read on public.order_creation_requests_v1
  for select to authenticated using (actor_id = auth.uid());
create policy creation_request_insert on public.order_creation_requests_v1
  for insert to authenticated with check (
    actor_id = auth.uid() and exists (
      select 1 from public.orders o where o.id = order_id and o.agent_id = auth.uid()
    )
  );
grant select, insert on public.order_creation_requests_v1 to authenticated;
revoke update, delete on public.order_creation_requests_v1 from authenticated, anon;

create function public.create_order_v1(p_request_id uuid, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_role text;
  v_route text := p_payload->>'payment_route';
  v_quote boolean;
  v_received boolean;
  v_deposit numeric;
  v_customer uuid;
  v_order uuid;
  v_number integer;
  v_request public.order_creation_requests_v1%rowtype;
  v_item jsonb;
  v_family text;
  v_heights numeric[];
  v_width numeric;
  v_price numeric;
  v_execution boolean;
  v_sort integer := 0;
  v_items_total numeric := 0;
  v_total_width numeric := 0;
  v_quantity numeric;
  v_executable integer := 0;
begin
  select role::text into v_role from public.profiles where id = v_actor and is_active;
  -- Office creation remains an open product decision; preserve V1 Admin/Sales scope.
  if v_actor is null or v_role is null or v_role not in ('admin', 'sales') then
    raise exception 'Order creation is not permitted' using errcode = '42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception 'Request ID and payload are required' using errcode = '22023';
  end if;

  -- Serializes identical retries, including a lost HTTP response after COMMIT.
  perform pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));
  select * into v_request from public.order_creation_requests_v1 where request_id = p_request_id;
  if found then
    if v_request.payload_hash <> md5(p_payload::text) then
      raise exception 'Retry details differ from the saved order; open the saved order before editing'
        using errcode = '22023';
    end if;
    select order_number into strict v_number from public.orders where id = v_request.order_id;
    return jsonb_build_object('id', v_request.order_id, 'order_number', v_number);
  end if;

  if v_route is null or v_route not in ('cash','check','credit_card','bank_transfer','quote') then
    raise exception 'Invalid payment route' using errcode = '22023';
  end if;
  v_quote := v_route = 'quote';
  v_received := v_route in ('cash','check');
  v_deposit := case when v_quote then 0 else (p_payload->>'paid_on_account')::numeric end;
  if not v_quote and (v_deposit is null or v_deposit <= 0 or v_deposit::text in ('NaN','Infinity','-Infinity')) then
    raise exception 'A finite positive deposit is required' using errcode = '22023';
  end if;
  if coalesce(btrim(p_payload->>'customer_name'),'') = ''
     or coalesce(btrim(p_payload->>'phone'),'') = ''
     or coalesce(btrim(p_payload->>'city'),'') = '' then
    raise exception 'Customer name, phone and city are required' using errcode = '22023';
  end if;
  if jsonb_typeof(p_payload->'curtain_items') is distinct from 'array'
     or jsonb_typeof(p_payload->'shading_items') is distinct from 'array'
     or jsonb_typeof(p_payload->'accessories') is distinct from 'array' then
    raise exception 'Item arrays are required' using errcode = '22023';
  end if;

  insert into public.customers(full_name,phone,address,city)
  values (p_payload->>'customer_name',p_payload->>'phone',p_payload->>'address',btrim(p_payload->>'city'))
  returning id into v_customer;

  insert into public.orders(is_quote,status,customer_id,agent_id,customer_name_snapshot,
    phone_snapshot,address_snapshot,items_total,installation_fee,discount,final_total,
    total_width_m,send_email,signature_name,notes)
  values (v_quote,
    (case when v_quote then 'quote' when v_received then 'draft' else 'pending_payment' end)::public.order_status,
    v_customer,v_actor,p_payload->>'customer_name',p_payload->>'phone',p_payload->>'address',0,
    coalesce(nullif(p_payload->>'installation_fee','')::numeric,0),
    coalesce(nullif(p_payload->>'discount','')::numeric,0),
    coalesce(nullif(p_payload->>'final_total','')::numeric,0),0,
    nullif(p_payload->>'send_email',''),nullif(p_payload->>'signature_name',''),nullif(p_payload->>'notes',''))
  returning id into v_order;

  v_number := public.allocate_order_number(v_order);
  if v_number is null then raise exception 'Order number allocation failed'; end if;

  for v_item,v_family in
    select value,'curtain' from jsonb_array_elements(p_payload->'curtain_items')
    union all
    select value,'shading' from jsonb_array_elements(p_payload->'shading_items')
  loop
    v_width := (v_item->>'width_m')::numeric;
    v_price := coalesce(nullif(v_item->>'price','')::numeric,0);
    if v_width is null or not (v_width between 0.30 and 10.00)
       or v_price < 0 or v_price::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Invalid item width or price' using errcode = '22023';
    end if;
    v_execution := not v_quote and coalesce((v_item->>'for_execution')::boolean,false);
    select coalesce(array_agg(btrim(h)::numeric),'{}'::numeric[]) into v_heights
      from unnest(string_to_array(coalesce(v_item->>'heights_m',''),',')) h where btrim(h) <> '';
    insert into public.order_items(order_id,family,production_route,subtype,location,width_m,heights_m,
      sewing_type,hem_cm,shtaif_cm,is_split,fabric_text,mount_type,mechanism_side,color_fabric_text,
      price,for_execution,item_status,notes,sort_order)
    values(v_order,v_family::public.item_family,
      (case when v_family = 'curtain' then 'internal' else 'external' end)::public.production_route,
      case when v_family = 'shading' then v_item->>'subtype' end,
      coalesce(v_item->>'location',''),v_width,v_heights,
      case when v_family = 'curtain' then v_item->>'sewing_type' end,
      case when v_family = 'curtain' then coalesce(nullif(v_item->>'hem_cm','')::numeric,10) end,
      case when v_family = 'curtain' then coalesce(nullif(v_item->>'shtaif_cm','')::numeric,10) end,
      case when v_family = 'curtain' then coalesce((v_item->>'is_split')::boolean,false) end,
      case when v_family = 'curtain' then nullif(v_item->>'fabric_text','') end,
      case when v_family = 'shading' then v_item->>'mount_type' end,
      case when v_family = 'shading' then v_item->>'mechanism_side' end,
      case when v_family = 'shading' then nullif(v_item->>'color_fabric_text','') end,
      v_price,v_execution,'new',nullif(v_item->>'notes',''),v_sort);
    v_sort := v_sort + 1;
    if v_execution then
      v_executable := v_executable + 1;
      v_items_total := v_items_total + v_price;
      v_total_width := v_total_width + v_width;
    end if;
  end loop;
  if not v_quote and v_executable = 0 then
    raise exception 'Select at least one executable item' using errcode = '22023';
  end if;
  for v_item in select value from jsonb_array_elements(p_payload->'accessories') loop
    v_quantity := coalesce(nullif(v_item->>'quantity','')::numeric,0);
    v_price := coalesce(nullif(v_item->>'unit_price','')::numeric,0);
    if v_quantity < 0 or v_price < 0 or v_quantity::text in ('NaN','Infinity','-Infinity')
       or v_price::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Invalid accessory amount' using errcode = '22023';
    end if;
    insert into public.order_accessories(order_id,name_snapshot,quantity,unit_price)
      values(v_order,coalesce(v_item->>'name',''),v_quantity,v_price);
    v_items_total := v_items_total + v_quantity * v_price;
  end loop;
  update public.orders set items_total = v_items_total,total_width_m = v_total_width where id = v_order;

  if not v_quote then
    insert into public.payments(order_id,amount,method,payment_route,payment_status,recorded_by,received_by,paid_at)
    values(v_order,v_deposit,p_payload->>'payment_method',v_route,
      (case when v_received then 'received' else 'pending' end)::public.payment_status,
      v_actor,case when v_received then v_actor end,null);
  end if;
  if v_received then update public.orders set status = 'ready' where id = v_order; end if;
  insert into public.order_status_history(order_id,from_status,to_status,changed_by,note)
  values(v_order,case when v_received then 'draft' end,
    case when v_quote then 'quote' when v_received then 'ready' else 'pending_payment' end,
    v_actor,case when v_quote then 'הצעת מחיר נוצרה'
      when v_received then 'הזמנה נוצרה והועברה לביצוע'
      else 'הזמנה נוצרה והועברה לטיפול בגבייה' end);

  insert into public.order_creation_requests_v1(request_id,actor_id,payload_hash,order_id)
    values(p_request_id,v_actor,md5(p_payload::text),v_order);
  return jsonb_build_object('id',v_order,'order_number',v_number);
end;
$$;
revoke all on function public.create_order_v1(uuid,jsonb) from public, anon;
grant execute on function public.create_order_v1(uuid,jsonb) to authenticated;
notify pgrst, 'reload schema';
commit;
