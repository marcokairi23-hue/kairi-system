-- Integration assertions on the existing test order. All writes roll back.
begin;
do $$
declare
  cfg jsonb;
  merchant uuid := '22222222-2222-4222-8222-222222222222';
  ord public.orders%rowtype;
  normalized_phone text;
  sale uuid := gen_random_uuid();
  result jsonb;
  initial_count bigint;
begin
  select * into strict ord from public.orders where order_number=9087;
  normalized_phone := regexp_replace(regexp_replace(coalesce(ord.phone_snapshot,''),'[ ()-]','','g'), '^(\+972|00972|972)', '0');
  select count(*) into initial_count from public.payments where order_id=ord.id;
  update public.settings set value='{"mode":"off","environment":"production","group_id":"22222222-2222-4222-8222-222222222222"}'::jsonb
    where key='icredit_automation';
  result := public.record_icredit_payment(sale,merchant,'production','9087',normalized_phone,100);
  if result->>'status' <> 'disabled' then raise exception 'OFF gate failed'; end if;
  update public.settings set value=jsonb_set(value,'{mode}','"review"') where key='icredit_automation';
  result := public.record_icredit_payment(gen_random_uuid(),merchant,'production','999999999',normalized_phone,100);
  if result->>'reason' <> 'ORDER_NOT_FOUND' then raise exception 'Unassigned gate failed'; end if;
  result := public.record_icredit_payment(gen_random_uuid(),merchant,'production','9087','0500000000',100);
  if result->>'reason' <> 'PHONE_MISMATCH' then raise exception 'Identity gate failed'; end if;
  update public.orders set final_total=1000,is_quote=false,status='waiting_payment' where id=ord.id;
  result := public.record_icredit_payment(sale,merchant,'production','9087',normalized_phone,100);
  if result->>'reason' <> 'REVIEW_MODE' then raise exception 'Review gate failed'; end if;
  if (select count(*) from public.payments where order_id=ord.id) <> initial_count then
    raise exception 'Review wrote a receipt';
  end if;
  update public.settings set value=jsonb_set(value,'{mode}','"live"') where key='icredit_automation';
  result := public.record_icredit_payment(gen_random_uuid(),merchant,'production','9087',normalized_phone,1001);
  if result->>'reason' <> 'EXCEEDS_BALANCE' then raise exception 'Balance gate failed'; end if;
  result := public.record_icredit_payment(sale,merchant,'production','9087',normalized_phone,100);
  if result->>'status' <> 'recorded' then raise exception 'Receipt recording failed'; end if;
  if (select final_total - coalesce((select sum(amount) from public.payments where order_id=ord.id and payment_status::text='received'),0)
      from public.orders where id=ord.id) <> 900 then raise exception 'Deposit remaining balance failed'; end if;
  if (select status::text from public.orders where id=ord.id) <> 'waiting_payment' then
    raise exception 'A deposit incorrectly completed or approved the order';
  end if;
  result := public.record_icredit_payment(sale,merchant,'production','9087',normalized_phone,100);
  if result->>'status' <> 'duplicate' then raise exception 'Idempotency failed'; end if;
  if (select count(*) from public.payments where order_id=ord.id) <> initial_count + 1 then
    raise exception 'Wrong receipt count';
  end if;
  update public.settings set value=jsonb_set(value,'{mode}','"off"') where key='icredit_automation';
  result := public.record_icredit_payment(gen_random_uuid(),merchant,'production','9087',normalized_phone,100);
  if result->>'status' <> 'disabled' then raise exception 'Disable after activation failed'; end if;
  if has_function_privilege('authenticated','public.record_icredit_payment(uuid,uuid,text,text,text,numeric)','execute')
    or has_function_privilege('anon','public.record_icredit_payment(uuid,uuid,text,text,text,numeric)','execute') then
    raise exception 'Untrusted role can record receipts';
  end if;
  begin
    update public.settings set value='{"mode":"live","environment":"test","group_id":"22222222-2222-4222-8222-222222222222"}'::jsonb
      where key='icredit_automation';
    raise exception 'Expected test environment rejection' using errcode='P0002';
  exception when raise_exception then null;
  end;
end $$;
rollback;
select 'iCredit database: OFF, identity, review, balance, atomic receipt, duplicate, role grants, test environment and disable checks passed; all writes rolled back' as result;
