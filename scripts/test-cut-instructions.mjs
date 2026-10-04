import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'

export async function testCutInstructions({db,asActor,sales,office,admin,viewer,create,payload,loadTS}) {
  await db.exec('reset role')
  await db.exec(await readFile('supabase/pending_migrations/sprint3_cutter_role.sql','utf8'))
  await db.exec(await readFile('supabase/pending_migrations/sprint3_cut_instructions.sql','utf8'))
  const cutter=randomUUID()
  await db.query('insert into auth.users(id,email) values($1,$2)',[cutter,'cutter@local.test'])
  await db.query("update profiles set role='cutter' where id=$1",[cutter])
  await asActor(sales)
  const order=await create(randomUUID(),{...payload,curtain_items:[
    {...payload.curtain_items[0],location:'one <script>alert(1)</script>'},
    {...payload.curtain_items[0],location:'two'},
    {...payload.curtain_items[0],location:'three'},
  ]})
  const all=(await db.query('select * from order_items where order_id=$1 order by sort_order',[order.id])).rows
  const selected=all.slice(0,2).map(i=>i.id), third=all[2].id, shade=all[3].id
  const rpc=async(name,args)=> (await db.query('select '+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') value',args)).rows[0].value
  const prepare=(id,ids)=>rpc('prepare_cut_instruction_v1',[id,order.id,ids])
  const activate=id=>rpc('activate_cut_instruction_v1',[id])
  for(const actor of [sales,viewer]) {
    await asActor(actor)
    await assert.rejects(rpc('cut_queue_v1',[]),e=>e.code==='42501')
    await assert.rejects(prepare(randomUUID(),selected),e=>e.code==='42501')
  }
  await asActor(cutter)
  const queue=await rpc('cut_queue_v1',[])
  assert.equal(queue.items.filter(i=>i.order_id===order.id).length,3)
  assert.ok(!queue.items.some(i=>i.id===shade))
  await assert.rejects(db.query('select * from cut_instructions_v1'),e=>e.code==='42501')
  await assert.rejects(prepare(randomUUID(),[]))
  await assert.rejects(prepare(randomUUID(),[shade]))
  await assert.rejects(prepare(randomUUID(),[selected[0],selected[0]]))
  await assert.rejects(prepare(randomUUID(),[randomUUID()]))
  const otherOrderItem=queue.items.find(i=>i.order_id!==order.id)
  assert.ok(otherOrderItem)
  await assert.rejects(prepare(randomUUID(),[selected[0],otherOrderItem.id]))
  const id=randomUUID(), draft=await prepare(id,selected)
  assert.equal(draft.status,'draft')
  assert.deepEqual(await prepare(id,selected),draft)
  assert.equal(draft.snapshot.length,2)
  assert.ok((await rpc('cut_queue_v1',[])).items.filter(i=>i.order_id===order.id).every(i=>!i.cut_instruction_id))
  const competing=randomUUID(); await prepare(competing,selected)
  const {cutInstructionHtml}=await loadTS('src/pages/items/cutInstructions.ts')
  const html=cutInstructionHtml(draft)
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('three'))
  assert.ok(html.includes(id))
  console.log('PASS: scoped Cutter queue, draft selection 2/3, no locks before confirmation, retry, safe printable snapshot')
  const activated=await activate(id)
  assert.equal(activated.status,'pending')
  assert.equal(activated.activated_by,cutter)
  assert.equal(activated.activated_role,'cutter')
  assert.ok(activated.activated_at)
  assert.deepEqual(await activate(id),activated)
  assert.throws(()=>cutInstructionHtml(activated))
  await assert.rejects(prepare(id,selected))
  await assert.rejects(prepare(competing,selected))
  await assert.rejects(activate(competing))
  const reopened=await rpc('cut_queue_v1',[])
  assert.equal(reopened.items.filter(i=>i.cut_instruction_id===id).length,2)
  assert.equal(reopened.items.find(i=>i.id===third).cut_instruction_id,null)
  assert.ok(!reopened.drafts.some(i=>i.id===id))
  assert.ok(!reopened.drafts.some(i=>i.id===competing))
  await asActor(admin)
  for(const query of [
    "update order_items set item_status='cut' where id=$1",
    "update order_items set cut_instruction_id=null where id=$1",
    "update order_items set width_m=3 where id=$1",
    "delete from order_items where id=$1",
  ]) await assert.rejects(db.query(query,[selected[0]]))
  await assert.rejects(db.query("update order_items set item_status='cut' where id=$1",[third]))
  await assert.rejects(db.query("update orders set status='in_production' where id=$1",[order.id]))
  const events=(await db.query("select * from order_status_history where order_id=$1 and to_status='cut_confirmation_pending'",[order.id])).rows
  assert.equal(events.length,2)
  assert.ok(events.every(e=>e.changed_by===cutter && e.note.includes(id)))
  const remaining=(await db.query('select * from order_items where id=$1',[third])).rows[0]
  assert.deepEqual(remaining,{...all[2]})
  console.log('PASS: explicit activation, durable pending locks, no reprint/advance/delete, competing activation rejected, isolated third item, audit once')
  await asActor(cutter)
  const stale=randomUUID(); await prepare(stale,[third])
  await asActor(admin)
  await db.query("update order_items set notes='changed after draft' where id=$1",[third])
  await asActor(cutter)
  await assert.rejects(activate(stale))
  const last=randomUUID(); await prepare(last,[third])
  await db.exec(`reset role;
    create function fail_cut_audit_test() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure'; end $$;
    create trigger fail_cut_audit before insert on order_status_history for each row execute function fail_cut_audit_test();
    set role authenticated;`)
  await assert.rejects(activate(last))
  assert.equal((await rpc('cut_queue_v1',[])).items.find(i=>i.id===third).cut_instruction_id,null)
  assert.equal((await prepare(last,[third])).status,'draft')
  await db.exec('reset role; drop trigger fail_cut_audit on order_status_history; set role authenticated;')
  await activate(last)
  await db.exec('reset role')
  await db.query('update profiles set is_active=false where id=$1',[cutter])
  await asActor(cutter)
  await assert.rejects(rpc('cut_queue_v1',[]),e=>e.code==='42501')
  await asActor(office)
  assert.ok((await rpc('cut_queue_v1',[])).items.length)
  console.log('PASS: changed measurements/details reject stale draft; audit failure rolls back activation/locks; inactive Cutter denied; Office support allowed')
}
