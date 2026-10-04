# KAIRI SYSTEM — V1 Workflow Contract

## Current precedence and execution update

The user-supplied `KAIRI_SYSTEM_V1_SPRINTS_SOT.md` supersedes conflicting historical rules below: all shading, including every Roman curtain, routes to Office. No Roman-to-Cutter exception is approved in V1.

The user deferred all production migrations to one separate consolidated sprint M1. Feature sprints may prepare and locally test SQL; application, production acceptance and dependent UI deployment remain M1 work. Sprint 1 atomic creation now requires the draft `create_order_v1` RPC; do not deploy that frontend before the RPC is installed and verified.

**Status:** Authoritative product and implementation contract for V1

**Approved scope:** Stable end-to-end replica of the existing operational workflow with minor improvements only

**Established:** 2026-09-30

**Sprint 0 effect:** Documentation and baseline only; no application behavior, migration, schema, or production-data change

## 1. Workflow overview

The V1 operational path is:

`NEW ORDER → PAYMENT GATE → ITEM ROUTING → CUTTER / OFFICE → PRODUCTION → GOODS RECEIPT → READY → PICKUP / INSTALLATION → SIGNATURES → OFFICE/ADMIN CLOSURE`

The contract separates eight concerns that must not be collapsed into one status field:

1. payment state;
2. order state;
3. item state;
4. current owner;
5. allowed next action;
6. actor and role;
7. transition timestamp; and
8. immutable audit/history event.

An order may have items owned by different teams at the same time. Order-level state summarizes the customer/order lifecycle; item-level state controls execution.

## 2. Payment gate

### Payment routes

| Route | Initial treatment | Execution gate |
|---|---|---|
| Cash | Accepted in the field when a valid payment/deposit is recorded | `APPROVED` immediately after recording |
| Check | Accepted in the field when a valid payment/deposit is recorded | `APPROVED` immediately after recording |
| Credit card handled by office | Office must collect/confirm | `PENDING_OFFICE_CONFIRMATION` until Office/Admin confirms |
| Bank transfer | Office must verify/confirm | `PENDING_OFFICE_CONFIRMATION` until Office/Admin confirms |
| Quote | No execution payment | `QUOTE` and every item remains outside execution |

No item may enter operational execution before the payment gate is `APPROVED`. Approval of a deposit opens execution even if an order balance remains; deposit approval and balance settlement are separate facts.

### Payment states

| State | Meaning | Legal next states |
|---|---|---|
| `QUOTE` | Commercial proposal only; no executable work | `PENDING_OFFICE_CONFIRMATION` or `APPROVED` when converted through an approved payment route |
| `PENDING_OFFICE_CONFIRMATION` | Card collection or transfer confirmation is outstanding | `APPROVED`, `REJECTED` |
| `APPROVED` | Deposit/payment gate passed; executable items may be routed | No normal reversal in V1; correction requires an audited Office/Admin action |
| `REJECTED` | Payment attempt rejected or voided; execution remains blocked | `PENDING_OFFICE_CONFIRMATION` after a new attempt, or cancellation |

Payment route, payment-gate state, individual payment transactions, custody, and remaining balance are distinct concepts. The current V1 contract does not infer one from another silently.

## 3. Item routing rules

Routing is assigned per executable item after payment approval:

| Product | Route | Initial owner | Initial operational item state |
|---|---|---|---|
| Regular sewn curtain | Cutter/internal | `CUTTER` | `AWAITING_CUT` |
| Roller | Office/supplier | `OFFICE_SUPPLIER` | `AWAITING_SUPPLIER_ORDER` |
| Zebra | Office/supplier | `OFFICE_SUPPLIER` | `AWAITING_SUPPLIER_ORDER` |
| Venetian | Office/supplier | `OFFICE_SUPPLIER` | `AWAITING_SUPPLIER_ORDER` |
| Roman | Office/supplier by default | `OFFICE_SUPPLIER` | `AWAITING_SUPPLIER_ORDER` |
| Roman made from KAIRI-owned fabric and requiring internal cutting | Cutter/internal exception | `CUTTER` | `AWAITING_CUT` |

