begin;

do $$
begin
  if (select typtype from pg_type where oid = 'public.order_status'::regtype) <> 'e' then
    raise exception 'public.order_status is not an enum';
  end if;
end $$;

-- Additive only: preserve legacy labels and all historical order rows.
alter type public.order_status add value if not exists 'draft';
alter type public.order_status add value if not exists 'quote';
alter type public.order_status add value if not exists 'waiting_payment';
alter type public.order_status add value if not exists 'new_execution';
alter type public.order_status add value if not exists 'in_execution';
alter type public.order_status add value if not exists 'ready';
alter type public.order_status add value if not exists 'completed';

commit;
