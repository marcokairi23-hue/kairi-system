// Isolated component browser test: mocked auth/RPC, localhost only, no .env.
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { chromium } from 'playwright'

const mock = `
const items=[1,2,3].map(n=>({id:'item-'+n,order_id:'order-1',order_number:9001,customer_name:'לקוח בדיקה',location:'פריט '+n,width_m:n,heights_m:[2.4],sewing_type:'שטוח',fabric_text:'בד',cut_instruction_id:null}));
let draft=null;
window.__calls=[];window.__blocked=false;window.__lost=false;window.__documents=[];
window.open=()=>window.__blocked ? null : {closed:false,document:{open(){},write(html){window.__documents.push(html)},close(){}},focus(){},print(){},close(){this.closed=true}};
export const supabase={rpc:async(name,args)=>{
window.__calls.push({name,args});
if(name==='cut_queue_v1')return {data:{items:structuredClone(items),drafts:draft?.status==='draft'?[structuredClone(draft)]:[]},error:null};
if(name==='prepare_cut_instruction_v1'){
 if(draft?.status==='pending')return {error:{message:'locked'}};
 draft??={id:args.p_id,order_id:args.p_order_id,item_ids:args.p_item_ids,snapshot:items.filter(i=>args.p_item_ids.includes(i.id)),status:'draft',created_at:new Date().toISOString()};
 return {data:structuredClone(draft),error:null};
}
if(name==='activate_cut_instruction_v1'){
 draft.status='pending';items.forEach(i=>{if(draft.item_ids.includes(i.id))i.cut_instruction_id=draft.id});
 if(window.__lost){window.__lost=false;return {error:{message:'response lost'}}}
 return {data:structuredClone(draft),error:null};
}
throw Error(name);
}};`
const bundle=await build({
  stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import CutterWork from './src/pages/items/CutterWork';createRoot(document.getElementById('root')).render(<CutterWork/>);`,resolveDir:process.cwd(),loader:'tsx'},
  bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"test"'},
  plugins:[{name:'isolated-mocks',setup(b){
    b.onResolve({filter:/lib\/auth$/},()=>({path:'auth',namespace:'mock'}))
    b.onResolve({filter:/lib\/supabase$/},()=>({path:'supabase',namespace:'mock'}))
    b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:args.path==='auth'?
      `export const useAuth=()=>({profile:{id:'cutter',role:'cutter',is_active:true}});`:mock,loader:'js'}))
  }}],
})
const server=createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].text)}
  else{res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<html lang="he" dir="rtl"><div id="root"></div><script src="/bundle.js"></script></html>')}
})
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve))
let browser
try {
  browser=await chromium.launch({headless:true})
  const page=await browser.newPage({viewport:{width:390,height:844}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:')?route.continue():route.abort())
  await page.goto('http://127.0.0.1:'+server.address().port)
  await page.getByRole('button',{name:'הדפס הוראות עבודה',exact:true}).click()
  const dialog=page.getByRole('dialog')
  assert.equal(await dialog.getByRole('checkbox').count(),3)
  await dialog.getByRole('checkbox').nth(0).check();await dialog.getByRole('checkbox').nth(1).check()
  assert.equal(await dialog.getByRole('button',{name:'הודפס — הפעל הוראה'}).isEnabled(),false)
  await page.evaluate(()=>{window.__blocked=true})
  await dialog.getByRole('button',{name:'פתח הדפסת טיוטה'}).click()
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.name==='prepare_cut_instruction_v1').length),0)
  await page.evaluate(()=>{window.__blocked=false})
  await dialog.getByRole('button',{name:'פתח הדפסת טיוטה'}).click()
  await page.waitForFunction(()=>window.__documents.length===1)
  assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.name==='activate_cut_instruction_v1').length),0)
  await dialog.getByRole('button',{name:'סגור ללא הפעלה'}).click()
  await page.getByRole('button',{name:/המשך טיוטה להזמנה/}).click()
  assert.equal(await dialog.getByRole('checkbox').nth(0).isChecked(),true)
  await dialog.getByRole('button',{name:'פתח הדפסת טיוטה'}).click()
  await page.waitForFunction(()=>window.__documents.length===2)
  const printed=await page.evaluate(()=>window.__documents[1])
  assert.ok(printed.includes('פריט 1')&&printed.includes('פריט 2')&&!printed.includes('פריט 3'))
  await page.evaluate(()=>{window.__lost=true})
  await dialog.getByRole('button',{name:'הודפס — הפעל הוראה'}).click()
  await dialog.getByText(/לא התקבל אישור הפעלה/).waitFor()
  await dialog.getByRole('button',{name:'הודפס — הפעל הוראה'}).click()
  await page.getByRole('dialog').waitFor({state:'hidden'})
  const calls=await page.evaluate(()=>window.__calls.filter(c=>c.name==='activate_cut_instruction_v1'))
  assert.equal(calls.length,2);assert.equal(calls[0].args.p_id,calls[1].args.p_id)
  await page.getByRole('button',{name:'הדפס הוראות עבודה',exact:true}).click()
  assert.equal(await page.getByRole('dialog').getByRole('checkbox').count(),1)
  assert.deepEqual(errors,[])
  console.log('PASS: browser component at mobile viewport; subset dialog, popup failure, no activation on print/cancel, draft reopen, explicit activation retry, pending excluded')
} finally { await browser?.close();await new Promise(resolve=>server.close(resolve)) }