The Roman exception must be represented explicitly on the item; subtype alone is not enough. A mixed order can therefore have `MULTIPLE` as its derived order owner while each item retains one concrete owner.

Items not selected for execution and quote items use `OUTSIDE_EXECUTION`; they are not routed and do not count toward order readiness.

## 4. Cutter flow

1. The Cutter work list shows orders containing cutter-owned, eligible items. The presentation is order-level, but selection and transitions are item-level.
2. **Print Work Instructions** opens a dialog containing only eligible cutter items for that order.
3. The Cutter may select any eligible subset.
4. Printing creates one instruction action/document and moves only the selected items from `AWAITING_CUT` to `CUT_CONFIRMATION_PENDING`.
5. A pending item is locked against another print or production advance until its previous cut is confirmed.
6. Cut confirmation requires selected item IDs, actual meters cut, acting user, role, and timestamp.
7. Confirmation moves only those items to `IN_PREPARATION` and creates immutable events linked to the instruction action/document.
8. Remaining `AWAITING_CUT` items stay eligible for a later instruction sheet.
9. An item may then move `IN_PREPARATION → AT_SEWING`; return from sewing is handled through Goods Receipt.

The V1 structure must allow an instruction document/action to have many items, and an item to participate in sequential instruction actions, without implementing cross-order grouping or roll optimization.

## 5. Office/supplier flow

1. Supplier/shading items appear in the Office queue as `AWAITING_SUPPLIER_ORDER`.
2. Choosing **Ordered** opens a confirmation dialog.
3. The dialog requires a supplier from the short V1 supplier list and explicit confirmation.
4. Confirmation records supplier, item ID, actor, actor role, timestamp, and transition, then changes the item to `ORDERED`.
5. `ORDERED` items remain in supplier tracking.
6. Office/Admin may later confirm `ORDERED → READY`.
7. Every transition creates an immutable history event.

Supplier identity belongs to the supplier-order action/item relationship; it must not be stored only in editable display text.

## 6. Goods Receipt flow

Goods Receipt controls sewn-curtain return:

1. Office selects one or many `AT_SEWING` items, individually or in bulk.
2. The selection creates a temporary `DRAFT` Goods Receipt.
3. The draft shows selected item IDs, order references, width totals, basic grouping by sewing type or product type, creator, and creation timestamp.
4. Office reviews the proposed `READY` changes before confirmation.
5. Only confirmed receipts move their selected items to `READY`.
6. Confirmation records confirmer and confirmation timestamp and emits item events plus a receipt-confirmed event.
7. A confirmed receipt has a printable/downloadable representation.
8. A draft may be discarded without changing item state. A confirmed receipt is not normally editable; correction requires an auditable reversal/correction workflow to be specified later.

Minimum receipt lifecycle: `DRAFT → CONFIRMED` or `DRAFT → CANCELLED`.

## 7. Ready-order logic

An executable item is ready when its item state is `READY`. Items in `OUTSIDE_EXECUTION` or `CANCELLED` do not count.

When an order has at least one executable, non-cancelled item and all such items are `READY`, the system automatically changes the order from `IN_EXECUTION` to `READY` in the same authoritative operation as the triggering item/receipt confirmation.

The automatic order transition must:

- be stored in history;
- identify the triggering actor and source action/document;
- include a timestamp and relevant item IDs; and
- render as a prominent milestone in the order activity view, not as an ordinary note.

If any executable item is not `READY`, the order must not be `READY`.

## 8. Pickup and track preparation

- Pickup is free and coordinated in advance.
- Office/Admin can select multiple ready pickup orders and generate one combined Track Cutting Report.
- The report groups requirements by order and may span any number of pages.
- Only executable regular-curtain items contribute track requirements.
- Each valid regular-curtain item contributes its required track width.
- Roller, Zebra, Venetian, and Roman items must never generate a track-cutting requirement, including Roman items routed through the Cutter for fabric cutting.
- Report generation is logged with selected order IDs and contributing item IDs.

The report is a preparation artifact; generating it does not by itself complete or close an order.

