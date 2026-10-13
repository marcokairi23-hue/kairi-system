import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { PGlite } from '../.v1-test-deps/node_modules/@electric-sql/pglite/dist/index.js'
import { asActor, actors, ids, orders, rpc, notificationFeed, readNotification } from './production-test-db.mjs'

// Input is a read-only catalog snapshot, never production rows or credentials.
// This tests the relevant live columns/enums/policies/triggers in a synthetic DB.
// It does NOT simulate Supabase Auth/PostgREST or unrelated tables/integrations.
const root = new URL('../.v1-test-output/release-readiness/', import.meta.url)
const schema = JSON.parse(readFileSync(new URL('readiness.json', root), 'utf8'))
const compatibility = JSON.parse(readFileSync(new URL('compatibility.json', root), 'utf8'))
const db = new PGlite()
const tables = ['profiles', 'orders', 'order_items', 'payments', 'order_status_history']
const quote = value => `"${value.replaceAll('"', '""')}"`
const literal = value => `'${value.replaceAll("'", "''")}'`
const scalarType = name => ({ bool: 'boolean', int4: 'integer', int8: 'bigint', timestamptz: 'timestamptz' }[name] ?? quote(name))
const columnType = column => column.udt_name.startsWith('_') ? `${scalarType(column.udt_name.slice(1))}[]` : scalarType(column.udt_name)
let passed = 0
async function test(name, fn) { await fn(); passed++; console.log(`PASS ${name}`) }
async function businessRows() {
  const result = {}
  for (const table of tables) result[table] = (await db.query(`select to_jsonb(t)-'production_version'-'production_changed_by'-'production_changed_at' as row from public.${quote(table)} t order by id`)).rows
  return result
}
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`)
  for (const entry of compatibility.enums) await db.exec(`create type public.${quote(entry.typname)} as enum (${entry.labels.map(literal).join(',')})`)
  for (const table of tables) {
    const columns = schema.columns.filter(column => column.table_name === table)
    assert.ok(columns.length, table)
    await db.exec(`create table public.${quote(table)} (${columns.map(column => `${quote(column.column_name)} ${columnType(column)}${column.is_nullable === 'NO' ? ' not null' : ''}${column.column_default ? ` default ${column.column_default}` : ''}`).join(',')})`)
  }
  // Reproduce constraints whose referenced tables are in this isolated subgraph.
  // Foreign keys to fabrics/customers/suppliers are outside this production test.
  for (const entry of [...schema.constraints].sort((a,b) => Number(a.definition.startsWith('FOREIGN KEY'))-Number(b.definition.startsWith('FOREIGN KEY')))) {
    const referenced = entry.definition.match(/REFERENCES (?:public\.)?(\w+)/)?.[1]
    if (!referenced || tables.includes(referenced) || referenced === 'users') {
      await db.exec(`alter table public.${quote(entry.table_name)} add constraint ${quote(entry.conname)} ${entry.definition}`)
    }
  }
  // payments is outside the captured constraint subset; the V1 SQL only reads it.
  await db.exec(schema.current_role_function)
  for (const entry of schema.rls) if (entry.relrowsecurity) await db.exec(`alter table public.${quote(entry.relname)} enable row level security`)
  for (const entry of schema.grants) await db.exec(`grant ${entry.privilege_type} on public.${quote(entry.table_name)} to ${quote(entry.grantee)}`)
  for (const entry of schema.policies) {
    await db.exec(`create policy ${quote(entry.policyname)} on public.${quote(entry.tablename)} as ${entry.permissive} for ${entry.cmd} to ${entry.roles.map(role => role === 'public' ? 'public' : quote(role)).join(',')}${entry.qual ? ` using (${entry.qual})` : ''}${entry.with_check ? ` with check (${entry.with_check})` : ''}`)
  }
  for (const entry of schema.triggers) { await db.exec(entry.function_definition); await db.exec(entry.definition) }
  for (const [name, actor] of Object.entries(actors)) {
    await db.query('insert into auth.users(id) values($1)', [actor])
    await db.query('insert into public.profiles(id,full_name,role,is_active) values($1,$2,$3::public.user_role,$4)', [actor, `synthetic ${name}`, name === 'otherSales' ? 'sales' : ['otherOffice', 'inactive'].includes(name) ? 'office' : name, name !== 'inactive'])
  }
  await db.query(`insert into public.orders(id,agent_id,customer_name_snapshot,status,payment_approved,final_total)
    values($1,$2,'synthetic live-contract order','in_execution',true,0)`, [orders.mixed, actors.sales])
  for (const [id, family, state, execution] of [[ids.curtain, 'curtain', 'new', true], [ids.shading, 'shading', 'preparation', true], [ids.quoteItem, 'curtain', 'new', false]]) {
    await db.query(`insert into public.order_items(id,order_id,family,location,width_m,heights_m,item_status,for_execution)
      values($1,$2,$3::public.item_family,'synthetic',2,array[2.5],$4::public.item_status,$5)`, [id, orders.mixed, family, state, execution])
  }
  const before = await businessRows()
  await test('both pending migrations install against captured live production contract', async () => {
    for (const file of ['20261013184228_v1_production_task_permissions.sql', '20261013213750_production_notifications_v1.sql']) {
      await db.exec(readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), 'utf8'))
    }
  })
  await test('initialization changes no existing synthetic business rows', async () => {
    assert.deepEqual(await businessRows(), before)
    assert.equal((await db.query('select count(*)::int as n from public.production_tasks')).rows[0].n, 2)
  })
  await test('live RLS contract permits both OFFICE accounts and preserves personal read state', async () => {
    const a = await asActor(db, actors.office, tx => notificationFeed(tx))
    const b = await asActor(db, actors.otherOffice, tx => notificationFeed(tx))
    assert.deepEqual(a.tasks.map(task => task.id), b.tasks.map(task => task.id))
    await asActor(db, actors.office, tx => readNotification(tx, a.tasks[0].id), true)
    const unchanged = await asActor(db, actors.otherOffice, tx => notificationFeed(tx))
    assert.equal(unchanged.unread_active, 2)
  })
  await test('both OFFICE accounts can advance; SALES direct curtain request denied', async () => {
    for (const actor of [actors.office, actors.otherOffice]) await asActor(db, actor, tx => rpc(tx, [ids.curtain]))
    await assert.rejects(asActor(db, actors.sales, tx => tx.query("update public.order_items set item_status='preparation' where id=$1", [ids.curtain])), error => error.code === '42501')
    await asActor(db, actors.sales, tx => rpc(tx, [ids.shading], 'advance', 'ready'))
  })
  await test('rollback quiesces V1 paths without deleting journal or notification metadata', async () => {
    await db.exec(readFileSync(new URL('../scripts/production-v1-quiesce.sql', import.meta.url), 'utf8'))
    assert.equal((await db.query('select count(*)::int as n from public.production_tasks')).rows[0].n, 2)
    await assert.rejects(asActor(db, actors.office, tx => rpc(tx, [ids.curtain])), error => error.code === '42501')
    // This disposable DB runs the emergency script last, with no live connection.
  })
  const summary = { passed, snapshot_time: compatibility.server_time, live_version: schema.version,
    full_auth_postgrest: 'not tested; isolated environment unavailable', production_data_copied: false }
  writeFileSync(new URL('contract-test-result.json', root), JSON.stringify(summary, null, 2))
  console.log(`${passed} captured-contract suites passed; synthetic rows only.`)
} catch (error) {
  console.error(`FAIL ${error.code ?? ''} ${error.message}`)
  if (error.query) console.error(error.query)
  process.exitCode = 1
} finally { await db.close() }
