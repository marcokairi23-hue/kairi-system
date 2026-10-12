begin;

-- The release starts OFF. Only Admin can change settings under existing RLS.
insert into public.settings(key, value) values ('icredit_automation',
  '{"mode":"off","group_id":null,"environment":"production"}'::jsonb)
on conflict (key) do nothing;

create table public.icredit_events (
  sale_id uuid primary key,
  order_id uuid references public.orders(id),
  order_number text not null,
  amount numeric(12,2) not null check (amount > 0),
  status text not null check (status in ('review','recorded')),
  reason text not null,
  payment_id uuid references public.payments(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.icredit_events enable row level security;
revoke all on public.icredit_events from anon, authenticated;
grant select on public.icredit_events to authenticated;
grant all on public.icredit_events to service_role;
create policy icredit_events_office_read on public.icredit_events for select to authenticated
  using (public.current_role() in ('admin','office'));

alter table public.payments add column if not exists provider text,
  add column if not exists provider_sale_id text;
create unique index if not exists payments_icredit_sale_unique
  on public.payments(provider_sale_id) where provider = 'icredit';

create function public.validate_icredit_settings() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.key = 'icredit_automation' then
    if coalesce(new.value->>'mode','') not in ('off','review','live')
      or coalesce(new.value->>'environment','') not in ('production','test') then
      raise exception 'Invalid iCredit settings';
    end if;
    if new.value->>'mode' <> 'off' then
      if coalesce(new.value->>'group_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'A verified iCredit GroupId is required';
      end if;
      if new.value->>'mode' = 'live' and new.value->>'environment' <> 'production' then
        raise exception 'Test payments cannot be recorded in the production ledger';
      end if;
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
create trigger validate_icredit_settings before insert or update on public.settings
  for each row execute function public.validate_icredit_settings();

-- Invoker rights + service_role-only execution: browser users cannot forge receipts.
-- The settings lock serializes receipt commits with the admin OFF switch.
create function public.record_icredit_payment(
  p_sale_id uuid, p_group_id uuid, p_environment text,
  p_order_number text, p_phone text, p_amount numeric
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  cfg jsonb;
  ord public.orders%rowtype;
  ev public.icredit_events%rowtype;
  receipt uuid;
  paid numeric;
  reason text;
begin
  select value into cfg from public.settings where key = 'icredit_automation' for share;
  if cfg is null or cfg->>'mode' = 'off' then
    return jsonb_build_object('status','disabled','payment_recorded',false);
  end if;
  if lower(cfg->>'group_id') is distinct from lower(p_group_id::text)
    or cfg->>'environment' is distinct from p_environment then
    raise exception 'iCredit merchant or environment mismatch';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2)
    or p_amount::text in ('NaN','Infinity','-Infinity') then
    raise exception 'Invalid payment amount';
  end if;
  -- Serializes simultaneous retries even before an event exists.
  perform pg_advisory_xact_lock(hashtextextended(p_sale_id::text, 0));
  select * into ev from public.icredit_events where sale_id = p_sale_id;
  if found and ev.status = 'recorded' then
    return jsonb_build_object('status','duplicate','payment_recorded',false,'payment_id',ev.payment_id);
  end if;
  if p_order_number ~ '^[0-9]{1,9}$' then
    select * into ord from public.orders where order_number = p_order_number::integer for update;
  end if;
  if ord.id is null then reason := 'ORDER_NOT_FOUND';
  elsif regexp_replace(regexp_replace(coalesce(ord.phone_snapshot,''),'[ ()-]','','g'), '^(\+972|00972|972)', '0')
    is distinct from p_phone or p_phone !~ '^0[2-9][0-9]{7,8}$' then reason := 'PHONE_MISMATCH';
  elsif ord.status::text in ('draft','quote','cancelled') or ord.is_quote then reason := 'ORDER_NOT_PAYABLE';
  else
    select coalesce(sum(amount),0) into paid from public.payments
      where order_id = ord.id and payment_status::text = 'received';
    if ord.final_total is null or p_amount > ord.final_total - paid then reason := 'EXCEEDS_BALANCE';
    elsif cfg->>'mode' = 'review' then reason := 'REVIEW_MODE';
    end if;
  end if;
  if reason is not null then
    insert into public.icredit_events(sale_id,order_id,order_number,amount,status,reason)
      values(p_sale_id,ord.id,coalesce(p_order_number,''),p_amount,'review',reason)
    on conflict(sale_id) do update set reason=excluded.reason,order_id=excluded.order_id,updated_at=now();
    return jsonb_build_object('status','review','reason',reason,'payment_recorded',false);
  end if;
  -- Do not duplicate an iCredit receipt that predates this integration.
  select id into receipt from public.payments
    where provider = 'icredit' and provider_sale_id = p_sale_id::text;
  if receipt is not null then
    return jsonb_build_object('status','duplicate','payment_recorded',false,'payment_id',receipt);
  end if;
  insert into public.payments(order_id,amount,method,paid_at,payment_status,payment_route,provider,provider_sale_id,note)
    values(ord.id,p_amount,'אשראי',now(),'received','credit_card','icredit',p_sale_id::text,'תשלום iCredit מאומת אוטומטית')
    returning id into receipt;
  -- Financial verification records a receipt; production approval remains an office decision.
  insert into public.icredit_events(sale_id,order_id,order_number,amount,status,reason,payment_id)
    values(p_sale_id,ord.id,p_order_number,p_amount,'recorded','VERIFIED',receipt)
  on conflict(sale_id) do update set status='recorded',reason='VERIFIED',payment_id=excluded.payment_id,updated_at=now();
  insert into public.audit_log(action,table_name,record_id,after)
    values('icredit_payment_recorded','payments',receipt::text,
      jsonb_build_object('sale_id',p_sale_id,'order_id',ord.id,'amount',p_amount));
  return jsonb_build_object('status','recorded','payment_recorded',true,'payment_id',receipt);
end $$;
revoke all on function public.record_icredit_payment(uuid,uuid,text,text,text,numeric) from public,anon,authenticated;
grant execute on function public.record_icredit_payment(uuid,uuid,text,text,text,numeric) to service_role;
commit;