## 9. Installation flow

1. Installer sees relevant `READY` orders whose fulfillment route is installation.
2. Installer may select multiple order cards.
3. One print action produces all selected orders; every order begins on a separate printed page.
4. A successful print/accept action changes every selected order to `WAITING_FOR_INSTALLATION`.
5. The transition records installer/actor, timestamp, selected order IDs, and history events.
6. Partial failure must not leave printed/accepted orders ambiguous; implementation must use an authoritative transactional or retry-safe boundary.

`WAITING_FOR_INSTALLATION` means the Installer has accepted responsibility for the order.

## 10. Waiting for installation and closure

Entering `WAITING_FOR_INSTALLATION` enables order-level:

- Customer Signature;
- Installer Signature; and
- Photo/Photos upload, with multiple photos allowed.

Customer and Installer signatures are both mandatory for final closure. Photos are enabled but not a closure prerequisite in this contract.

Only Office and Admin may perform final closure. The closing action validates both signatures, changes the order to `COMPLETED`, and writes a complete immutable event. Sales, Cutter, and Installer may not finalize the order.

The pickup completion/closure path is intentionally unresolved; see Known open decisions. Until resolved, generating a pickup Track Cutting Report is not equivalent to `COMPLETED`.

## 11. Order states

| State | Meaning | Owner summary |
|---|---|---|
| `DRAFT` | Order has not been submitted | `SALES` |
| `QUOTE` | Proposal only; no execution | `SALES` |
| `WAITING_FOR_PAYMENT` | Card/transfer confirmation outstanding or payment rejected | `PAYMENT_OFFICE` |
| `IN_EXECUTION` | Payment approved and at least one item is in operational work | Derived from item owners; may be `MULTIPLE` |
| `READY` | All executable, non-cancelled items are ready | `READY_COORDINATION` |
| `WAITING_FOR_INSTALLATION` | Installer accepted printed installation work | `INSTALLER` |
| `COMPLETED` | Final closure succeeded | `NONE` |
| `CANCELLED` | Order cancelled through an authorized audited action | `NONE` |

These are canonical business names. Existing database enum names may require an explicit mapping during a future implementation Sprint; Sprint 0 does not change them.

## 12. Item states

| State | Meaning | Normal owner |
|---|---|---|
| `OUTSIDE_EXECUTION` | Quote or item not selected for execution | `NONE` |
| `AWAITING_CUT` | Eligible for Cutter instruction selection | `CUTTER` |
| `CUT_CONFIRMATION_PENDING` | Instructions printed; actual cut confirmation required and item locked | `CUTTER` |
| `IN_PREPARATION` | Actual cut confirmed; internal preparation active | `CUTTER` |
| `AT_SEWING` | Item is with sewing and awaits Goods Receipt | `SEWING_EXTERNAL` / Office oversight |
| `AWAITING_SUPPLIER_ORDER` | Supplier action has not been confirmed | `OFFICE_SUPPLIER` |
| `ORDERED` | Supplier and order action confirmed | `OFFICE_SUPPLIER` |
| `READY` | Item physically ready | `READY_COORDINATION` |
| `CANCELLED` | Item cancelled through an authorized audited action | `NONE` |

Item readiness is physical/operational. Installation acceptance, signatures, and final order completion remain order-level concerns.

## 13. Current-owner model

Allowed owner values are:

- `SALES`
- `PAYMENT_OFFICE`
- `CUTTER`
- `OFFICE_SUPPLIER`
- `SEWING_EXTERNAL`
- `READY_COORDINATION`
- `INSTALLER`
- `OFFICE_CLOSURE`
- `MULTIPLE` (derived order summary only)
- `NONE`

An item has at most one current owner at a time. An order owner is derived from payment/order state and the set of active item owners. `MULTIPLE` is valid for a mixed order and must not erase item ownership.

`allowed_next_action` is derived from payment, order, item, owner, role, and prerequisites. It is not a substitute for any state. The server-side authoritative operation must re-check all prerequisites even if the UI hides or disables an action.

## 14. Legal transitions

### Payment transitions

