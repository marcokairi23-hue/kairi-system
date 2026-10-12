import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'

const source = readFileSync(new URL('../supabase/functions/icredit-webhook/index.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ''), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText
const id = '11111111-1111-4111-8111-111111111111'
const group = '22222222-2222-4222-8222-222222222222'
const payload = { SaleId: id, GroupPrivateToken: group, TransactionAmount: '100.00', TransactionCurrency: '1', Order: 'FORGED', PhoneNumber: 'FORGED' }
const sale = { SaleId: id, GroupId: group, Status: 0, TransactionStatus: 0, TransactionType: 1, TransactionParamJ: 0, Amount: 100, TransactionAmount: 10000, Order: '9087', PhoneNumber: '+972 50-1234567' }

async function run({ mode = 'live', input = payload, verification = 'VERIFIED', details = sale, unavailable = false, configError = false, dbError = false, form = false } = {}) {
  let handler, calls = [], rpcArgs
  const db = {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: { mode, group_id: group, environment: 'production' } }, error: configError }) }) }) }),
    rpc: async (name, args) => { rpcArgs = args; return { data: { status: 'recorded', payment_recorded: true }, error: dbError } },
  }
  vm.runInNewContext(compiled, {
    Deno: { env: { get: () => 'unused' }, serve: fn => { handler = fn } },
    createClient: () => db, Request, Response, URLSearchParams, AbortSignal,
    fetch: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) })
      if (unavailable) throw Error('timeout')
      return new Response(JSON.stringify(url.endsWith('/Verify') ? { Status: verification } : details))
    },
  })
  const response = await handler(new Request('https://example.test', {
    method: 'POST', headers: { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: form ? new URLSearchParams(input).toString() : JSON.stringify(input),
  }))
  return { status: response.status, body: await response.json(), calls, rpcArgs }
}

const disabled = await run({ mode: 'off', input: null })
assert.equal(disabled.body.status, 'disabled'); assert.equal(disabled.calls.length, 0); assert.equal(disabled.rpcArgs, undefined)
assert.equal((await run({ configError: true })).status, 503)
for (const input of [null, {}, { ...payload, SaleId: 'bad' }, { ...payload, GroupPrivateToken: 'bad' }, { ...payload, TransactionAmount: '100.001' }, { ...payload, TransactionAmount: '-1' }]) {
  const result = await run({ input }); assert.equal(result.body.status, 'rejected'); assert.equal(result.calls.length, 0)
}
assert.equal((await run({ input: { ...payload, TransactionCurrency: '2' } })).body.status, 'rejected')
const unverified = await run({ verification: 'NOTVERIFIED' })
assert.equal(unverified.body.status, 'rejected'); assert.equal(unverified.calls.length, 1); assert.equal(unverified.rpcArgs, undefined)
for (const details of [{ ...sale, GroupId: id }, { ...sale, SaleId: group }, { ...sale, Status: 1 }, { ...sale, TransactionStatus: 5 }, { ...sale, TransactionParamJ: 5 }, { ...sale, TransactionType: 11 }, { ...sale, Amount: 101 }]) {
  const result = await run({ details }); assert.equal(result.body.status, 'rejected'); assert.equal(result.rpcArgs, undefined)
}
assert.equal((await run({ unavailable: true })).status, 503)
assert.equal((await run({ dbError: true })).status, 503)
for (const form of [false, true]) {
  const success = await run({ form }); assert.equal(success.status, 200)
  assert.equal(success.rpcArgs.p_order_number, '9087'); assert.equal(success.rpcArgs.p_phone, '0501234567')
  assert.equal(success.rpcArgs.p_amount, 100); assert.equal(success.rpcArgs.p_group_id, group)
  assert.equal(success.calls[0].body.TotalAmount, 100)
}
console.log('iCredit webhook: safety and processing cases passed, including ILS/agorot regression')
