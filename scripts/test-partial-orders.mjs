import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
const source = readFileSync(new URL('../src/lib/statusHelpers.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const exports = {}
vm.runInNewContext(compiled, { exports })
const { deriveV1OrderStatus, calcProgress, displayedOrderStatus } = exports
const item = (status, issue_kind = null) => ({ item_status: status, issue_kind, for_execution: true })
const order = { status: 'in_execution', payment_approved: true, final_total: 1000, order_items: [item('done'), item('ready')], payments: [{ amount: 250 }] }
assert.equal(deriveV1OrderStatus(order), 'in_execution') // deposit + partial delivery
assert.equal(deriveV1OrderStatus({ ...order, payments: [{ amount: 1000 }] }), 'in_execution') // payment does not imply delivery
assert.equal(deriveV1OrderStatus({ ...order, order_items: [item('done'), item('done')] }), 'in_execution') // delivery does not imply full payment
assert.equal(deriveV1OrderStatus({ ...order, order_items: [item('done'), item('done')], payments: [{ amount: 250 }, { amount: 750 }] }), 'completed')
for (const kind of ['defect', 'wrong_dimensions', 'missing_delivery']) {
  const items = [item('done'), item('done', kind)]
  assert.equal(deriveV1OrderStatus({ ...order, order_items: items, payments: [{ amount: 1000 }] }), 'in_execution')
  assert.equal(calcProgress(items).isComplete, false)
}
assert.equal(deriveV1OrderStatus({ ...order, payment_approved: false }), 'waiting_payment')
assert.equal(deriveV1OrderStatus({ ...order, status: 'cancelled' }), 'cancelled')
const fullyPaidIcredit = { ...order, order_items: [item('done'), item('done')], payments: [{ amount: 1000, provider: 'icredit' }] }
assert.equal(deriveV1OrderStatus(fullyPaidIcredit), 'completed') // proposal
assert.equal(displayedOrderStatus(fullyPaidIcredit), 'in_execution') // visible state awaits acceptance
assert.equal(displayedOrderStatus({ ...fullyPaidIcredit, status: 'completed' }), 'completed')
// A receipt refresh cannot persist a proposal without an employee accepting it.
let current = fullyPaidIcredit, updates = 0, history = 0
const supabase = { from: table => ({
  select: () => ({ eq: () => ({ single: async () => ({ data: current, error: null }) }) }),
  update: () => { updates++; return { eq: async () => ({ error: null }) } },
  insert: async () => { assert.equal(table, 'order_status_history'); history++; return { error: null } },
}) }
const recalcSource = readFileSync(new URL('../src/lib/recalculateOrderStatus.ts', import.meta.url), 'utf8').replace(/^import .*\r?\n/gm, '')
const recalcCode = ts.transpileModule(recalcSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText
const recalcExports = {}
vm.runInNewContext(recalcCode, { exports: recalcExports, supabase, deriveV1OrderStatus })
assert.equal(await recalcExports.recalculateOrderStatus('order', 'worker'), 'in_execution')
assert.equal(updates, 0)
assert.equal(await recalcExports.recalculateOrderStatus('order', 'worker', { confirmSuggestion: true }), 'completed')
assert.equal(updates, 1); assert.equal(history, 1)
current = { ...fullyPaidIcredit, order_items: [item('done', 'defect')] }
assert.equal(await recalcExports.recalculateOrderStatus('order', 'worker', { confirmSuggestion: true }), 'in_execution')
assert.equal(updates, 1)
console.log('Partial orders: deposits, staged payments, partial supply and unresolved issues passed')