| From | Action | To | Actor | Prerequisites |
|---|---|---|---|---|
| New route | Save quote | `QUOTE` | Sales | Valid order draft |
| New route | Record cash/check deposit | `APPROVED` | Sales, Office, Admin | Positive valid payment/deposit record |
| New route | Submit card/transfer | `PENDING_OFFICE_CONFIRMATION` | Sales, Office, Admin | Route and requested amount recorded |
| `PENDING_OFFICE_CONFIRMATION` | Confirm collection/transfer | `APPROVED` | Office, Admin | Office evidence/confirmation |
| `PENDING_OFFICE_CONFIRMATION` | Reject/void | `REJECTED` | Office, Admin | Reason recorded |
| `REJECTED` | Submit new attempt | `PENDING_OFFICE_CONFIRMATION` | Sales, Office, Admin | New payment attempt |

### Order transitions

| From | Action | To | Actor | Prerequisites |
|---|---|---|---|---|
| `DRAFT` | Save as quote | `QUOTE` | Sales | Valid order |
| `DRAFT` / `QUOTE` | Submit for office payment | `WAITING_FOR_PAYMENT` | Sales | Card/transfer route |
| `DRAFT` / `QUOTE` / `WAITING_FOR_PAYMENT` | Approve payment and route items | `IN_EXECUTION` | Per payment table | Payment state `APPROVED`; at least one executable item |
| `IN_EXECUTION` | Automatic readiness milestone | `READY` | System attributed to triggering actor | All executable, non-cancelled items `READY` |
| `READY` | Installer print/accept | `WAITING_FOR_INSTALLATION` | Installer | Installation route; successful batch print/accept |
| `WAITING_FOR_INSTALLATION` | Final closure | `COMPLETED` | Office, Admin | Both required signatures present |
| Nonterminal | Authorized cancellation | `CANCELLED` | Office, Admin; Sales scope remains open | Reason and audit event |

### Item transitions

| From | Action | To | Actor | Prerequisites |
|---|---|---|---|---|
| Outside operational state | Route after payment | `AWAITING_CUT` | System attributed to approver | Payment approved; Cutter route |
| Outside operational state | Route after payment | `AWAITING_SUPPLIER_ORDER` | System attributed to approver | Payment approved; Office route |
| `AWAITING_CUT` | Print selected instructions | `CUT_CONFIRMATION_PENDING` | Cutter | Item eligible and selected |
| `CUT_CONFIRMATION_PENDING` | Confirm actual cut | `IN_PREPARATION` | Cutter | Actual meters and instruction reference recorded |
| `IN_PREPARATION` | Send to sewing | `AT_SEWING` | Cutter, Office, Admin | Preparation complete |
| `AT_SEWING` | Confirm Goods Receipt | `READY` | Office, Admin | Item is on confirmed receipt |
| `AWAITING_SUPPLIER_ORDER` | Confirm Ordered | `ORDERED` | Office, Admin | Supplier selected and explicit confirmation |
| `ORDERED` | Mark Ready | `READY` | Office, Admin | Physical readiness confirmed |
| Any nonterminal operational state | Authorized item cancellation | `CANCELLED` | Office, Admin; Sales scope remains open | Reason and audit event |

## 15. Illegal transitions and invariants

- No item enters execution before payment state `APPROVED`.
- A quote item may not be routed or shown in operational queues.
- Printing Cutter instructions may affect only selected eligible Cutter items.
- `CUT_CONFIRMATION_PENDING` may not be printed again, advanced, or included in another unconfirmed cut action.
- Cut confirmation without actual meters, item IDs, actor, and timestamp is invalid.
- A supplier item may not become `ORDERED` without supplier selection and explicit confirmation.
- A sewn item may not become `READY` before Goods Receipt confirmation.
- An order may not become `READY` unless it has at least one executable item and every executable, non-cancelled item is `READY`.
- A shading product may not contribute to a Track Cutting Report; Roman is excluded even when internal fabric cutting was required.
- Installation batch printing must start each order on a separate page.
- Signature/photo fields may not be enabled before `WAITING_FOR_INSTALLATION`.
- An order may not become `COMPLETED` without both required signatures.
- Sales, Cutter, and Installer may not perform final closure.
- History events may not be edited or deleted as ordinary application data.
- A client-only UI check never authorizes a transition; the authoritative write path must enforce it.

