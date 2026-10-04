// Local-only PostgreSQL tests. No .env files, network or production credentials.
// npm install --prefix <temporary-directory> --no-package-lock @electric-sql/pglite
// node scripts/test-sprint1.mjs <temporary-directory>/node_modules/@electric-sql/pglite/dist/index.js
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'

process.on('uncaughtException', error => {
  console.error('FAIL:', error.message, error.code ?? '', error.where ?? '')
  process.exit(1)
})

async function loadTS(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'esm' })
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'))
}
if(process.argv.includes('--cutting') && !process.argv.includes('--routing')) process.argv.push('--routing')
const { sumReceivedPayments } = await loadTS('src/lib/payments.ts')
assert.equal(sumReceivedPayments([
  { amount: 100, payment_status: 'received' },
  ...['pending','rejected',null,undefined,'unknown'].map(payment_status => ({ amount: 200, payment_status })),
]), 100)
assert.equal(sumReceivedPayments([]), 0)
const { orderCreationPayload, requireCreatedOrder } = await loadTS('src/pages/orders/createOrder.ts')
const { emptyForm, newCurtainItem, newShadingItem } = await loadTS('src/pages/orders/types.ts')
const form = {
  ...emptyForm('Test'), customer_name: 'Local test', phone: '0500000000', city: 'Test',
  paid_on_account: '100', final_total: '500', signatureDataUrl: 'private-signature',
  curtain_items: [{ ...newCurtainItem(), width_m: '2', heights_m: '2.4,2.5', price: '200', for_execution: true }],
  shading_items: [{ ...newShadingItem(), subtype: 'roman',
    width_m: '1', heights_m: '2', price: '250', for_execution: true }],
  accessories: [{ id: 'local', name: 'Accessory', quantity: '2', unit_price: '25' }],
}
const payload = orderCreationPayload(form,'cash')
assert.equal('signatureDataUrl' in payload,false)
assert.equal('roman_internal_fabric_cut' in payload.shading_items[0],false)
assert.equal(orderCreationPayload(form,'quote').shading_items[0].for_execution,false)
assert.throws(() => requireCreatedOrder(null))
assert.throws(() => requireCreatedOrder({ id: 'x', order_number: null }))
console.log('PASS: received-only balance, mixed payload, quote selection, response validation')
if (!process.argv[2]) throw Error('Supply the local PGlite module path for database validation')
const { PGlite } = await import(pathToFileURL(process.argv[2]).href)
const db = new PGlite()
const sqlFile = name => readFile('supabase/migrations/' + name,'utf8')
await db.exec(`
  create role authenticated; create role anon;
  create schema auth;
  create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  grant usage on schema auth to authenticated,anon;
  grant execute on function auth.uid() to authenticated,anon;
`)
await db.exec(await sqlFile('0001_initial_schema.sql'))
for (const name of ['0006_item_assigned_worker.sql','0009_history_rls_ownership.sql',
  '0010_units_meters_step1.sql','0011_shading_subtype_text.sql','0015_payment_gate_v1.sql']) {
  await db.exec(await sqlFile(name))
}
// Existing application columns missing from the committed historical chain.
// This fixture is explicit; it does not claim the production schema was verified.
await db.exec(`create type public.production_route as enum ('internal','external');
  alter table public.order_items add column production_route public.production_route not null default 'internal';
  alter table public.orders add column notes text;
  grant usage on schema public to authenticated;
  grant select,insert,update,delete on all tables in schema public to authenticated;`)
