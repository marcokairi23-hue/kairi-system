import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, cpSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createServer } from 'node:net'
import pg from '../.v1-test-deps/node_modules/pg/lib/index.js'
import { createProductionTestDb, actors, ids, rpc, uid } from './production-test-db.mjs'

// Wait on process exit, not inherited pipe closure: Windows pg_ctl leaves a
// pipe handle with its server child even after pg_ctl exits successfully.
const run = (file,args,options) => new Promise((resolve,reject) => {
  const child = spawn(file,args,{ ...options,stdio:'ignore' })
  child.once('error',reject)
  child.once('exit',code => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)))
})
mkdirSync('.v1-test-output', { recursive:true })
// Both the binary/share directory and data directory need ASCII paths during
// Windows initdb bootstrap, because it builds SQL from these filesystem paths.
const root = mkdtempSync(join(tmpdir(),'kairi-v1-pg-'))
cpSync(resolve('.v1-test-deps/node_modules/@embedded-postgres/windows-x64/native'),join(root,'native'),{ recursive:true })
const bin = join(root,'native','bin')
const data = join(root,'data')
const probe = createServer()
await new Promise(r => probe.listen(0,'127.0.0.1',r))
const port = probe.address().port
await new Promise(r => probe.close(r))
const options = { windowsHide:true,timeout:60000 }
let started = false
const clients = []
const wrap = client => ({ query:(...args) => client.query(...args),exec:sql => client.query(sql) })
async function connect() {
  const client = new pg.Client({ host:'127.0.0.1',port,user:'postgres',database:'postgres',connectionTimeoutMillis:5000 })
  await client.connect(); clients.push(client); return client
}
async function begin(client, actor) {
  await client.query("begin; set local role authenticated; set local statement_timeout='8s';")
  await client.query("select set_config('request.jwt.claim.sub',$1,true)",[actor])
}
async function blocked(observer, client) {
  const pid = client.processID
  for (let n=0;n<100;n++) {
    const state = (await observer.query('select wait_event_type from pg_stat_activity where pid=$1',[pid])).rows[0]
    if (state?.wait_event_type === 'Lock') return
    await new Promise(r => setTimeout(r,20))
  }
  throw new Error('Second backend did not wait for a real PostgreSQL lock')
}
async function conflicting(observer, a, b, first, second) {
  await begin(a,actors.admin); await begin(b,actors.admin)
  await first(wrap(a))
  const pending = second(wrap(b)).then(value => ({ value }),error => ({ error }))
  await blocked(observer,b)
  await a.query('commit')
  const result = await pending
  assert.equal(result.error?.code,'40001')
  await b.query('rollback')
}
try {
  await run(join(bin,'initdb.exe'),['-D',data,'-U','postgres','-A','trust','--no-locale','--encoding=UTF8'],options)
  await run(join(bin,'pg_ctl.exe'),['-D',data,'-l',join(data,'server.log'),'-o',`-h 127.0.0.1 -p ${port}`,'-w','-t','30','start'],options)
  started = true
  const observer = await connect()
  await createProductionTestDb(wrap(observer))
  const a = await connect(), b = await connect()
  console.log(`Isolated PostgreSQL: ${(await observer.query('show server_version')).rows[0].server_version}; two real backend connections.`)

  await conflicting(observer,a,b,tx => rpc(tx,[ids.curtain]),tx => rpc(tx,[ids.curtain]))
  assert.equal((await observer.query('select item_status::text from public.order_items where id=$1',[ids.curtain])).rows[0].item_status,'preparation')
  assert.equal((await observer.query('select count(*)::int as n from public.production_item_events')).rows[0].n,1)
  console.log('PASS concurrent duplicate waits for parent lock then rejects stale version; one advance and one event')

  await conflicting(observer,a,b,tx => tx.query('update public.order_items set width_m=width_m+1 where id=$1',[ids.newShading]),tx => rpc(tx,[ids.newShading]))
  assert.equal((await observer.query('select item_status::text from public.order_items where id=$1',[ids.newShading])).rows[0].item_status,'new')
  console.log('PASS concurrent direct item edit invalidates waiting RPC; status remains new')

  await begin(a,actors.office); await begin(b,actors.otherOffice)
  await rpc(wrap(a),[{ id:ids.curtain,version:1 }],'advance','ready')
  const independent = rpc(wrap(b),[ids.shading],'advance','ready')
  await blocked(observer,b)
  await a.query('commit')
  assert.equal((await independent).rows[0].affected,1)
  await b.query('commit')
  console.log('PASS separate siblings serialize and both permitted actions succeed')

  const selection = [{ id:ids.other,version:0 },{ id:ids.newShading,version:1 }]
  await conflicting(observer,a,b,tx => rpc(tx,selection),tx => rpc(tx,[...selection].reverse()))
  assert.equal((await observer.query('select count(*)::int as n from public.production_item_events')).rows[0].n,5)
  console.log('PASS overlapping reversed batches across orders use ordered locks without a deadlock or partial duplicate')
  // Recreate the identified lock inversion in the *fixed* implementation:
  // direct session holds an item; RPC holds its parent and waits for that item.
  // No assertion is made that the previous code was run/reproduced here.
  await begin(b,actors.otherOffice)
  await b.query('select id from public.order_items where id=$1 for update',[ids.newShading])
  await begin(a,actors.office)
  const mixed = rpc(wrap(a),[{ id:ids.newShading,version:2 }],'advance','ready')
  await blocked(observer,a)
  await assert.rejects(b.query("update public.order_items set item_status='ready' where id=$1 and production_version=2",[ids.newShading]),error => error.code === '55P03')
  await b.query('rollback')
  assert.equal((await mixed).rows[0].affected,1)
  await a.query('commit')
  assert.equal((await observer.query('select item_status::text from public.order_items where id=$1',[ids.newShading])).rows[0].item_status,'ready')
  console.log('PASS RPC/item-parent lock inversion versus direct UPDATE fails fast with 55P03, not deadlock; one success')

  await begin(a,actors.office); await begin(b,actors.otherOffice)
  await rpc(wrap(a),[{ id:ids.newShading,version:3 }],'advance','done')
  const directWaiter = b.query("update public.order_items set item_status='done' where id=$1 and production_version=3",[ids.newShading])
  await blocked(observer,b)
  await a.query('commit')
  assert.equal((await directWaiter).rowCount,0)
  await b.query('commit')
  assert.equal((await observer.query('select count(*)::int as n from public.order_status_history where order_item_id=$1',[ids.newShading])).rows[0].n,3)
  console.log('PASS direct stale UPDATE behind RPC affects zero rows and emits no duplicate item history')
  const pendingTask=(await observer.query("select id from public.production_tasks where item_key=$1 and status='active'",[ids.readyCurtain])).rows[0].id
  await begin(a,actors.office); await begin(b,actors.otherOffice)
  const personalRead=(await a.query('select public.production_notification_read_v1($1) as at',[pendingTask])).rows[0].at
  await rpc(wrap(b),[ids.readyCurtain],'advance','done')
  await b.query('commit'); await a.query('commit')
  const finished=(await observer.query('select status,closed_by from public.production_tasks where id=$1',[pendingTask])).rows[0]
  assert.equal(finished.status,'completed'); assert.equal(finished.closed_by,actors.otherOffice)
  const deliveries=(await observer.query('select user_id,first_read_at from public.production_task_recipients where task_id=$1',[pendingTask])).rows
  assert.equal(deliveries.find(row => row.user_id===actors.office).first_read_at.getTime(),personalRead.getTime())
  assert.equal(deliveries.find(row => row.user_id===actors.otherOffice).first_read_at,null)
  console.log('PASS personal read and other OFFICE completion commit concurrently without lost read state or false reads')

  const readTask=(await observer.query("select id from public.production_tasks where item_key=$1 and status='active'",[ids.curtain])).rows[0].id
  await begin(a,actors.office); await begin(b,actors.office)
  const firstRead=(await a.query('select public.production_notification_read_v1($1) as at',[readTask])).rows[0].at
  const readRetry=b.query('select public.production_notification_read_v1($1) as at',[readTask])
  await blocked(observer,b); await a.query('commit')
  assert.equal((await readRetry).rows[0].at.getTime(),firstRead.getTime())
  await b.query('commit')
  console.log('PASS concurrent repeated read preserves first server timestamp')

  await begin(a,actors.office); await begin(b,actors.otherOffice)
  await a.query('update public.orders set payment_approved=false where id=$1',[(await observer.query('select order_id from public.order_items where id=$1',[ids.other])).rows[0].order_id])
  const invalidated=rpc(wrap(b),[{ id:ids.other,version:1 }],'advance','ready').then(value => ({ value }),error => ({ error }))
  await blocked(observer,b); await a.query('commit')
  assert.equal((await invalidated).error?.code,'42501'); await b.query('rollback')
  assert.equal((await observer.query('select item_status::text from public.order_items where id=$1',[ids.other])).rows[0].item_status,'preparation')
  assert.equal((await observer.query('select count(*)::int as n from public.production_tasks where item_key=$1 and from_status=$2 and status=$3',[ids.other,'preparation','completed'])).rows[0].n,0)
  console.log('PASS financial approval withdrawal versus waiting RPC cancels task and rejects business action atomically')
  assert.equal((await observer.query('select count(*)::int as n from (select item_key from public.production_tasks where status=$1 group by item_key having count(*)>1) duplicates',['active'])).rows[0].n,0)
  let fixture = 0
  for (const change of ['approval','activation']) for (const first of ['insert','order']) {
    const orderId=uid(900+fixture),itemId=uid(950+fixture++)
    await observer.query(`insert into public.orders(id,agent_id,customer_name_snapshot,status,payment_approved,final_total)
      values($1,$2,'synthetic insert race',$3::public.order_status,$4,0)`,
      [orderId,actors.sales,change==='approval' ? 'new_execution' : 'quote',change!=='approval'])
    await begin(a,actors.office); await begin(b,actors.otherOffice)
    const insert=client => client.query(`insert into public.order_items(id,order_id,family,location,width_m,heights_m,for_execution)
      values($1,$2,'curtain','synthetic concurrent insert',2,array[2.5],true)`,[itemId,orderId])
    const update=client => client.query(change==='approval'
      ? 'update public.orders set payment_approved=true where id=$1'
      : "update public.orders set status='new_execution' where id=$1",[orderId])
    await (first==='insert' ? insert(a) : update(a))
    const pending=(first==='insert' ? update(b) : insert(b)).then(value => ({ value }),error => ({ error }))
    await blocked(observer,b)
    await a.query('commit')
    const result=await pending
    assert.equal(result.error,undefined)
    await b.query('commit')
    const tasks=(await observer.query('select status,from_status,target_status,instance_no from public.production_tasks where item_key=$1',[itemId])).rows
    assert.equal(tasks.length,1)
    assert.deepEqual(tasks[0],{ status:'active',from_status:'new',target_status:'preparation',instance_no:1 })
    assert.equal((await observer.query('select item_status::text,production_version from public.order_items where id=$1',[itemId])).rows[0].item_status,'new')
    assert.equal((await observer.query('select count(*)::int as n from public.order_status_history where order_item_id=$1',[itemId])).rows[0].n,0)
    console.log(`PASS authenticated INSERT/${change}, ${first} first: parent lock serializes both commits; exactly one eligible task`)
  }
  console.log('13 real concurrency suites passed; authenticated identities; local PostgreSQL will be stopped.')
} finally {
  await Promise.allSettled(clients.map(client => client.end()))
  if (started) await run(join(bin,'pg_ctl.exe'),['-D',data,'-m','fast','-w','-t','30','stop'],options)
}