## 16. Role/action permission matrix

Legend: `Y` allowed, `S` scoped, `—` denied. Admin may perform operational override actions only with normal prerequisites and logging; it may not bypass invariants.

| Action | Admin | Office | Sales / Agent | Cutter | Installer |
|---|---:|---:|---:|---:|---:|
| View all orders/items | Y | Y | — | — | — |
| View own/scoped work | Y | Y | S: own orders | S: Cutter items/orders | S: installation orders |
| Create order/quote | Y | — | Y | — | — |
| Record field cash/check | Y | Y | Y | — | — |
| Confirm card/bank payment | Y | Y | — | — | — |
| Change execution selection before routing | Y | Y | S: own order before approval | — | — |
| Print Cutter instructions | Y | S: support | — | Y | — |
| Confirm cut/meters | Y | — | — | Y | — |
| Send internal item to sewing | Y | Y | — | Y | — |
| Confirm supplier Ordered | Y | Y | — | — | — |
| Mark supplier item Ready | Y | Y | — | — | — |
| Create/confirm Goods Receipt | Y | Y | — | — | — |
| Print/download Goods Receipt | Y | Y | — | S: view assigned item artifact | — |
| Generate Track Cutting Report | Y | Y | — | S: print prepared work | — |
| Batch print/accept installation orders | Y | S: support/reprint | — | — | Y |
| Upload installation photos | Y | Y | — | — | Y |
| Capture customer signature | Y | Y | — | — | Y |
| Add Installer signature | — | — | — | — | Y |
| Final order closure | Y | Y | — | — | — |
| View operational history in scope | Y | Y | S: own orders | S: Cutter scope | S: Installer scope |
| Edit/delete operational history | — | — | — | — | — |

Whether Office may create orders and whether Sales may cancel its own pre-execution order remain open decisions rather than implicit permissions.

## 17. Logging and audit contract

Every operational transition creates an immutable event in the same authoritative success boundary as the state change.

Minimum event shape:

| Field | Requirement |
|---|---|
| `id` | Stable unique event ID |
| `entity_type` | `order`, `order_item`, `payment`, `cut_instruction`, `goods_receipt`, or report/document type |
| `entity_id` | ID of the changed entity |
| `action` | Stable machine-readable action code |
| `previous_state` | State before the action; nullable only for creation |
| `new_state` | State after the action; nullable only for non-state events |
| `actor_user_id` | Authenticated actor or explicitly identified system actor |
| `actor_role` | Role captured at event time |
| `occurred_at` | Server timestamp |
| `metadata` | Structured optional data |

Relevant metadata includes supplier, actual meters cut, selected item IDs, instruction/document ID, receipt ID, installer, selected order IDs, payment route, payment attempt ID, report contributors, reason, and triggering event ID.

Rules:

- Operational history is append-only for normal application roles.
- Notes may supplement an event but may not replace structured action/state fields.
- Actor role is snapshotted; later profile changes must not rewrite history.
- Automatic order readiness records a distinct high-importance milestone event.
- Multi-entity actions use a shared correlation/action ID.
- State change and event creation must not succeed independently.
- Corrections append compensating events; they do not edit historical records.

## 18. Verified repository baseline at Sprint 0

Evidence inspected: `main` at `5b105e7`, recent commits, `src/pages/orders`, `src/pages/items`, authentication/role code, activity code, and committed Supabase migrations `0001`–`0014`.

### Existing foundations

