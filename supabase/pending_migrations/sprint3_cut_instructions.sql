-- M1 only: requires corrected 0016 and committed sprint3_cutter_role.sql.
-- Printing produces a draft. Explicit user confirmation activates/locks it.
begin;
create table public.cut_instructions_v1 (
  id uuid primary key,
  order_id uuid not null references public.orders(id),
  item_ids uuid[] not null,
  snapshot jsonb not null,
  status text not null default 'draft' check (status in ('draft','pending','confirmed')),
  created_by uuid not null references public.profiles(id),
  created_role text not null,
  created_at timestamptz not null default now(),
  activated_by uuid references public.profiles(id),
  activated_role text,
  activated_at timestamptz
);
alter table public.cut_instructions_v1 enable row level security;
revoke all on public.cut_instructions_v1 from public, anon, authenticated;
alter table public.order_items add column cut_instruction_id uuid references public.cut_instructions_v1(id);
create index order_items_cut_instruction_idx on public.order_items(cut_instruction_id) where cut_instruction_id is not null;

create function public.require_cut_operator_v1() returns text
language plpgsql security definer set search_path=public as $$
declare v_role text;
begin
  select role::text into v_role from profiles where id=auth.uid() and is_active;
  if v_role is null or v_role not in ('admin','office','cutter') then
    raise exception 'Cut instructions are not permitted' using errcode='42501';
  end if;
  return v_role;
end $$;
revoke all on function public.require_cut_operator_v1() from public,anon,authenticated;

create function public.cut_item_snapshot_v1(i public.order_items) returns jsonb
language sql stable security definer set search_path=public as $$
  select jsonb_build_object('id',i.id,'order_id',i.order_id,'location',i.location,
    'width_m',i.width_m,'heights_m',i.heights_m,'sewing_type',i.sewing_type,
    'hem_cm',i.hem_cm,'shtaif_cm',i.shtaif_cm,'is_split',i.is_split,
    'fabric_text',i.fabric_text,'notes',i.notes,
    'order_number',o.order_number,'customer_name',o.customer_name_snapshot)
  from public.orders o where o.id=i.order_id;
$$;
revoke all on function public.cut_item_snapshot_v1(public.order_items) from public,anon,authenticated;

create function public.cut_queue_v1() returns jsonb
language plpgsql security definer set search_path=public as $$
begin
  perform public.require_cut_operator_v1();
  return jsonb_build_object(
    'items',coalesce((select jsonb_agg(public.cut_item_snapshot_v1(i) ||
      jsonb_build_object('cut_instruction_id',i.cut_instruction_id) order by o.order_number,i.sort_order,i.id)
      from order_items i join orders o on o.id=i.order_id
      where i.family='curtain' and i.for_execution and i.routing_owner='CUTTER'
        and i.routing_state='awaiting_cut' and i.item_status='new'
        and o.status not in ('draft','quote','pending_payment','cancelled','completed')
        and exists(select 1 from payments p where p.order_id=o.id and p.payment_status='received')),'[]'::jsonb),
    'drafts',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc)
      from cut_instructions_v1 d where d.status='draft' and d.created_by=auth.uid()
        and exists(select 1 from orders o where o.id=d.order_id
          and o.status not in ('draft','quote','pending_payment','cancelled','completed')
          and exists(select 1 from payments p where p.order_id=o.id and p.payment_status='received'))
        and not exists(select 1 from unnest(d.item_ids) x left join order_items i on i.id=x
          where i.id is null or i.order_id<>d.order_id or i.cut_instruction_id is not null
            or not i.for_execution or i.family<>'curtain' or i.item_status<>'new'
            or i.routing_owner is distinct from 'CUTTER'::public.item_routing_owner_v1
            or i.routing_state is distinct from 'awaiting_cut'::public.item_routing_state_v1)), '[]'::jsonb)
  );
end $$;
revoke all on function public.cut_queue_v1() from public,anon;
grant execute on function public.cut_queue_v1() to authenticated;

