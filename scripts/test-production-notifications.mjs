import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createProductionTestDb, asActor, actors, ids, orders, rpc, notificationFeed, readNotification } from './production-test-db.mjs'
let passed = 0
async function test(name,run,options = {}) {
  const db = await createProductionTestDb(undefined,options)
  try { await run(db); passed++; console.log(`PASS ${name}`) } finally { await db.close() }
}
async function taskFor(db,item) { return (await db.query("select * from public.production_tasks where item_key=$1 and status='active'",[item])).rows[0] }
async function eventsFor(db,item) { return (await db.query('select * from public.production_tasks where item_key=$1 order by instance_no',[item])).rows }
async function recipient(db,task,user) { return (await db.query('select * from public.production_task_recipients where task_id=$1 and user_id=$2',[task,user])).rows[0] }
await test('initialization creates only notification metadata, leaving existing orders/items/history unchanged',async db => {
  const before=[]
  for (const table of ['orders','order_items','payments','order_status_history']) before.push((await db.query(`select * from public.${table} order by id`)).rows)
  await db.exec(readFileSync(new URL('../supabase/migrations/20261013235303_production_notifications_v1.sql',import.meta.url),'utf8'))
  const after=[]
  for (const table of ['orders','order_items','payments','order_status_history']) after.push((await db.query(`select * from public.${table} order by id`)).rows)
  assert.deepEqual(after,before)
  assert.equal((await asActor(db,actors.office,tx => notificationFeed(tx))).active_total,5)
},{ notifications:false })
await test('only existing eligible transitions create tasks, stable across fetch and item edits',async db => {
  await asActor(db,actors.office,async tx => {
    const first = await notificationFeed(tx), second = await notificationFeed(tx)
    assert.equal(first.active_total,5); assert.equal(first.unread_active,5)
    assert.deepEqual(first.tasks.map(t => t.id),second.tasks.map(t => t.id))
    for (const id of [ids.quoteItem,ids.done,ids.issue]) assert.ok(!first.tasks.some(t => t.item_key===id))
    const task = first.tasks.find(t => t.item_key===ids.curtain)
    await tx.query('update public.order_items set width_m=3 where id=$1',[ids.curtain])
    assert.equal((await notificationFeed(tx)).tasks.find(t => t.item_key===ids.curtain).id,task.id)
  })
})
await test('same instance delivered to two OFFICE users before fetch, with separate server availability',async db => {
  const task = await taskFor(db,ids.curtain)
  for (const actor of [actors.office,actors.otherOffice]) {
    const delivery = await recipient(db,task.id,actor)
    assert.ok(delivery.available_at); assert.equal(delivery.first_read_at,null)
    const feed = await asActor(db,actor,tx => notificationFeed(tx))
    assert.equal(feed.tasks.find(t => t.item_key===ids.curtain).id,task.id)
  }
})
await test('personal first read uses server time, survives retries and cannot become unread',async db => {
  const task = await taskFor(db,ids.curtain)
  await asActor(db,actors.office,async tx => {
    await tx.query("update public.production_task_recipients set first_read_at='2099-01-01' where task_id=$1 and user_id=$2",[task.id,actors.office])
    const first = await readNotification(tx,task.id), again = await readNotification(tx,task.id)
    assert.equal(new Date(first).getTime(),new Date(again).getTime()); assert.ok(new Date(first).getFullYear()<2099)
    await tx.query('update public.production_task_recipients set first_read_at=null where task_id=$1 and user_id=$2',[task.id,actors.office])
    assert.equal(new Date(await readNotification(tx,task.id)).getTime(),new Date(first).getTime())
    const feed = await notificationFeed(tx)
    assert.equal(feed.active_total,5); assert.equal(feed.unread_active,4)
  },true)
  assert.equal((await recipient(db,task.id,actors.otherOffice)).first_read_at,null)
  const other = await asActor(db,actors.otherOffice,tx => notificationFeed(tx))
  assert.equal(other.unread_active,5)
})
await test('business success closes shared task, records actor/time, preserves other user unread',async db => {
  const task = await taskFor(db,ids.curtain)
  await asActor(db,actors.office,async tx => { await readNotification(tx,task.id); await rpc(tx,[ids.curtain]) },true)
  for (const actor of [actors.office,actors.otherOffice]) {
    const active = await asActor(db,actor,tx => notificationFeed(tx))
    assert.ok(!active.tasks.some(t => t.id===task.id))
    const finished = (await asActor(db,actor,tx => notificationFeed(tx,'history'))).tasks.find(t => t.id===task.id)
    assert.equal(finished.status,'completed'); assert.equal(finished.closed_by,actors.office); assert.ok(finished.closed_at)
    assert.equal(finished.first_read_at===null,actor===actors.otherOffice)
  }
  const instances = await eventsFor(db,ids.curtain)
  assert.equal(instances.length,2); assert.equal(instances[1].previous_task_id,task.id)
})
await test('failed and duplicate business requests cannot complete or duplicate task instances',async db => {
  const task = await taskFor(db,ids.curtain)
  await assert.rejects(asActor(db,actors.sales,tx => rpc(tx,[ids.curtain])),error => error.code==='42501')
  assert.equal((await taskFor(db,ids.curtain)).id,task.id)
  await asActor(db,actors.office,tx => rpc(tx,[ids.curtain]),true)
  await assert.rejects(asActor(db,actors.otherOffice,tx => rpc(tx,[ids.curtain])),error => error.code==='40001')
  assert.equal((await eventsFor(db,ids.curtain)).length,2)
  assert.equal((await eventsFor(db,ids.curtain)).filter(t => t.status==='completed').length,1)
})
await test('direct UPDATE shares lifecycle with RPC; unchanged retry creates no new event',async db => {
  await asActor(db,actors.otherOffice,async tx => {
    await tx.query("update public.order_items set item_status='preparation' where id=$1",[ids.curtain])
    await tx.query("update public.order_items set item_status='preparation' where id=$1",[ids.curtain])
  },true)
  assert.equal((await eventsFor(db,ids.curtain)).length,2)
  assert.equal((await db.query('select count(*)::int as n from public.order_status_history where order_item_id=$1',[ids.curtain])).rows[0].n,1)
})
await test('removal from execution cancels with reason; restored eligibility creates linked new instance',async db => {
  const initial = await taskFor(db,ids.curtain)
  await asActor(db,actors.office,async tx => {
    await readNotification(tx,initial.id)
    await tx.query('update public.order_items set for_execution=false where id=$1',[ids.curtain])
    await tx.query('update public.order_items set for_execution=true where id=$1',[ids.curtain])
  },true)
  const instances = await eventsFor(db,ids.curtain)
  assert.equal(instances[0].status,'cancelled'); assert.equal(instances[0].close_reason,'removed_from_execution')
  assert.equal(instances[1].status,'active'); assert.equal(instances[1].previous_task_id,initial.id)
  assert.ok((await recipient(db,initial.id,actors.office)).first_read_at)
  assert.equal((await recipient(db,instances[1].id,actors.office)).first_read_at,null)
})
await test('order cancellation archives tasks for both OFFICE users without marking them read',async db => {
  await asActor(db,actors.office,tx => tx.query("update public.orders set status='cancelled' where id=$1",[orders.mixed]),true)
  for (const actor of [actors.office,actors.otherOffice]) {
    const history = (await asActor(db,actor,tx => notificationFeed(tx,'history'))).tasks
    assert.equal(history.length,4)
    assert.ok(history.every(t => t.close_reason==='order_cancelled' && t.first_read_at===null))
  }
})
await test('financial receipt alone creates no task; explicit approval gates availability',async db => {
  await asActor(db,actors.office,tx => tx.query('update public.orders set payment_approved=false where id=$1',[orders.mixed]),true)
  await asActor(db,actors.office,tx => tx.query("insert into public.payments(order_id,amount,provider) values($1,500,'manual')",[orders.mixed]),true)
  assert.equal((await asActor(db,actors.office,tx => notificationFeed(tx))).active_total,1)
  await asActor(db,actors.office,tx => tx.query('update public.orders set payment_approved=true where id=$1',[orders.mixed]),true)
  assert.equal((await asActor(db,actors.office,tx => notificationFeed(tx))).active_total,5)
})
await test('issue blocks completion task; resolution reopens a new instance with old history intact',async db => {
  const prior = await taskFor(db,ids.readyCurtain)
  await asActor(db,actors.office,tx => tx.query("update public.order_items set issue_kind='defect',issue_note='synthetic issue' where id=$1",[ids.readyCurtain]),true)
  assert.equal((await eventsFor(db,ids.readyCurtain))[0].close_reason,'issue_open')
  await asActor(db,actors.office,tx => tx.query('update public.order_items set issue_kind=null,issue_note=null where id=$1',[ids.readyCurtain]),true)
  const reopened = await taskFor(db,ids.readyCurtain)
  assert.notEqual(reopened.id,prior.id); assert.equal(reopened.previous_task_id,prior.id)
})
await test('deleted item retains cancelled snapshot history',async db => {
  const task = await taskFor(db,ids.curtain)
  await asActor(db,actors.office,tx => tx.query('delete from public.order_items where id=$1',[ids.curtain]),true)
  const history = (await asActor(db,actors.otherOffice,tx => notificationFeed(tx,'history'))).tasks.find(t => t.id===task.id)
  assert.equal(history.status,'cancelled'); assert.equal(history.close_reason,'item_deleted')
  assert.equal(history.order_item_id,null); assert.equal(history.item_key,ids.curtain)
})
await test('viewer/sales/inactive/anonymous outside audience; SALES ready action still closes OFFICE task',async db => {
  for (const actor of [actors.viewer,actors.sales,actors.otherSales,actors.inactive]) {
    await assert.rejects(asActor(db,actor,tx => notificationFeed(tx)),error => error.code==='42501')
    await asActor(db,actor,async tx => assert.equal((await tx.query('select * from public.production_tasks')).rows.length,0))
  }
  const shading=await taskFor(db,ids.shading)
  await asActor(db,actors.sales,tx => rpc(tx,[ids.shading],'advance','ready'),true)
  const completed=(await eventsFor(db,ids.shading)).find(task => task.id===shading.id)
  assert.equal(completed.status,'completed'); assert.equal(completed.closed_by,actors.sales)
  const inaccessible = await taskFor(db,ids.other)
  await assert.rejects(asActor(db,actors.sales,tx => readNotification(tx,inaccessible.id)),error => error.code==='42501')
  await db.exec('begin; set local role anon;')
  try { await assert.rejects(notificationFeed(db),error => error.code==='42501') } finally { await db.exec('rollback') }
})
await test('user cannot edit other read state, availability, lifecycle, or privileged helpers',async db => {
  const task = await taskFor(db,ids.curtain)
  await asActor(db,actors.office,async tx => {
    const result = await tx.query('update public.production_task_recipients set first_read_at=clock_timestamp() where task_id=$1 and user_id=$2 returning task_id',[task.id,actors.otherOffice])
    assert.equal(result.rows.length,0)
  },true)
  assert.equal((await recipient(db,task.id,actors.otherOffice)).first_read_at,null)
  for (const sql of ['update public.production_task_recipients set available_at=clock_timestamp()',
    'delete from public.production_task_recipients','delete from public.production_tasks',
    "update public.production_tasks set status='completed'",'select production_private.deliver_task(t) from public.production_tasks t']) {
    await assert.rejects(asActor(db,actors.office,tx => tx.query(sql)),error => error.code==='42501')
  }
})
await test('newly active OFFICE receives current tasks with availability time after task creation',async db => {
  const task = await taskFor(db,ids.curtain)
  assert.equal(await recipient(db,task.id,actors.inactive),undefined)
  await asActor(db,actors.admin,tx => tx.query('update public.profiles set is_active=true where id=$1',[actors.inactive]),true)
  const feed = await asActor(db,actors.inactive,tx => notificationFeed(tx))
  assert.equal(feed.active_total,5)
  const delivery = await recipient(db,task.id,actors.inactive)
  assert.ok(new Date(delivery.available_at)>=new Date(task.created_at)); assert.equal(delivery.first_read_at,null)
})
await test('real order RLS is rechecked for an OFFICE recipient with synthetic narrowed access',async db => {
  const task = await taskFor(db,ids.other)
  await db.exec(`drop policy office_orders on public.orders;
    create policy test_office_order_scope on public.orders for all to authenticated
      using (public.current_role()::text in ('admin','office') and (auth.uid()<>'${actors.otherOffice}'::uuid or id='${orders.mixed}'::uuid))
      with check (public.current_role()::text in ('admin','office') and (auth.uid()<>'${actors.otherOffice}'::uuid or id='${orders.mixed}'::uuid));`)
  const feed=await asActor(db,actors.otherOffice,tx => notificationFeed(tx))
  assert.equal(feed.active_total,4); assert.ok(!feed.tasks.some(row => row.id===task.id))
  await assert.rejects(asActor(db,actors.otherOffice,tx => readNotification(tx,task.id)),error => error.code==='42501')
  await asActor(db,actors.otherOffice,async tx => assert.equal((await tx.query('select id from public.production_tasks where id=$1',[task.id])).rows.length,0))
  assert.equal((await recipient(db,task.id,actors.otherOffice)).first_read_at,null)
})
await test('notification failure rolls back business status, item history and both task stages',async db => {
  await db.exec(`create function public.test_notification_failure() returns trigger language plpgsql as $$
    begin raise exception 'Synthetic task failure'; end $$;
    create trigger test_notification_failure before update on public.production_tasks
      for each row execute function public.test_notification_failure();`)
  await assert.rejects(asActor(db,actors.office,tx => rpc(tx,[ids.curtain])),/Synthetic task failure/)
  assert.equal((await eventsFor(db,ids.curtain)).length,1)
  assert.equal((await taskFor(db,ids.curtain)).from_status,'new')
  assert.equal((await db.query('select item_status::text,production_version from public.order_items where id=$1',[ids.curtain])).rows[0].production_version,0)
  assert.equal((await db.query('select count(*)::int as n from public.order_status_history where order_item_id=$1',[ids.curtain])).rows[0].n,0)
})
await test('cursor pages have no duplicates and counts include read but unfinished tasks',async db => {
  await asActor(db,actors.office,async tx => {
    const first = await notificationFeed(tx,'active',2)
    assert.equal(first.tasks.length,2); assert.equal(first.has_more,true); assert.equal(first.active_total,5)
    const second = await notificationFeed(tx,'active',2,first.tasks[1])
    const third = await notificationFeed(tx,'active',2,second.tasks[1])
    assert.equal(new Set([...first.tasks,...second.tasks,...third.tasks].map(t => t.id)).size,5)
    assert.equal(third.has_more,false)
    await readNotification(tx,first.tasks[0].id)
    assert.equal((await notificationFeed(tx)).active_total,5)
  })
})
console.log(`${passed} notification suites passed; authenticated identities and isolated database only.`)
