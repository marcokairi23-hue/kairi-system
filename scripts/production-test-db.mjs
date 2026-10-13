import { readFileSync } from 'node:fs'
import { PGlite } from '../.v1-test-deps/node_modules/@electric-sql/pglite/dist/index.js'

export const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
export const actors = { admin: uid(1), office: uid(2), sales: uid(3), otherSales: uid(4), viewer: uid(5), inactive: uid(6), otherOffice: uid(7) }
export const orders = { mixed: uid(100), other: uid(101) }
export const ids = { curtain: uid(201), shading: uid(202), readyCurtain: uid(203), quoteItem: uid(204), done: uid(205), issue: uid(206), other: uid(207), newShading: uid(208) }

export async function createProductionTestDb(db = new PGlite(), { notifications = true } = {}) {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid;
    $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
  `)
  // Actual repository schema and policies, with synthetic auth infrastructure.
  const baseline = [
    '0001_initial_schema.sql', '0002_ready_status_and_item_timestamps.sql',
    '0004_status_flow.sql', '00045_baseline_contract_repair.sql',
    '0006_item_assigned_worker.sql', '0009_history_rls_ownership.sql',
    '0010_units_meters_step1.sql', '0011_shading_subtype_text.sql',
    '0012_feature_flags.sql', '0015_order_payment_v1.sql',
    '0016_item_status_v1.sql', '0017_order_status_v1.sql', '0018_collections_v1.sql',
    '20261012201622_icredit_automation.sql', '20261012203335_item_issues.sql',
  ]
  for (const name of baseline) {
    try { await db.exec(readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8')) }
    catch (error) { throw new Error(`Baseline ${name}: ${error.message}`, { cause: error }) }
  }
  await db.exec('grant all on all tables in schema public to authenticated; grant usage,select on all sequences in schema public to authenticated;')
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013235255_v1_production_task_permissions.sql', import.meta.url), 'utf8'))
  if (notifications) await db.exec(readFileSync(new URL('../supabase/migrations/20261013235303_production_notifications_v1.sql', import.meta.url), 'utf8'))
  for (const [role, id] of Object.entries(actors)) {
    await db.query('insert into auth.users(id,email) values($1,$2)', [id, `${role}@example.invalid`])
    await db.query('update public.profiles set full_name=$2,role=$3::public.user_role,is_active=$4 where id=$1',
      [id, role, role === 'otherSales' ? 'sales' : ['inactive','otherOffice'].includes(role) ? 'office' : role, role !== 'inactive'])
  }
  for (const [name, id] of Object.entries(orders)) {
    await db.query(`insert into public.orders(id,order_number,agent_id,customer_name_snapshot,status,payment_approved,final_total)
      values($1,$2,$3,$4,'in_execution',true,0)`, [id, name === 'mixed' ? 99901 : 99902, name === 'mixed' ? actors.sales : actors.otherSales, `בדיקה ${name}`])
  }
  const fixture = [
    ['curtain', 'curtain', 'new', actors.office, true, null],
    ['shading', 'shading', 'preparation', actors.otherSales, true, null],
    ['readyCurtain', 'curtain', 'ready', actors.sales, true, null],
    ['quoteItem', 'curtain', 'new', null, false, null],
    ['done', 'curtain', 'done', null, true, null],
    ['issue', 'curtain', 'ready', actors.office, true, 'defect'],
    ['other', 'curtain', 'new', actors.otherSales, true, null],
    ['newShading', 'shading', 'new', actors.sales, true, null],
  ]
  for (const [name,family,status,worker,execution,issue] of fixture) {
    await db.query(`insert into public.order_items(id,order_id,family,subtype,location,width_m,heights_m,item_status,assigned_worker,for_execution,issue_kind,issue_note)
      values($1,$2,$3::public.item_family,$4,$5,2,array[2.5],$6::public.item_status,$7,$8,$9,$10)`,
    [ids[name], name === 'other' ? orders.other : orders.mixed, family, family === 'shading' ? 'גלילה' : null,
      name, status, worker, execution, issue, issue ? 'תקלה מלאכותית' : null])
  }
  return db
}

export async function asActor(db, actor, fn, commit = false) {
  // Rollback by default: tests never depend on changes from preceding cases.
  await db.exec('begin; set local role authenticated;')
  await db.query("select set_config('request.jwt.claim.sub',$1,true)", [actor])
  try {
    const result = await fn(db)
    await db.exec(commit ? 'commit' : 'rollback')
    return result
  } catch (error) { await db.exec('rollback'); throw error }
}

export function rpc(db, chosen, action = 'advance', next = 'preparation') {
  return db.query('select public.production_mutate_v1($1::jsonb,$2,$3) as affected',
    [JSON.stringify(chosen.map(i => typeof i === 'string' ? { id:i, version:0 } : i)), action, next])
}

export async function notificationFeed(db, state = 'active', limit = 50, cursor = null) {
  return (await db.query('select public.production_notifications_v1($1,$2::timestamptz,$3::uuid,$4) as feed',
    [state,cursor?.cursor_at ?? null,cursor?.id ?? null,limit])).rows[0].feed
}

export async function readNotification(db, task) {
  return (await db.query('select public.production_notification_read_v1($1::uuid) as first_read_at',[task])).rows[0].first_read_at
}