create function public.prepare_cut_instruction_v1(p_id uuid,p_order_id uuid,p_item_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_role text; v_ids uuid[]; v_snapshot jsonb; v_count integer; v_order orders%rowtype; v_existing cut_instructions_v1%rowtype;
begin
  v_role:=public.require_cut_operator_v1();
  if p_id is null or coalesce(cardinality(p_item_ids),0)=0 or array_position(p_item_ids,null) is not null then
    raise exception 'Select at least one item' using errcode='22023';
  end if;
  select array_agg(distinct x order by x) into v_ids from unnest(p_item_ids) x;
  if cardinality(v_ids)<>cardinality(p_item_ids) then raise exception 'Duplicate item IDs'; end if;
  select * into strict v_order from orders where id=p_order_id for update;
  select * into v_existing from cut_instructions_v1 where id=p_id;
  if found then
    if v_existing.created_by<>auth.uid() or v_existing.order_id<>p_order_id or v_existing.item_ids<>v_ids then
      raise exception 'Instruction request conflicts' using errcode='42501';
    end if;
    if v_existing.status<>'draft' then raise exception 'Active instructions cannot be printed again'; end if;
  end if;
  if v_order.status in ('draft','quote','pending_payment','cancelled','completed')
     or not exists(select 1 from payments where order_id=p_order_id and payment_status='received') then
    raise exception 'Order is not available for cutting';
  end if;
  select count(*),jsonb_agg(public.cut_item_snapshot_v1(i) order by i.id) into v_count,v_snapshot
    from order_items i where i.id=any(v_ids) and i.order_id=p_order_id and i.family='curtain'
      and i.for_execution and i.item_status='new' and i.routing_owner='CUTTER'
      and i.routing_state='awaiting_cut' and i.production_route='internal' and i.cut_instruction_id is null;
  if v_count<>cardinality(v_ids) then raise exception 'One or more items are not eligible'; end if;
  if v_existing.id is not null then
    if v_existing.snapshot is distinct from v_snapshot then raise exception 'Draft details changed; prepare a new instruction'; end if;
    return to_jsonb(v_existing);
  end if;
  insert into cut_instructions_v1(id,order_id,item_ids,snapshot,created_by,created_role)
    values(p_id,p_order_id,v_ids,v_snapshot,auth.uid(),v_role) returning * into v_existing;
  return to_jsonb(v_existing);
end $$;
revoke all on function public.prepare_cut_instruction_v1(uuid,uuid,uuid[]) from public,anon;
grant execute on function public.prepare_cut_instruction_v1(uuid,uuid,uuid[]) to authenticated;

create function public.activate_cut_instruction_v1(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_role text; v_instruction cut_instructions_v1%rowtype; v_order orders%rowtype;
  v_order_id uuid; v_snapshot jsonb; v_count integer; v_previous text; v_now timestamptz:=clock_timestamp();
begin
  v_role:=public.require_cut_operator_v1();
  select order_id into strict v_order_id from cut_instructions_v1 where id=p_id and created_by=auth.uid();
  select * into strict v_order from orders where id=v_order_id for update;
  select * into strict v_instruction from cut_instructions_v1 where id=p_id for update;
  if v_instruction.status='pending' then return to_jsonb(v_instruction); end if;
  if v_instruction.status<>'draft' then raise exception 'Instruction is no longer a draft'; end if;
  if v_order.status in ('draft','quote','pending_payment','cancelled','completed')
     or not exists(select 1 from payments where order_id=v_order_id and payment_status='received') then
    raise exception 'Order is not available for cutting';
  end if;
  perform 1 from order_items where id=any(v_instruction.item_ids) order by id for update;
  select count(*),jsonb_agg(public.cut_item_snapshot_v1(i) order by i.id) into v_count,v_snapshot
    from order_items i where i.id=any(v_instruction.item_ids) and i.order_id=v_order_id
      and i.family='curtain' and i.for_execution and i.item_status='new' and i.routing_owner='CUTTER'
      and i.routing_state='awaiting_cut' and i.production_route='internal' and i.cut_instruction_id is null;
  if v_count<>cardinality(v_instruction.item_ids) or v_snapshot is distinct from v_instruction.snapshot then
    raise exception 'Printed details changed or items are already locked; prepare a new instruction';
  end if;
  v_previous:=coalesce(current_setting('kairi.activating_cut_instruction',true),'');
  perform set_config('kairi.activating_cut_instruction',p_id::text,true);
  update cut_instructions_v1 set status='pending',activated_by=auth.uid(),activated_role=v_role,activated_at=v_now where id=p_id;
  update order_items set cut_instruction_id=p_id where id=any(v_instruction.item_ids);
  insert into order_status_history(order_id,order_item_id,from_status,to_status,changed_by,changed_at,note)
    select v_order_id,x,'awaiting_cut','cut_confirmation_pending',auth.uid(),v_now,
      'Cut instruction activated after explicit print confirmation; instruction='||p_id::text||'; role='||v_role
    from unnest(v_instruction.item_ids) x;
  perform set_config('kairi.activating_cut_instruction',v_previous,true);
  select * into v_instruction from cut_instructions_v1 where id=p_id;
  return to_jsonb(v_instruction);
end $$;
revoke all on function public.activate_cut_instruction_v1(uuid) from public,anon;
grant execute on function public.activate_cut_instruction_v1(uuid) to authenticated;

create function public.guard_pending_cut_v1() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if tg_op='DELETE' then
    if old.cut_instruction_id is not null then raise exception 'Pending cut cannot be deleted'; end if;
    return old;
  end if;
  if tg_op='UPDATE' then
    if old.cut_instruction_id is not null and new is distinct from old then
      raise exception 'Pending cut is locked until actual cut confirmation';
    end if;
    if old.family='curtain' and old.routing_owner='CUTTER' and old.item_status='new'
      and new.item_status not in ('new','cancelled') then
      raise exception 'Use cut instructions and actual cut confirmation before advancing';
    end if;
  end if;
  if new.cut_instruction_id is not null then
    if tg_op='INSERT' or new.cut_instruction_id::text is distinct from current_setting('kairi.activating_cut_instruction',true) then
      raise exception 'Only instruction activation may lock an item' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
create trigger order_items_guard_pending_cut_v1 before insert or update or delete on order_items
  for each row execute function public.guard_pending_cut_v1();
create function public.guard_order_pending_cut_v1() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if new.status is distinct from old.status and exists(
    select 1 from order_items where order_id=old.id and cut_instruction_id is not null
  ) then raise exception 'Order has pending cut instructions'; end if;
  return new;
end $$;
create trigger orders_guard_pending_cut_v1 before update of status on orders
  for each row execute function public.guard_order_pending_cut_v1();
-- No direct table access for Cutter. Only the scoped queue/instruction RPCs.
-- Part 3 will add the separate actual-meters confirmation operation.
notify pgrst,'reload schema';
commit;