- New order supports the V1 routes `cash`, `check`, `credit_card`, `bank_transfer`, and `quote`; Sprint 1 removes `pay_later` from new-order creation.
- Cash/check currently create an order in database status `ready`; card/transfer become `pending_payment`; quote items are saved with `for_execution = false`.
- Item-level `production_route` is used by the code: curtains are saved `internal`, shading `external`, and the UI resolves these to Cutter/Office routes.
- Production/item screens group work by order and allow subset selection, work-instruction printing, bulk progression, and item history inserts.
- Existing code models internal `new → cut → sewing → ready` and external `new → ordered_from_supplier → arrived → ready` tracks.
- Orders currently use `draft`, `quote`, `pending_payment`, `ready`, `in_production`, `ready_for_install`, `picked_by_installer`, `completed`, and `cancelled` across schema additions and frontend code.
- Two installation signature URLs and an installer-name field exist. The order page exposes signatures after `picked_by_installer` and suggests completion when both are present.
- `order_status_history` and payments are combined in the activity UI. Migration `0009` narrows history RLS to Admin/Office and the owning Sales user.

### Gaps between repository and this contract

- `payments` has no explicit payment approval/status or custody state; existing rows are treated as received amounts.
- `production_route` and supplier/date columns are referenced by code/migrations, but their original creation is not present in the committed migration chain. The repository alone cannot reconstruct the live schema from zero.
- The committed `item_status` enum creation lacks `ordered_from_supplier` and `arrived` even though current code uses them.
- Current roles are `admin`, `office`, `sales`, and `viewer`; Cutter and Installer roles are not implemented.
- Roman items cannot currently express the own-fabric Cutter exception in the order form; all shading items are written as external.
- Work-instruction printing does not create `CUT_CONFIRMATION_PENDING`, lock items, capture actual meters, or persist a cut-instruction entity.
- Supplier advancement does not require a supplier confirmation dialog or store a supplier action.
- There is no Goods Receipt entity, draft/confirmation flow, or printable receipt.
- All-ready order progression is a user-applied suggestion, not an automatic authoritative transition.
- There is no Pickup Track Cutting Report.
- There is no Installer multi-order print/accept flow with per-order page breaks.
- Installation photo upload is absent.
- Final closure is not reliably role-gated to Office/Admin in the UI or current Sales order-update RLS.
- Existing state updates and history inserts are separate client operations and can become inconsistent on partial failure.
- Current history lacks generalized entity type/ID, action, actor-role snapshot, structured metadata, and database-enforced immutability for the complete V1 event contract.
- Application writes often do not check every returned error, so logged and displayed state can diverge.

These gaps are implementation inputs for later approved Sprints, not Sprint 0 implementation work.

## 19. Future features explicitly deferred from V1

Documented but not implemented in V1 Sprint 0:

- grouping Cutter work across multiple orders by shared fabric identity;
- advanced fabric entity intelligence;
- roll-specific cutting calculations;
- roll-width optimization;
- automatic waste optimization;
- refined intermediate waiting-for-sewing queues;
- advanced supplier automation; and
- advanced feature-flag activation.

V1 entities and event links must permit these additions without encoding them now.

## 20. Known open decisions

1. Define the pickup handover and completion path, including whether pickup needs customer acknowledgement, an employee signature, both installation-style signatures, or a different closure rule.
2. Decide whether Office may create orders in normal operation or only Admin/Sales.
3. Decide whether Sales may cancel its own order before payment approval; Office/Admin cancellation remains the safe default.
4. Define payment approval reversal/correction behavior after work has started.
5. Decide whether supplier `ORDERED → READY` needs an intermediate received/arrived state in V1; the approved workflow only requires Ordered then Ready.
6. Define exact photo retention, formats, size limits, and access policy.
7. Choose canonical database codes and backward-compatible mapping from current order/item enums during the implementation migration.
8. Reconcile the missing committed schema history for `production_route`, supplier/date fields, and extended item statuses before any new migration is designed.
9. Decide whether cutter and installer become database roles or scoped permissions layered on another role; the V1 permission outcomes above are mandatory either way.

## Part 2 print contract update

Printing prepares a persisted draft, not an active cut instruction. Only explicit post-print confirmation changes selected items to CUT_CONFIRMATION_PENDING (represented by cut_instruction_id and the pending instruction). Pending items cannot be reprinted, advanced, edited, deleted or added to another active instruction. Drafts can be reopened; activation rejects stale snapshots and duplicate/conflicting selections. Actual meters and progression remain Part 3.
