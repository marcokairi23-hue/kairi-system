import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { createProductionTestDb, asActor, actors, ids, orders, rpc, uid } from './production-test-db.mjs'

const loadTS = (name, imports = {}) => {
  const exports = {}
  const code = ts.transpileModule(readFileSync(new URL(`../src/lib/${name}.ts`, import.meta.url),'utf8'), {
    compilerOptions: { target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.CommonJS },
  }).outputText
  vm.runInNewContext(code, { exports, require: name => imports[name] })
  return exports
}
const helpers = loadTS('statusHelpers')
const permissions = loadTS('productionPermissions', { './statusHelpers': helpers })
const profile = role => ({ id: actors[role], role:role === 'otherSales' ? 'sales' : role === 'otherOffice' ? 'office' : role, is_active:true })
const db = await createProductionTestDb()
let passed = 0
async function test(name, fn) {
  await fn(); passed++; console.log(`PASS ${name}`)
}
async function deny(actor, chosen, next = 'preparation', code = '42501') {
  await assert.rejects(asActor(db, actor, db => rpc(db, chosen, 'advance', next)), error => error.code === code)
}
try {
  await test('existing issue SQL guards still pass with production triggers installed', async () => {
    // The existing script requires an order without any other unresolved issue.
    // A separate database/order supplies that precondition without weakening the
    // production fixtures or modifying the pre-existing regression script.
    const regressionDb = await createProductionTestDb()
    try {
      await regressionDb.query(`insert into public.orders(id,agent_id,customer_name_snapshot,status)
        values($1,$2,'issue regression','in_execution')`,[uid(99),actors.sales])
      await regressionDb.query(`insert into public.order_items(id,order_id,family,location,width_m)
        values($1,$2,'curtain','regression',2)`,[uid(200),uid(99)])
      await regressionDb.exec(readFileSync(new URL('./test-item-issues.sql',import.meta.url),'utf8'))
    } finally { await regressionDb.close() }
  })
  const rows = (await db.query(`select i.*,jsonb_build_object('status',o.status,'payment_approved',o.payment_approved,'order_number',o.order_number,
    'customer_name_snapshot',o.customer_name_snapshot) as orders from public.order_items i join public.orders o on o.id=i.order_id`)).rows
  await test('mixed order filters preserve all siblings, including quote/done/issue', () => {
    for (const [route,statuses,search] of [['cutter',[], ''],['office',[], ''],['all',['preparation'],''],['all',[],'shading']]) {
      const filtered = permissions.filterProductionOrders(rows,route,statuses,search)
      const mixed = filtered.filter(i => i.order_id === orders.mixed)
      assert.equal(mixed.length,7)
    }
  })
  await test('UI/SQL parity across roles, assignments, statuses and issues', async () => {
    for (const role of ['admin','office','otherOffice','sales','otherSales','viewer','inactive']) {
      await asActor(db,actors[role], async tx => {
        const visible = (await tx.query('select id from public.order_items')).rows.map(i => i.id)
        for (const item of rows.filter(i => visible.includes(i.id))) {
          const p = { ...profile(role), role:role === 'inactive' ? 'office' : profile(role).role, is_active:role !== 'inactive' }
          const next = helpers.nextItemStatus('cutter',item.item_status)
          const result = (await tx.query('select production_private.allowed_transition(i,$2) as allowed from public.order_items i where id=$1',[item.id,next])).rows[0].allowed
          assert.equal(!!permissions.productionNext(item,p), result, `${role}/${item.location}`)
        }
      })
    }
  })
  await test('office assigned curtain + single action + actor/time/history', () => asActor(db,actors.office,async tx => {
    assert.equal((await rpc(tx,[ids.curtain])).rows[0].affected,1)
    const event = (await tx.query('select * from public.production_item_events where order_item_id=$1',[ids.curtain])).rows[0]
    assert.equal(event.changed_by,actors.office); assert.ok(event.changed_at); assert.equal(event.version,1)
    assert.equal((await tx.query('select count(*)::int as n from public.order_status_history where order_item_id=$1 and changed_by=$2',[ids.curtain,actors.office])).rows[0].n,1)
  }))
  await test('unassigned sales curtain denied by RPC and direct UPDATE', async () => {
    await deny(actors.sales,[ids.curtain])
    await assert.rejects(asActor(db,actors.sales,tx => tx.query("update public.order_items set item_status='preparation' where id=$1",[ids.curtain])),error => error.code === '42501')
  })
  await test('two OFFICE users act by role regardless of legacy assigned worker; admin override retained', async () => {
    for (const actor of [actors.office,actors.otherOffice]) {
      await asActor(db,actor,tx => rpc(tx,[ids.curtain]))
      await asActor(db,actor,tx => rpc(tx,[ids.readyCurtain],'advance','done'))
      await asActor(db,actor,tx => tx.query("update public.order_items set item_status='preparation' where id=$1",[ids.curtain]))
    }
    await asActor(db,actors.admin,tx => rpc(tx,[ids.readyCurtain],'advance','done'))
  })
  await test('shading dispatch office/admin only even if sales is assigned', async () => {
    await deny(actors.sales,[ids.newShading])
    for (const actor of [actors.office,actors.admin]) await asActor(db,actor,tx => rpc(tx,[ids.newShading]))
  })
  await test('shading ready without assignment for internal user with order access', () => asActor(db,actors.sales,tx => rpc(tx,[ids.shading],'advance','ready')))
  await test('viewer, inactive and invisible order rejected', async () => {
    for (const actor of [actors.viewer,actors.inactive,actors.otherSales]) await deny(actor,[ids.shading],'ready')
    await deny(actors.sales,[ids.other])
    await asActor(db,actors.viewer,async tx => assert.equal((await tx.query('select * from public.production_item_events')).rows.length,0))
  })
  await test('invalid jump, done, nonexecution and unresolved issue rejected', async () => {
    await deny(actors.admin,[ids.curtain],'ready')
    await deny(actors.admin,[ids.done],'done')
    await deny(actors.admin,[ids.quoteItem])
    await deny(actors.admin,[ids.issue],'done')
  })
  await test('authorized batch and mixed unauthorized batch rollback', async () => {
    await asActor(db,actors.office,tx => rpc(tx,[ids.curtain,ids.newShading]))
    await deny(actors.sales,[ids.curtain,ids.other])
    assert.equal((await db.query('select item_status::text from public.order_items where id=$1',[ids.curtain])).rows[0].item_status,'new')
    assert.equal((await db.query('select count(*)::int as n from public.production_item_events')).rows[0].n,0)
  })
  await test('double request and stale item version rejected', async () => {
    await asActor(db,actors.office,async tx => {
      await rpc(tx,[ids.curtain]);
      // Savepoint lets us inspect state after the rejected duplicate.
      await tx.exec('savepoint duplicate')
      await assert.rejects(rpc(tx,[ids.curtain]),error => error.code === '40001')
      await tx.exec('rollback to savepoint duplicate')
      assert.equal((await tx.query('select item_status::text from public.order_items where id=$1',[ids.curtain])).rows[0].item_status,'preparation')
      assert.equal((await tx.query('select count(*)::int as n from public.production_item_events')).rows[0].n,1)
    })
    await asActor(db,actors.admin,async tx => {
      await tx.query('update public.order_items set width_m=width_m+1 where id=$1',[ids.curtain])
      await tx.exec('savepoint stale')
      await assert.rejects(rpc(tx,[ids.curtain]),error => error.code === '40001')
      await tx.exec('rollback to savepoint stale')
    })
  })
  await test('manual assignment disabled through RPC and direct UPDATE', async () => {
    for (const actor of [actors.admin,actors.office,actors.sales]) {
      await assert.rejects(asActor(db,actor,tx => rpc(tx,[ids.curtain],'assign',null)),error => error.code === '42501')
      await assert.rejects(asActor(db,actor,tx => tx.query('update public.order_items set assigned_worker=$2 where id=$1',[ids.curtain,actors.sales])),error => error.code === '42501')
    }
  })
  await test('route spoof and direct assignment bypass denied', async () => {
    await assert.rejects(asActor(db,actors.sales,tx => tx.query("update public.order_items set family='shading' where id=$1",[ids.curtain])), error => error.code === '42501')
    await assert.rejects(asActor(db,actors.sales,tx => tx.query('update public.order_items set assigned_worker=$2 where id=$1',[ids.curtain,actors.sales])), error => error.code === '42501')
  })
  await test('audit insert/delete cannot be forged even by admin', async () => {
    await assert.rejects(asActor(db,actors.admin,tx => tx.query('delete from public.production_item_events')), error => error.code === '42501')
    await assert.rejects(asActor(db,actors.admin,tx => tx.query('insert into public.production_item_events select * from public.production_item_events')), error => error.code === '42501')
  })
  await test('history failure rolls back item, version and durable audit together', async () => {
    await db.exec(`create function public.test_reject_history() returns trigger language plpgsql as $$
      begin raise exception 'Synthetic history failure'; end $$;
      create trigger test_reject_history before insert on public.order_status_history
        for each row execute function public.test_reject_history();`)
    try {
      await assert.rejects(asActor(db,actors.office,tx => rpc(tx,[ids.curtain])),/Synthetic history failure/)
      const item = (await db.query('select item_status::text,production_version from public.order_items where id=$1',[ids.curtain])).rows[0]
      assert.equal(item.item_status,'new'); assert.equal(item.production_version,0)
      assert.equal((await db.query('select count(*)::int as n from public.production_item_events')).rows[0].n,0)
    } finally { await db.exec('drop trigger test_reject_history on public.order_status_history; drop function public.test_reject_history();') }
  })
  await test('readable viewer remains unable to act even with synthetic SELECT policies', async () => {
    await db.exec(`create policy test_viewer_orders on public.orders for select to authenticated using (public.current_role()::text='viewer');
      create policy test_viewer_items on public.order_items for select to authenticated using (public.current_role()::text='viewer');`)
    try {
      await asActor(db,actors.viewer,async tx => {
        assert.ok((await tx.query('select id from public.order_items')).rows.length > 0)
        assert.equal((await tx.query('select production_private.allowed_transition(i,\'ready\') as allowed from public.order_items i where id=$1',[ids.shading])).rows[0].allowed,false)
      })
      await deny(actors.viewer,[ids.shading],'ready')
    } finally { await db.exec('drop policy test_viewer_orders on public.orders; drop policy test_viewer_items on public.order_items;') }
  })
  await test('initial assignment cannot be forged by sales', async () => {
    await assert.rejects(asActor(db,actors.sales,tx => tx.query(`insert into public.order_items(order_id,family,location,width_m,assigned_worker)
      values($1,'curtain','forged',2,$2)`,[orders.mixed,actors.sales])),error => error.code === '42501')
  })
  await test('successful direct UPDATE emits one item history; identical retry emits none', () => asActor(db,actors.office,async tx => {
    await tx.query("update public.order_items set item_status='preparation' where id=$1",[ids.curtain])
    await tx.query("update public.order_items set item_status='preparation' where id=$1",[ids.curtain])
    assert.equal((await tx.query('select count(*)::int as n from public.order_status_history where order_item_id=$1',[ids.curtain])).rows[0].n,1)
    assert.equal((await tx.query('select count(*)::int as n from public.production_item_events')).rows[0].n,1)
  }))
  await test('RPC and direct UPDATE reject the same role, state, nonexecution and issue cases', async () => {
    for (const [actor,id,target] of [[actors.sales,ids.curtain,'preparation'],[actors.sales,ids.newShading,'preparation'],
      [actors.office,ids.quoteItem,'preparation'],[actors.office,ids.issue,'done'],[actors.office,ids.curtain,'ready']]) {
      await deny(actor,[id],target)
      await assert.rejects(asActor(db,actor,tx => tx.query('update public.order_items set item_status=$2::public.item_status where id=$1',[id,target])),error => error.code === '42501')
    }
  })
  await test('201 items blocked before client RPC; selection limit does not affect printing', async () => {
    assert.equal(permissions.nextProductionSelection(new Set(),Array.from({ length:201 },(_,n) => String(n))),null)
    assert.equal(permissions.nextProductionSelection(new Set(),Array.from({ length:200 },(_,n) => String(n))).size,200)
    let requests = 0
    const actions = loadTS('productionActions',{ './supabase':{ supabase:{ rpc:async () => { requests++; return { error:null } } } }, './productionPermissions':permissions })
    await assert.rejects(actions.advanceProductionItems(Array.from({ length:201 },(_,n) => ({ id:String(n),production_version:0 })),'ready'),/200/)
    assert.equal(requests,0)
    const done = { family:'curtain',for_execution:true,item_status:'done',orders:{ status:'in_execution',payment_approved:true } }
    assert.equal(permissions.defaultWorkPrint(done,profile('office')),false)
    assert.equal(permissions.canPrintProduction(profile('office')),true)
    assert.equal(permissions.defaultWorkPrint({ ...done,item_status:'new' },profile('office')),true)
    assert.equal(permissions.defaultWorkPrint({ ...done,item_status:'new' },profile('sales')),false)
  })
  await test('anonymous cannot execute RPC', async () => {
    await db.exec('begin; set local role anon;')
    try { await assert.rejects(rpc(db,[ids.curtain]),error => error.code === '42501') } finally { await db.exec('rollback') }
  })
  await test('original partial selection and financial approval remain independent of removed final selection',async () => {
    for (const approved of [false,null]) {
      await db.query('update public.orders set payment_approved=$1 where id=$2',[approved,orders.mixed])
      await deny(actors.office,[ids.curtain])
      await assert.rejects(asActor(db,actors.office,tx => tx.query("update public.order_items set item_status='preparation' where id=$1",[ids.curtain])),error => error.code === '42501')
    }
    await db.query('update public.orders set payment_approved=true where id=$1',[orders.mixed])
    await asActor(db,actors.office,async tx => {
      await rpc(tx,[ids.curtain])
      assert.equal((await tx.query('select for_execution,item_status::text from public.order_items where id=$1',[ids.quoteItem])).rows[0].for_execution,false)
      assert.equal((await tx.query('select item_status::text from public.order_items where id=$1',[ids.quoteItem])).rows[0].item_status,'new')
    })
  })
  console.log(`${passed} production suites passed on isolated PostgreSQL; no remote connection.`)
} finally { await db.close() }
