import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, extname } from 'node:path'
import { chromium } from 'playwright'
import { createProductionTestDb, asActor, actors, ids, orders, rpc, notificationFeed, readNotification } from './production-test-db.mjs'

// Isolated build, synthetic Auth session, local authenticated PostgreSQL adapter.
// This is not a full Supabase Auth/PostgREST integration test.
const buildRoot = resolve('.v1-build')
const server = createServer((req,res) => {
  let path = resolve(buildRoot, `.${new URL(req.url,'http://local').pathname}`)
  if (!path.startsWith(buildRoot)) { res.writeHead(403).end(); return }
  if (!extname(path)) path = resolve(buildRoot,'index.html')
  try {
    res.setHeader('Content-Type', { '.js':'text/javascript','.css':'text/css','.html':'text/html' }[extname(path)] ?? 'application/octet-stream')
    res.end(readFileSync(path))
  } catch { res.writeHead(404).end() }
})
await new Promise(r => server.listen(0,'127.0.0.1',r))
const port = server.address().port
const browser = await chromium.launch({ headless:true })
mkdirSync('.v1-test-output',{ recursive:true })
let passed = 0
// PGlite has one backend: serialize adapter requests so parallel browser fetches
// never share transaction identity. Real two-backend races have their own suite.
const databaseQueues = new WeakMap()
function authenticatedRequest(db,actor,fn,commit=false) {
  const previous=databaseQueues.get(db) ?? Promise.resolve()
  const result=previous.catch(() => {}).then(() => asActor(db,actor,fn,commit))
  databaseQueues.set(db,result.catch(() => {}))
  return result
}
async function session(role, viewport, run, startPath = '/production', sharedDb = null, blockedFeatures = []) {
  const db = sharedDb ?? await createProductionTestDb()
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  const errors = [], external = []
  let calls = 0, failNext = false, delay = 0, loadDelay = 0, pageSize = 3, readCalls=0, feedCalls=0, failFeed=false, feedDelay=0
  page.on('pageerror',error => errors.push(error.message))
  const keys = ['production','items','orders','orderDetail']
  const userRole = role === 'otherOffice' ? 'office' : role
  await context.route('**/*',async route => {
    const request = route.request(), url = new URL(request.url())
    if (url.protocol === 'blob:') return route.continue()
    if (url.hostname === 'fonts.googleapis.com') return route.fulfill({ contentType:'text/css',body:'' })
    if (url.hostname !== '127.0.0.1') { external.push(url.origin); return route.abort() }
    if (url.port === String(port)) return route.continue()
    if (url.port !== '54321') { external.push(url.origin); return route.abort() }
    const fulfill = value => route.fulfill({ contentType:'application/json',body:JSON.stringify(value) })
    if (request.method() === 'OPTIONS') return route.fulfill({ status:204 })
    try {
      if (url.pathname === '/auth/v1/user') return fulfill({ id:actors[role],email:`${role}@example.invalid` })
      if (url.pathname.endsWith('/profiles')) {
        if (url.searchParams.get('select') === '*') return fulfill((await db.query('select * from public.profiles where id=$1',[actors[role]])).rows[0])
        return fulfill((await db.query('select id,full_name from public.profiles order by full_name')).rows)
      }
      if (url.pathname.endsWith('/feature_flags')) return fulfill(keys.map(key => ({ key,enabled_global:true,parent_key:null })))
      // Fixture screen access only; production feature permissions are unchanged.
      if (url.pathname.endsWith('/feature_permissions')) return fulfill(keys.map(feature_key => ({ feature_key,role:userRole,allowed:!blockedFeatures.includes(feature_key) })))
      if (url.pathname.endsWith('/settings')) return fulfill(null)
      if (url.pathname.endsWith('/order_items')) {
        if (loadDelay) await new Promise(r => setTimeout(r,loadDelay))
        const rows = await authenticatedRequest(db,actors[role],async tx => (await tx.query(`select i.*,jsonb_build_object(
          'status',o.status,'payment_approved',o.payment_approved,'created_at',o.created_at,'order_number',o.order_number,
          'customer_name_snapshot',o.customer_name_snapshot,'profiles',jsonb_build_object('full_name','sales')) as orders
          from public.order_items i join public.orders o on o.id=i.order_id order by i.id`)).rows)
        const cursor = url.searchParams.get('id')?.replace(/^gt\./,'')
        return fulfill(rows.filter(row => !cursor || row.id > cursor).slice(0,pageSize))
      }
      if (url.pathname.endsWith('/orders') && request.method() === 'GET') {
        const rows = await authenticatedRequest(db,actors[role],async tx => (await tx.query(`select o.*,
          jsonb_build_object('full_name','sales') as profiles,
          coalesce((select jsonb_agg(i order by i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb) as order_items,
          coalesce((select jsonb_agg(p) from public.payments p where p.order_id=o.id),'[]'::jsonb) as payments
          from public.orders o order by o.created_at desc`)).rows)
        const id = url.searchParams.get('id')?.replace(/^eq\./,'')
        return fulfill(id ? rows.find(row => row.id === id) : rows)
      }
      if (url.pathname.endsWith('/rpc/production_mutate_v1')) {
        calls++
        if (delay) await new Promise(r => setTimeout(r,delay))
        if (failNext) { failNext = false; return route.fulfill({ status:409,contentType:'application/json',body:JSON.stringify({ message:'כישלון מלאכותי',code:'40001' }) }) }
        const body = request.postDataJSON()
        const result = await authenticatedRequest(db,actors[role],tx => rpc(tx,body.p_items,body.p_action,body.p_next),true)
        return fulfill(result.rows[0].affected)
      }
      if (url.pathname.endsWith('/rpc/production_notifications_v1')) {
        feedCalls++
        if (feedDelay) await new Promise(r => setTimeout(r,feedDelay))
        if (failFeed) { failFeed=false; return route.fulfill({ status:503,contentType:'application/json',body:JSON.stringify({ message:'Synthetic feed failure' }) }) }
        const body=request.postDataJSON()
        return fulfill(await authenticatedRequest(db,actors[role],tx => notificationFeed(tx,body.p_state,body.p_limit,
          body.p_before ? { cursor_at:body.p_before,id:body.p_before_id } : null),true))
      }
      if (url.pathname.endsWith('/rpc/production_notification_read_v1')) {
        readCalls++
        return fulfill(await authenticatedRequest(db,actors[role],tx => readNotification(tx,request.postDataJSON().p_task),true))
      }
      throw new Error(`Unexpected local request: ${request.method()} ${url.pathname}`)
    } catch (error) {
      return route.fulfill({ status:403,contentType:'application/json',body:JSON.stringify({ message:error.message,code:error.code }) })
    }
  })
  await context.addInitScript(({ actor,role }) => {
    const exp = Math.floor(Date.now()/1000)+3600
    const payload = btoa(JSON.stringify({ sub:actor,aud:'authenticated',role:'authenticated',exp }))
    localStorage.setItem('sb-127-auth-token',JSON.stringify({ access_token:`eyJhbGciOiJIUzI1NiJ9.${payload}.fake`,refresh_token:'fake',token_type:'bearer',expires_at:exp,expires_in:3600,user:{ id:actor,email:`${role}@example.invalid` } }))
    // Capture the actual generated print document, without a native OS dialog.
    window.__workPrintDocuments = []
    window.open = url => { fetch(url).then(response => response.text()).then(html => window.__workPrintDocuments.push(html)); return null }
  },{ actor:actors[role],role })
  try {
    await page.goto(`http://127.0.0.1:${port}${startPath}`)
    if (['/production','/items'].includes(startPath)) {
      await page.getByRole('button',{ name:'רענן נתונים' }).waitFor()
      if (role !== 'viewer') await page.getByLabel('בחר curtain',{ exact:true }).waitFor()
    } else if (startPath === '/orders') await page.getByTitle('פריטים בהזמנה',{ exact:true }).first().waitFor()
    else await page.getByRole('button',{ name:'הוראות עבודה',exact:true }).waitFor()
    await run({ page,db,get calls() { return calls },get readCalls() { return readCalls },get feedCalls() { return feedCalls },
      fail:() => { failNext = true },delay:value => { delay = value },loadDelay:value => { loadDelay = value },pageSize:value => { pageSize = value },
      failFeed:() => { failFeed=true },feedDelay:value => { feedDelay=value },
      act:(fn,commit=true) => authenticatedRequest(db,actors[role],fn,commit) })
    assert.deepEqual(errors,[])
    assert.deepEqual(external,[],'No live API or external service may be contacted')
  } finally { await context.close(); await databaseQueues.get(db); if (!sharedDb) await db.close() }
}
async function test(name,fn) { await fn(); passed++; console.log(`PASS ${name}`) }
async function snapshot(db) { return (await db.query('select id,item_status,production_version from public.order_items order by id')).rows }
async function itemHistory(db,id) { return (await db.query('select count(*)::int as n from public.order_status_history where order_item_id=$1',[id])).rows[0].n }
const desktop = { width:1440,height:1000 }, mobile = { width:390,height:844 }
try {
  await test('desktop: OFFICE both routes, siblings, filter clearing and atomic bulk history',() => session('office',desktop,async api => {
    const { page } = api
    assert.equal(await page.getByLabel('בחר readyCurtain',{ exact:true }).isEnabled(),true)
    assert.equal(await page.getByLabel('בחר quoteItem',{ exact:true }).isEnabled(),false)
    assert.equal(await page.getByRole('button',{ name:'בחירה לשיוך עובדים' }).count(),0)
    await page.getByLabel('בחר curtain',{ exact:true }).check()
    await page.getByRole('button',{ name:'למשרד',exact:true }).click()
    assert.equal(await page.getByLabel('בחר curtain',{ exact:true }).isChecked(),false)
    assert.equal(await page.getByLabel('בחר quoteItem',{ exact:true }).count(),1)
    await page.getByLabel('בחר shading',{ exact:true }).check()
    await page.getByRole('button',{ name:'בהכנה',exact:true }).click()
    assert.equal(await page.getByLabel('בחר shading',{ exact:true }).isChecked(),false)
    await page.getByLabel('בחר shading',{ exact:true }).check()
    await page.getByLabel('חיפוש הזמנות ופריטים').fill('shading')
    assert.equal(await page.getByLabel('בחר shading',{ exact:true }).isChecked(),false)
    assert.equal(await page.getByLabel('בחר curtain',{ exact:true }).count(),1)
    await page.getByLabel('חיפוש הזמנות ופריטים').fill('')
    await page.getByRole('button',{ name:'הכל',exact:true }).click()
    await page.getByRole('button',{ name:'כל המסלולים',exact:true }).click()
    await page.getByLabel('בחר curtain',{ exact:true }).check()
    await page.getByLabel('בחר newShading',{ exact:true }).check()
    await page.getByRole('button',{ name:'העבר להכנה',exact:true }).last().click()
    await page.waitForFunction(() => !document.body.textContent.includes('פריטים נבחרו'))
    assert.equal(api.calls,1)
    assert.equal(await itemHistory(api.db,ids.curtain),1)
    assert.equal(await itemHistory(api.db,ids.newShading),1)
    await page.screenshot({ path:'.v1-test-output/desktop.png',fullPage:true })
  }))
  for (const [name,viewport] of [['desktop',desktop],['mobile',mobile]]) {
    await test(`${name}: partial print, manual shading, blocked/done reprint, cancel, no writes`,() => session('office',viewport,async api => {
      const { page,db } = api
      await db.query('delete from public.order_items where id=any($1::uuid[])',[[ids.quoteItem,ids.readyCurtain,ids.other]])
      api.pageSize(500)
      await page.getByRole('button',{ name:'רענן נתונים' }).click()
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'רענן נתונים')?.disabled)
      const before = await snapshot(db)
      await page.getByRole('button',{ name:'הדפס הוראות',exact:true }).click()
      const dialog = page.getByRole('dialog',{ name:'בחירת פריטים להוראות עבודה' })
      await dialog.waitFor()
      assert.equal(await dialog.getByLabel('הדפס curtain',{ exact:true }).isChecked(),true)
      assert.equal(await dialog.getByLabel('הדפס newShading',{ exact:true }).isChecked(),false)
      assert.equal(await dialog.getByLabel('הדפס done',{ exact:true }).isEnabled(),true)
      assert.equal(await dialog.getByLabel('הדפס issue',{ exact:true }).isEnabled(),true)
      await dialog.getByLabel('בחר הכל להדפסה').check()
      await dialog.getByLabel('בחר הכל להדפסה').uncheck()
      for (const item of ['curtain','shading','done']) await dialog.getByLabel(`הדפס ${item}`,{ exact:true }).check()
      assert.ok((await dialog.innerText()).includes('3 מתוך 5 להדפסה'))
      await dialog.getByRole('button',{ name:'הדפס הוראות עבודה',exact:true }).click()
      await page.waitForFunction(() => window.__workPrintDocuments.length === 1)
      const document = await page.evaluate(() => window.__workPrintDocuments[0])
      for (const location of ['curtain','shading','done']) assert.ok(document.includes(`<td>${location}</td>`),location)
      assert.ok(!document.includes('<td>quoteItem</td>'))
      await dialog.getByRole('button',{ name:'הדפס הוראות עבודה',exact:true }).click()
      await page.waitForFunction(() => window.__workPrintDocuments.length === 2)
      await dialog.getByLabel('הדפס curtain',{ exact:true }).uncheck()
      await dialog.getByLabel('הדפס issue',{ exact:true }).check()
      await dialog.getByRole('button',{ name:'הדפס הוראות עבודה',exact:true }).click()
      await page.waitForFunction(() => window.__workPrintDocuments.length === 3)
      assert.ok((await page.evaluate(() => window.__workPrintDocuments[2])).includes('<td>issue</td>'))
      await dialog.getByLabel('הדפס newShading',{ exact:true }).scrollIntoViewIfNeeded()
      const last = await dialog.getByLabel('הדפס newShading',{ exact:true }).boundingBox()
      const footer = await dialog.getByRole('button',{ name:'הדפס הוראות עבודה',exact:true }).boundingBox()
      assert.ok(last.y + last.height <= footer.y,'Last print row remains above footer')
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      await page.screenshot({ path:`.v1-test-output/print-${name}.png`,fullPage:true })
      await dialog.getByRole('button',{ name:'ביטול',exact:true }).click()
      await page.getByRole('button',{ name:'הדפס הוראות',exact:true }).click()
      await page.getByRole('dialog').getByRole('button',{ name:'ביטול',exact:true }).click()
      assert.deepEqual(await snapshot(db),before)
      assert.equal(api.calls,0)
      assert.equal((await db.query('select count(*)::int as n from public.production_item_events')).rows[0].n,0)
    }))
  }
  await test('mobile: second OFFICE user both routes, action bar and last row usable',() => session('otherOffice',mobile,async ({ page }) => {
    assert.equal(await page.getByLabel('בחר curtain',{ exact:true }).isEnabled(),true)
    assert.equal(await page.getByLabel('בחר newShading',{ exact:true }).isEnabled(),true)
    await page.getByLabel('בחר פריטים מותרים בהזמנה 99901',{ exact:true }).check()
    assert.equal(await page.getByLabel('בחר quoteItem',{ exact:true }).isChecked(),false)
    assert.equal(await page.getByLabel('בחר issue',{ exact:true }).isChecked(),false)
    await page.evaluate(() => window.scrollTo(0,document.documentElement.scrollHeight))
    const bar = await page.locator('div.fixed.bottom-0').boundingBox()
    const last = await page.getByLabel('בחר newShading',{ exact:true }).boundingBox()
    assert.ok(bar.y >= 0 && bar.y + bar.height <= 845)
    assert.ok(last.y + last.height <= bar.y,'Last action row above fixed bar')
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await page.screenshot({ path:'.v1-test-output/mobile.png',fullPage:true })
  }))
  await test('sales: only shared shading-ready, rapid double click sends one request',() => session('sales',mobile,async api => {
    const { page } = api
    assert.equal(await page.getByLabel('בחר curtain',{ exact:true }).isEnabled(),false)
    assert.equal(await page.getByLabel('בחר newShading',{ exact:true }).isEnabled(),false)
    assert.equal(await page.getByRole('button',{ name:/התראות ייצור/ }).count(),0)
    api.delay(150)
    await page.getByLabel('בחר shading',{ exact:true }).locator('..').getByRole('button',{ name:'סמן כמוכן',exact:true }).evaluate(button => { button.click(); button.click() })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).filter(button => button.textContent.includes('סמן כמוכן')).length === 0)
    assert.equal(api.calls,1)
    assert.equal(await itemHistory(api.db,ids.shading),1)
  }))
  await test('201 eligible items: group rejected, 200 selection retained on 201st, unlimited print',() => session('office',desktop,async api => {
    const { page,db } = api
    api.pageSize(500)
    await db.query(`insert into public.order_items(id,order_id,family,location,width_m,heights_m,for_execution)
      select ('00000000-0000-4000-8000-'||lpad((1000+n)::text,12,'0'))::uuid,$1,'curtain','extra-'||n,2,array[2.5],true from generate_series(1,197) n`,[orders.mixed])
    await page.getByRole('button',{ name:'רענן נתונים' }).click()
    await page.getByLabel('בחר extra-197',{ exact:true }).waitFor()
    await page.getByLabel('בחר פריטים מותרים בהזמנה 99901',{ exact:true }).click()
    assert.match(await page.getByRole('alert').innerText(),/200/)
    assert.equal(await page.locator('input[type=checkbox]:checked').count(),0)
    await db.query('delete from public.order_items where location=$1',['extra-197'])
    await page.getByRole('button',{ name:'רענן נתונים' }).click()
    await page.getByLabel('בחר extra-196',{ exact:true }).waitFor()
    await page.getByLabel('בחר פריטים מותרים בהזמנה 99901',{ exact:true }).check()
    assert.equal(await page.locator('input[type=checkbox]:checked').count(),201) // 200 items + group
    await page.getByLabel('בחר other',{ exact:true }).click()
    assert.match(await page.getByRole('alert').innerText(),/200/)
    assert.equal(await page.getByLabel('בחר other',{ exact:true }).isChecked(),false)
    assert.equal(api.calls,0)
    await page.getByRole('button',{ name:'הדפס הוראות',exact:true }).first().click()
    await page.getByRole('dialog').getByLabel('בחר הכל להדפסה').check()
    assert.equal(await page.getByRole('dialog').locator('input[type=checkbox]:checked').count(),205) // 204 items + select all
    assert.equal(await page.getByRole('dialog').getByRole('button',{ name:'הדפס הוראות עבודה',exact:true }).isEnabled(),true)
    const before = await snapshot(db)
    await page.getByRole('dialog').getByRole('button',{ name:'הדפס הוראות עבודה',exact:true }).click()
    await page.waitForFunction(() => window.__workPrintDocuments.length === 1)
    assert.deepEqual(await snapshot(db),before)
    assert.equal(api.calls,0)
  }))
  for (const path of ['/production','/items']) {
    await test(`${path}: slow refresh clears selection before request; old action blocked`,() => session('office',desktop,async api => {
      const { page } = api
      await page.getByLabel('בחר curtain',{ exact:true }).check()
      if (path === '/items') await page.locator('div.fixed.bottom-0 select').selectOption('preparation')
      api.loadDelay(150); api.pageSize(500)
      await page.evaluate(path => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const action = path === '/production' ? buttons.filter(button => button.textContent.includes('העבר להכנה')).at(-1) : buttons.find(button => button.textContent === 'עדכן')
        buttons.find(button => button.textContent === 'רענן נתונים').click()
        action.click() // Old DOM reference, before React renders loading.
      },path)
      assert.equal(api.calls,0)
      await page.getByRole('button',{ name:'רענן נתונים' }).waitFor()
      await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent === 'רענן נתונים')?.disabled)
      assert.equal(await page.getByLabel('בחר curtain',{ exact:true }).isChecked(),false)
      assert.equal(api.calls,0)
    },path))
  }
  await test('ItemsList: one successful item-history event, shared print dialog',() => session('office',desktop,async api => {
    const { page } = api
    await page.getByRole('button',{ name:'הוראות עבודה',exact:true }).click()
    await page.getByRole('dialog').getByRole('button',{ name:'ביטול',exact:true }).click()
    await page.getByLabel('בחר curtain',{ exact:true }).check()
    await page.locator('div.fixed.bottom-0 select').selectOption('preparation')
    await page.getByRole('button',{ name:'עדכן',exact:true }).click()
    await page.waitForFunction(() => !document.querySelector('div.fixed.bottom-0'))
    assert.equal(api.calls,1)
    assert.equal(await itemHistory(api.db,ids.curtain),1)
  },'/items'))
  await test('OrdersList item dialog: one item-history event; shared order print picker',() => session('office',desktop,async api => {
    const { page } = api
    const cardButton = page.getByTitle('פריטים בהזמנה',{ exact:true })
    // Find the mixed order independently of sort order.
    const mixed = page.locator('.card').filter({ hasText:'#99901' })
    await mixed.getByTitle('הוראות עבודה',{ exact:true }).click()
    await page.getByRole('dialog').getByRole('button',{ name:'ביטול',exact:true }).click()
    await mixed.getByTitle('פריטים בהזמנה',{ exact:true }).click()
    await page.getByRole('heading',{ name:'עדכון סטטוס פריטים' }).waitFor()
    await page.getByLabel('בחר curtain',{ exact:true }).check()
    await page.locator('select').filter({ has:page.locator('option[value="preparation"]') }).selectOption('preparation')
    await page.getByRole('button',{ name:'עדכן (1)',exact:true }).click()
    await page.getByRole('heading',{ name:'עדכון סטטוס פריטים' }).waitFor({ state:'hidden' })
    assert.equal(api.calls,1)
    assert.equal(await itemHistory(api.db,ids.curtain),1)
    assert.ok(await cardButton.count())
  },'/orders'))
  await test('RPC failure: selection cleared, error retained, no success event',() => session('office',desktop,async api => {
    api.fail()
    await api.page.getByLabel('בחר curtain',{ exact:true }).check()
    await api.page.getByRole('button',{ name:'העבר להכנה',exact:true }).last().click()
    await api.page.getByRole('alert').waitFor()
    await api.page.waitForFunction(() => !document.body.textContent.includes('פריטים נבחרו'))
    assert.equal(await itemHistory(api.db,ids.curtain),0)
    assert.equal((await snapshot(api.db)).find(item => item.id === ids.curtain).item_status,'new')
  }))
  await test('OrderDetail: shared multi-pick print entry point without status writes',() => session('office',mobile,async api => {
    const before = await snapshot(api.db)
    await api.page.getByRole('button',{ name:'הוראות עבודה',exact:true }).click()
    await api.page.getByRole('dialog').getByLabel('הדפס shading',{ exact:true }).check()
    await api.page.getByRole('dialog').getByRole('button',{ name:'ביטול',exact:true }).click()
    assert.deepEqual(await snapshot(api.db),before)
    assert.equal(api.calls,0)
  },`/orders/${orders.mixed}`))
  await test('partial order awaiting approval: no final selection; print keyboard focus restores opener',() => session('office',mobile,async api => {
    await api.db.query("update public.orders set payment_approved=false,status='waiting_payment' where id=$1",[orders.mixed])
    await api.page.reload()
    await api.page.getByRole('button',{ name:'הוראות עבודה',exact:true }).waitFor()
    assert.equal(await api.page.getByRole('button',{ name:'בחירה סופית',exact:true }).count(),0)
    const before = await snapshot(api.db)
    await api.page.getByRole('button',{ name:'הוראות עבודה',exact:true }).click()
    assert.equal(await api.page.getByLabel('בחר הכל להדפסה').evaluate(element => document.activeElement === element),true)
    await api.page.keyboard.press('Shift+Tab')
    assert.equal(await api.page.getByRole('dialog').getByRole('button',{ name:'ביטול',exact:true }).evaluate(element => document.activeElement === element),true)
    await api.page.keyboard.press('Tab')
    assert.equal(await api.page.getByLabel('בחר הכל להדפסה').evaluate(element => document.activeElement === element),true)
    await api.page.keyboard.press('Escape')
    assert.equal(await api.page.getByRole('button',{ name:'הוראות עבודה',exact:true }).evaluate(element => document.activeElement === element),true)
    assert.deepEqual(await snapshot(api.db),before)
    assert.equal((await api.db.query('select payment_approved,status::text from public.orders where id=$1',[orders.mixed])).rows[0].payment_approved,false)
  },`/orders/${orders.mixed}`))
  await test('viewer: no data or actions, even with synthetic screen grant',() => session('viewer',mobile,async ({ page }) => {
    await page.getByText('אין פריטים להצגה.',{ exact:true }).waitFor()
    assert.equal(await page.getByRole('checkbox').count(),0)
    assert.equal(await page.getByRole('button',{ name:'הדפס הוראות',exact:true }).isDisabled(),true)
    assert.equal(await page.getByRole('button',{ name:/התראות ייצור/ }).count(),0)
  }))
  await test('two OFFICE browsers: opening is not reading, personal read, shared completion and stale action rejection',async () => {
    const shared=await createProductionTestDb()
    try {
      await session('office',desktop,async a => {
        await session('otherOffice',mobile,async b => {
          const task=(await shared.query("select id from public.production_tasks where item_key=$1 and status='active'",[ids.curtain])).rows[0].id
          for (const api of [a,b]) {
            await api.page.getByRole('button',{ name:/התראות ייצור/ }).click()
            await api.page.getByRole('dialog',{ name:'משימות ייצור' }).locator(`[data-task-id="${task}"]`).waitFor()
            assert.equal(api.readCalls,0)
          }
          const row=a.page.getByRole('dialog').locator(`[data-task-id="${task}"]`)
          await row.getByRole('button',{ name:'סמן כנקראה · curtain',exact:true }).evaluate(button => { button.click(); button.click() })
          await a.page.getByRole('dialog').getByText('5 משימות פעילות · 4 פעילות שלא נקראו',{ exact:true }).waitFor()
          assert.equal(a.readCalls,1)
          assert.equal((await shared.query('select first_read_at from public.production_task_recipients where task_id=$1 and user_id=$2',[task,actors.otherOffice])).rows[0].first_read_at,null)
          await a.page.keyboard.press('Escape')
          const oldButton=b.page.getByLabel('בחר curtain',{ exact:true }).locator('..').getByRole('button',{ name:'העבר להכנה',exact:true })
          await oldButton.evaluate(button => { window.__oldProductionAction=button })
          await a.page.getByLabel('בחר curtain',{ exact:true }).locator('..').getByRole('button',{ name:'העבר להכנה',exact:true }).click()
          await a.page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find(button => button.textContent==='רענן נתונים')?.disabled)
          await b.page.getByRole('dialog').getByRole('button',{ name:'רענן התראות',exact:true }).click()
          await b.page.getByRole('dialog').locator(`[data-task-id="${task}"]`).waitFor({ state:'hidden' })
          await b.page.getByRole('dialog').getByRole('button',{ name:'הושלמו ובוטלו',exact:true }).click()
          const completed=b.page.getByRole('dialog').locator(`[data-task-id="${task}"]`)
          await completed.waitFor()
          assert.match(await completed.innerText(),/בוצעה/)
          assert.match(await completed.innerText(),/office/)
          assert.match(await completed.innerText(),/טרם נקראה/)
          await b.page.screenshot({ path:'.v1-test-output/notifications-history-mobile.png',fullPage:true })
          await b.page.keyboard.press('Escape')
          await b.page.evaluate(() => window.__oldProductionAction.click())
          await b.page.getByRole('alert').waitFor()
          assert.equal(await itemHistory(shared,ids.curtain),1)
          assert.equal((await snapshot(shared)).find(item => item.id===ids.curtain).item_status,'preparation')
          const instances=(await shared.query('select status from public.production_tasks where item_key=$1',[ids.curtain])).rows
          assert.equal(instances.filter(task => task.status==='completed').length,1)
          assert.equal(instances.filter(task => task.status==='active').length,1)
        },'/production',shared)
      },'/production',shared)
    } finally { await shared.close() }
  })
  for (const [name,viewport] of [['desktop',desktop],['mobile',mobile]]) {
    await test(`${name}: notification paging, full scroll, keyboard trap and focus return`,() => session('office',viewport,async api => {
      await api.act(tx => tx.query(`insert into public.order_items(id,order_id,family,location,width_m,heights_m,for_execution)
        select ('00000000-0000-4000-8000-'||lpad((5000+n)::text,12,'0'))::uuid,$1,'curtain','notification-'||n,2,array[2.5],true from generate_series(1,60) n`,[orders.mixed]))
      api.pageSize(500)
      await api.page.getByRole('button',{ name:'רענן נתונים',exact:true }).click()
      await api.page.getByLabel('בחר notification-60',{ exact:true }).waitFor()
      const bell=api.page.getByRole('button',{ name:/התראות ייצור/ })
      await bell.click()
      const dialog=api.page.getByRole('dialog',{ name:'משימות ייצור' })
      await dialog.getByRole('button',{ name:'טען עוד משימות',exact:true }).waitFor()
      assert.equal(await dialog.locator('article').count(),50)
      const last=dialog.locator('article').last()
      await last.scrollIntoViewIfNeeded()
      let bounds=await last.boundingBox()
      const footer=await dialog.getByRole('button',{ name:'טען עוד משימות',exact:true }).boundingBox()
      assert.ok(bounds.y+bounds.height<=footer.y,'Last row above paging footer')
      await dialog.getByRole('button',{ name:'טען עוד משימות',exact:true }).click()
      await api.page.waitForFunction(() => document.querySelectorAll('[data-task-id]').length===65)
      await dialog.locator('article').last().scrollIntoViewIfNeeded()
      bounds=await dialog.locator('article').last().boundingBox()
      const panel=await dialog.boundingBox()
      assert.ok(bounds.y+bounds.height<=panel.y+panel.height+1)
      assert.ok(await api.page.evaluate(() => document.documentElement.scrollWidth<=innerWidth))
      await api.page.screenshot({ path:`.v1-test-output/notifications-${name}.png`,fullPage:true })
      await dialog.getByRole('button',{ name:'סגור התראות',exact:true }).focus()
      await api.page.keyboard.press('Shift+Tab')
      assert.equal(await dialog.locator('article').last().getByRole('button',{ name:/סמן כנקראה/ }).evaluate(element => document.activeElement===element),true)
      await api.page.keyboard.press('Tab')
      assert.equal(await dialog.getByRole('button',{ name:'סגור התראות',exact:true }).evaluate(element => document.activeElement===element),true)
      await api.page.keyboard.press('Escape')
      assert.equal(await bell.evaluate(element => document.activeElement===element),true)
      assert.equal(api.readCalls,0)
    }))
  }
  await test('notification load/error/empty/history and visibility refresh without repeated background calls',() => session('office',desktop,async api => {
    api.feedDelay(150)
    api.failFeed()
    await api.page.getByRole('button',{ name:/התראות ייצור/ }).click()
    await api.page.getByRole('dialog').getByRole('status').waitFor()
    await api.page.getByRole('dialog').getByRole('alert').waitFor()
    api.feedDelay(0)
    await api.page.getByRole('dialog').getByRole('button',{ name:'רענן התראות',exact:true }).click()
    await api.page.getByRole('dialog').getByRole('button',{ name:'סמן כנקראה · curtain',exact:true }).waitFor()
    await api.act(tx => tx.query('update public.order_items set for_execution=false where for_execution'))
    await api.page.getByRole('dialog').getByRole('button',{ name:'רענן התראות',exact:true }).click()
    await api.page.getByText('אין משימות ייצור פעילות.',{ exact:true }).waitFor()
    await api.page.getByRole('dialog').getByRole('button',{ name:'הושלמו ובוטלו',exact:true }).click()
    await api.page.getByRole('dialog').getByText('בוטלה · הפריט הוצא מביצוע',{ exact:false }).first().waitFor()
    await api.page.keyboard.press('Escape')
    await api.act(tx => tx.query('update public.order_items set for_execution=true where id=$1',[ids.curtain]))
    await api.page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await api.page.getByRole('button',{ name:'התראות ייצור, 1 פעילות שלא נקראו',exact:true }).waitFor()
    const calls=api.feedCalls
    await api.page.waitForTimeout(500)
    assert.equal(api.feedCalls,calls,'No immediate duplicate polling loop')
  }))
  await test('notification link uses existing permitted items route when production screen is blocked',() => session('office',mobile,async api => {
    await api.page.getByRole('button',{ name:/התראות ייצור/ }).click()
    await api.page.getByRole('dialog').getByRole('button',{ name:'פתח משימה · curtain',exact:true }).click()
    await api.page.waitForURL(`**/items?order=${orders.mixed}#item-${ids.curtain}`)
    await api.page.getByLabel('בחר curtain',{ exact:true }).waitFor()
    await api.page.waitForFunction(id => document.activeElement?.id===`item-${id}`,ids.curtain)
    assert.equal(api.readCalls,1)
    assert.equal(api.calls,0)
    assert.equal((await snapshot(api.db)).find(item => item.id===ids.curtain).item_status,'new')
  },'/items',null,['production']))
  console.log(`${passed} browser suites passed; local authenticated SQL adapter; desktop/mobile print screenshots saved.`)
} finally { await browser.close(); await new Promise(r => server.close(r)) }