await db.exec(await readFile('supabase/pending_migrations/sprint1_atomic_order_creation.sql','utf8'))
if (process.argv.includes('--routing')) {
  const historicalActor=randomUUID(), historicalOrder=randomUUID()
  await db.query('insert into auth.users(id,email) values ($1,$2)',[historicalActor,'historical@local.test'])
  await db.query("insert into orders(id,agent_id,customer_name_snapshot,status) values($1,$2,'Historical','ready')",[historicalOrder,historicalActor])
  await db.query("insert into payments(order_id,amount,payment_status,payment_route,recorded_by,received_by) values($1,100,'received','cash',$2,$2)",[historicalOrder,historicalActor])
  for(const status of ['new','cut']) await db.query("insert into order_items(order_id,family,subtype,location,width_m,production_route,item_status) values($1,'shading','roman','fixture',1,'internal',$2)",[historicalOrder,status])
  await db.exec(await sqlFile('0016_initial_item_routing_v1.sql'))
  const history=(await db.query('select * from order_items where order_id=$1 order by item_status',[historicalOrder])).rows
  const fresh=history.find(i=>i.item_status==='new'), progressed=history.find(i=>i.item_status==='cut')
  assert.equal(fresh.routing_owner,'OFFICE_SUPPLIER')
  assert.equal(progressed.routing_state,'legacy_unverified')
  assert.equal(progressed.item_status,'cut')
  assert.equal(progressed.routing_owner,null)
  assert.equal((await db.query('select * from order_status_history where order_id=$1',[historicalOrder])).rows.length,2)
  console.log('PASS: backfill routes new Roman to Office; progressed conflicting Roman held for review with audit')
}
const sales = randomUUID(), viewer = randomUUID(), office = randomUUID(), admin = randomUUID()
for (const [id,role] of [[sales,'sales'],[viewer,'viewer'],[office,'office'],[admin,'admin']]) {
  await db.query('insert into auth.users(id,email) values ($1,$2)',[id,role+'@local.test'])
  await db.query('update profiles set role=$2 where id=$1',[id,role])
}
async function asActor(id) {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id])
  await db.exec('set role authenticated')
}
const create = async (request,body) => (await db.query(
  'select create_order_v1($1,$2::jsonb) as result',[request,JSON.stringify(body)])).rows[0].result
async function counts() {
  return (await db.query(`select
    (select count(*)::int from customers) customers,
    (select count(*)::int from orders) orders,
    (select count(*)::int from order_items) items,
    (select count(*)::int from order_accessories) accessories,
    (select count(*)::int from payments) payments,
    (select count(*)::int from order_status_history) history,
    (select count(*)::int from order_creation_requests_v1) requests,
    (select value->>'next' from settings where key='order_counter') counter`)).rows[0]
}
await asActor(sales)
for (const route of ['cash','check','credit_card','bank_transfer','quote']) {
  const body = orderCreationPayload(form,route), key=randomUUID()
  const result = await create(key,body)
  assert.equal(typeof result.order_number,'number')
  const beforeRetry = await counts()
  assert.deepEqual(await create(key,body),result)
  assert.deepEqual(await counts(),beforeRetry)
  await assert.rejects(create(key,{ ...body,final_total:'501' }))
  const order=(await db.query('select * from orders where id=$1',[result.id])).rows[0]
  assert.equal(order.status,route==='quote'?'quote':['cash','check'].includes(route)?'ready':'pending_payment')
  const items=(await db.query('select * from order_items where order_id=$1 order by sort_order',[result.id])).rows
  assert.equal(items.length,2)
  assert.equal(items[1].production_route,process.argv.includes('--routing') && !['cash','check'].includes(route) ? null : 'external')
  assert.deepEqual(items[0].heights_m.map(Number),[2.4,2.5])
  assert.equal(items.every(i=>i.item_status==='new'),true)
  assert.equal(items.every(i=>i.for_execution === (route!=='quote')),true)
  assert.equal((await db.query('select * from order_accessories where order_id=$1',[result.id])).rows.length,1)
  const payments=(await db.query('select * from payments where order_id=$1',[result.id])).rows
  assert.equal(payments.length,route==='quote'?0:1)
  if(payments.length) {
    assert.equal(Number(payments[0].amount),100)
    assert.equal(payments[0].payment_status,['cash','check'].includes(route)?'received':'pending')
  }
  if (process.argv.includes('--routing')) {
    if (route==='credit_card' || route==='bank_transfer') {
      assert.ok(items.every(i=>i.routing_state==='outside_execution'))
      await asActor(office)
      await db.query('select confirm_pending_payment_v1($1)',[payments[0].id])
      await asActor(sales)
    }
    const routed=(await db.query('select * from order_items where order_id=$1 order by sort_order',[result.id])).rows
    if(route==='quote') assert.ok(routed.every(i=>i.routing_owner===null && i.routing_state==='outside_execution'))
    else {
      assert.equal(routed[0].routing_owner,'CUTTER')
      assert.equal(routed[1].routing_owner,'OFFICE_SUPPLIER')
    }
  }
  console.log('PASS: '+route+' atomic save, items/accessories and idempotent retry')
}
for (const bad of [
  {...payload,paid_on_account:'0'},
  {...payload,paid_on_account:'NaN'},
  {...payload,shading_items:[{...payload.shading_items[0],width_m:'99'}]},
  {...payload,accessories:[{name:'bad',quantity:'-1',unit_price:'2'}]},
  {...payload,curtain_items:[],shading_items:[]},
]) {
  const before=await counts()
  await assert.rejects(create(randomUUID(),bad))
  assert.deepEqual(await counts(),before)
}
console.log('PASS: invalid payment, second-family failure, accessory failure roll back every row and counter')
// Fail after all items/payment writes, at the final audit insertion.
await db.exec(`reset role;
  create function fail_test_history() returns trigger language plpgsql as $$ begin raise exception 'Injected history failure'; end $$;
  create trigger test_history_failure before insert on order_status_history for each row execute function fail_test_history();
  set role authenticated;`)
const beforeAuditFailure=await counts()
await assert.rejects(create(randomUUID(),payload))
assert.deepEqual(await counts(),beforeAuditFailure)
await db.exec('reset role; drop trigger test_history_failure on order_status_history; set role authenticated;')
console.log('PASS: audit failure rolls back order, items, payment and number allocation')
for(const actor of [viewer,office]) {
  await asActor(actor)
  await assert.rejects(create(randomUUID(),payload),e=>e.code==='42501')
}
await asActor(admin)
assert.ok((await create(randomUUID(),payload)).id)
console.log('PASS: Sales/Admin allowed; Viewer/Office creation denied')
if (process.argv.includes('--routing')) {
  await asActor(sales)
  const mixed = orderCreationPayload({...form,
    shading_items: ['roller','zebra','venetian','roman','רומי'].map(subtype=>({...form.shading_items[0],subtype})),
    curtain_items: [...form.curtain_items,{...form.curtain_items[0],for_execution:false}],
  },'credit_card')
  const result = await create(randomUUID(),mixed)
  const readItems=async()=> (await db.query('select * from order_items where order_id=$1 order by sort_order',[result.id])).rows
  assert.ok((await readItems()).every(i=>i.routing_state==='outside_execution' && i.routing_owner===null))
  const payment=(await db.query('select id from payments where order_id=$1',[result.id])).rows[0]
  await assert.rejects(db.query('select confirm_pending_payment_v1($1)',[payment.id]),e=>e.code==='42501')
  await assert.rejects(db.query("update orders set status='ready' where id=$1",[result.id]))
  await asActor(office)
  await db.query('select confirm_pending_payment_v1($1)',[payment.id])
  const items=await readItems()
  assert.equal(items[0].routing_owner,'CUTTER')
  assert.equal(items[0].routing_state,'awaiting_cut')
  assert.equal(items[1].routing_state,'outside_execution')
  assert.ok(items.slice(2).every(i=>i.routing_owner==='OFFICE_SUPPLIER' && i.routing_state==='awaiting_supplier_order'))
  const events=await db.query("select * from order_status_history where order_id=$1 and order_item_id is not null",[result.id])
  assert.equal(events.rows.length,6)
  assert.ok(events.rows.every(e=>e.changed_by===office && e.changed_at))
  await assert.rejects(db.query('select route_order_items_after_payment_v1($1,$2,$3)',[result.id,office,'test']),e=>e.code==='42501')
  await assert.rejects(db.query("update order_items set family='curtain' where id=$1",[items[2].id]))
  await db.query("update order_items set notes='isolated edit' where id=$1",[items[2].id])
  assert.deepEqual((await readItems()).filter(i=>i.id!==items[2].id),items.filter(i=>i.id!==items[2].id))
  const after=await db.query("select count(*)::int n from order_status_history where order_id=$1 and order_item_id is not null",[result.id])
  assert.equal(after.rows[0].n,6)
  console.log('PASS: mixed routing, every shading subtype including Roman, payment approval, outside items, per-item history and isolation')
}
if(process.argv.includes('--cutting')) {
  const {testCutInstructions}=await import('./test-cut-instructions.mjs')
  await testCutInstructions({db,asActor,sales,office,admin,viewer,create,payload,loadTS})
}
await db.close()
