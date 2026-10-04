# KAIRI SYSTEM — V1 SPRINTS SOT

## בדיקת מימוש — 2026-10-04

עותק עבודה של המסמך שסופק מתיקיית Downloads. מקור הבדיקה: הקוד המקומי ודוחות הבדיקות הקיימים; לא בוצעה בסקירה זו בדיקת Production חדשה.

`[x]` חדש = נמצא מימוש לסעיף, עם הראיות וההסתייגויות בפרק. `[ ]` = חסר, חלקי, סותר את הדרישה החדשה או לא אומת מספיק. סימון סעיף אינו אישור להשלמת ספרינט או לפריסה.

סה״כ 203 סעיפים מקוריים: 66 מסומנים כעת ו־137 נשארו פתוחים. בספרינט 3 מסומנים 12/18 לאחר חלק 2. הסימונים מציינים מימוש ובדיקות מקומיות; פריסה ואימות Production עדיין ממתינים ל־M1.


**Document type:** Source of Truth for V1 development sprints  
**Status:** Authoritative unless superseded by an explicit later decision recorded in `DECISIONS.md` and reflected in `WORKFLOW_V1.md`  
**Working branch policy:** MAIN-ONLY  
**Commit / Push policy:** Explicit human approval required  
**Migration policy:** Write during Sprint, apply only at an approved Safety Gate

---

# 1. V1 GOAL

Build one stable end-to-end operational system for the current KAIRI workflow with minimal friction and only the improvements required for reliability, control, and auditability.

```text
NEW ORDER
→ PAYMENT GATE
→ ITEM ROUTING
→ CUTTER / OFFICE
→ PRODUCTION
→ GOODS RECEIPT
→ READY
→ PICKUP / INSTALLATION
→ SIGNATURES / PHOTOS
→ FINAL CLOSURE
```

The system must keep these concerns separate:

```text
PAYMENT STATE
ORDER STATE
ITEM STATE
CURRENT OWNER
ALLOWED NEXT ACTION
ACTOR / ROLE
TIMESTAMP
AUDIT / LOG
```

An order may contain items owned by different operational teams at the same time.

---

# 2. AUTHORITATIVE V1 ROUTING RULE

This rule overrides every older prompt, plan, migration draft, or architecture note that contains a Roman-curtain exception.

## Regular sewn curtain

```text
REGULAR CURTAIN
→ CUTTER / INTERNAL
→ AWAITING_CUT
```

## All shading products

The following all go to **Office** first:

- Roller / גלילה
- Zebra / זברה
- Venetian / ונציאני
- Roman / רומאי — **all Roman curtains without exception**

```text
SHADING PRODUCT
→ OFFICE / SUPPLIER
→ AWAITING_SUPPLIER_ORDER
```

## Explicit rule

> **Only regular curtains route to the Cutter. All shading products, including every Roman curtain, route to Office.**

There is no V1 routing distinction between:

- Roman made from KAIRI fabric
- Roman made from supplier fabric
- Roman requiring internal fabric handling

No Roman-specific internal-routing flag is required for V1.

## Outside execution

```text
for_execution = false
→ OUTSIDE_EXECUTION
→ no operational routing
```

Quotes are never routed to execution.

---

# 3. SPRINT MAP

```text
SPRINT 0  — Workflow Contract + Development Baseline
SPRINT 1  — New Order + Payment Gate
SPRINT 2  — Initial Item Routing
SPRINT 3  — Cutter Workflow
SPRINT 4  — Office / Supplier Workflow
SPRINT 5  — Goods Receipt / Sewing Return
SPRINT 6  — Automatic Order READY
SPRINT 7  — Pickup + Track Cutting
SPRINT 8  — Installation Workflow
SPRINT 9  — Signatures, Photos + Final Closure
SPRINT 10 — Use Case Testing
SPRINT 11 — Edge Cases + Browser Validation
SPRINT 12 — Security / Permissions
```

---

# SPRINT 0 — WORKFLOW CONTRACT + DEVELOPMENT BASELINE

## Goal

Do not change business behavior before one authoritative workflow exists.

## Checklist

> 14 הסימונים בפרק זה נשמרו מהמסמך שסופק. הם מציינים את הבסיס ההיסטורי ואינם אישור שהמסמכים הישנים כבר הותאמו לכלל הרומאי החדש או שנבדקה כעת סביבת Production.

- [x] Define official order states.
- [x] Define official item states.
- [x] Define payment states.
- [x] Define Current Owner model.
- [x] Define role/action permissions.
- [x] Define required logs.
- [x] Define legal transition map.
- [x] Define illegal transitions and invariants.
- [x] Define audit/logging contract.
- [x] Update `CHATGPT_WORKSPACE/PROJECT_STATE.md`.
- [x] Update `CHATGPT_WORKSPACE/TASKS.md`.
- [x] Create `CHATGPT_WORKSPACE/WORKFLOW_V1.md`.
- [x] Run build.
- [x] Freeze a clear `main` baseline.

## Exit condition

Sprint 1 may not begin before the workflow contract is established and approved.

---

# SPRINT 1 — NEW ORDER + PAYMENT GATE

## Goal

Create a full order and determine whether it is released to execution, waiting for Office confirmation, or saved as a quote.

## Payment routes

```text
Cash
Check
Credit Card
Bank Transfer
Quote
```

`pay_later` is outside V1.

## Cash / Check

```text
ORDER
→ positive deposit recorded
→ PAYMENT = RECEIVED
→ only after successful payment persistence
→ order may be released to execution
```

## Credit Card / Bank Transfer

```text
ORDER
→ PAYMENT REQUEST = PENDING
→ ORDER = PENDING_PAYMENT
→ Office/Admin confirmation
→ PAYMENT = RECEIVED
→ order may be released to execution
```

## Quote

```text
QUOTE
→ no execution payment
→ all items OUTSIDE_EXECUTION
```

## Checklist

> עדכון ספרינט 1: שלושת הפערים מומשו ונבדקו מקומית ב־scripts/test-sprint1.mjs. create_order_v1 שומר לקוח, הזמנה, שתי משפחות פריטים, אביזרים, תשלום והיסטוריה בעסקה אחת; בקשה חוזרת מחזירה אותה הזמנה. payments.ts סופר received בלבד. 20 הסימונים הקודמים נשענים גם על Validation A/B. ספרינט 1: 23/23 מבחינת מימוש; הפעלה ואימות ב־Production הועברו ל־M1 לפי הוראת המשתמש. אין לפרוס את NewOrder החדש לפני התקנת ה־RPC.

- [x] New order persists correctly.
- [x] All order items persist correctly.
- [x] Five approved payment routes exist.
- [x] Cash requires a positive deposit.
- [x] Check requires a positive deposit.
- [x] Cash/Check create `RECEIVED` payment records.
- [x] Cash/Check cannot release the order before payment persistence succeeds.
- [x] Credit Card creates `PENDING`.
- [x] Bank Transfer creates `PENDING`.
- [x] Requested amount is preserved.
- [x] Pending does not reduce balance.
- [x] Rejected does not reduce balance.
- [x] Office/Admin can confirm pending payment.
- [x] Sales cannot confirm pending payment.
- [x] Confirmation is authoritative server-side.
- [x] Confirmation changes Payment to `RECEIVED`.
- [x] Confirmation records actor.
- [x] Confirmation records timestamp.
- [x] Confirmation releases the order.
- [x] Rejection records reason + actor + timestamp.
- [x] Payment changes appear in activity/logs.
- [x] Balance is calculated only from `RECEIVED` payments.
- [x] Payment Gate is enforced at DB/server level, not only UI.

---

# SPRINT 2 — INITIAL ITEM ROUTING ENGINE

## Goal

After Payment Gate approval, every executable item receives the correct route, owner, initial operational state, and next action.

## Routing

### Regular curtain

```text
REGULAR CURTAIN
→ CUTTER / INTERNAL
→ AWAITING_CUT
```

### Roller

```text
ROLLER
→ OFFICE / SUPPLIER
→ AWAITING_SUPPLIER_ORDER
```

### Zebra

```text
ZEBRA
→ OFFICE / SUPPLIER
→ AWAITING_SUPPLIER_ORDER
```

### Venetian

```text
VENETIAN
→ OFFICE / SUPPLIER
→ AWAITING_SUPPLIER_ORDER
```

### Roman — all Roman curtains

```text
ROMAN
→ OFFICE / SUPPLIER
→ AWAITING_SUPPLIER_ORDER
```

There is **no Roman routing exception** in V1.

## Mixed orders

One order may contain at the same time:

```text
Regular curtain → CUTTER
Roller → OFFICE
Roman → OFFICE
Zebra → OFFICE
```

Routing is item-level.

## Checklist

> חלק 1 הושלם במימוש ובבדיקות מקומיות: 16/16. טיוטת 0016 עודכנה ללא חריג רומאי; השדה והאפשרות הוסרו מהקוד ומהממשק. scripts/test-sprint1.mjs עם --routing עבר מול PostgreSQL מקומי, כולל שמירה אטומית, כל מסלולי התשלום, הזמנה מעורבת, תיעוד ובידוד פריטים. פריטים היסטוריים שכבר התקדמו במסלול סותר נשמרים לבירור ואינם מוצגים כניתוב חדש תקין. הפעלה, אימות סכמה ובדיקות Production נשארו ב־M1.

- [x] Regular curtain routes to Cutter.
- [x] Roller routes to Office.
- [x] Zebra routes to Office.
- [x] Venetian routes to Office.
- [x] Every Roman curtain routes to Office.
- [x] No Roman routing exception exists.
- [x] Every executable item gets Current Owner.
- [x] Every executable item gets an initial operational state.
- [x] Mixed orders support Cutter-owned and Office-owned items simultaneously.
- [x] `for_execution = false` items are not routed.
- [x] Quote items are not routed.
- [x] Pending-payment orders are not routed.
- [x] Cash/Check route only after successful received payment.
- [x] Credit/Transfer route only after Office/Admin confirmation.
- [x] Changing/routing one item does not accidentally change another.
- [x] Routing decisions are logged.

## Migration note

Any Sprint 2 migration created before this routing decision must be revalidated.

**A migration that implements a Roman-to-Cutter exception is stale and must not be applied.**

---

# SPRINT 3 — CUTTER WORKFLOW

## Goal

Allow the Cutter to work at order level while selecting and transitioning specific items.

Only **regular curtains routed to Cutter** participate in this workflow.

## Flow

```text
Order contains Cutter items
→ Cutter opens order
→ Print Work Instructions
→ select relevant regular-curtain items
→ Print draft (no item lock)
→ explicit user confirmation after printing
→ selected items = CUT_CONFIRMATION_PENDING
```

## Critical rule

When an item is:

```text
CUT_CONFIRMATION_PENDING
```

it cannot be:

- printed again,
- added to another active work instruction,
- advanced further,

until cut confirmation is completed.

## Cut confirmation requires

```text
Selected Item IDs
Actual Meters Cut
Actor
Role
Timestamp
Instruction Reference
```

Then:

```text
CUT_CONFIRMATION_PENDING
→ IN_PREPARATION
```

## Checklist

> חלק 2: 12/18 סעיפים מומשו ונבדקו מקומית. הוראות גזירה נשמרות כטיוטה להזמנה אחת ולפריטים שנבחרו בלבד. לפי בחירת המשתמש, רק אישור מפורש אחרי ההדפסה מפעיל את ההוראה. cut_instruction_id מייצג מצב CUT_CONFIRMATION_PENDING ומוצג בממשק; הסטטוס הישן נשמר עד אישור המטרים בחלק 3. הנעילה נאכפת במסד הנתונים, לרבות קידום, שינוי או מחיקה. תפקיד Cutter חדש מוכן ב־SQL בלבד ללא שינוי משתמשים. שש המשימות האחרונות נשארו לחלק 3; היישום והבדיקות ב־Production נשארו ל־M1.

- [x] Cutter sees only relevant Cutter work.
- [x] Only regular curtains can appear as Cutter-routed items in V1.
- [x] Order appears once even with multiple Cutter items.
- [x] Print Work Instructions opens a dialog.
- [x] Dialog shows only eligible Cutter items.
- [x] Subset selection is supported.
- [x] Print affects only selected items.
- [x] Selected items move to Pending Cut.
- [x] Order can be closed and reopened.
- [x] Reopening detects active Pending Cut.
- [x] Pending Cut blocks reprint.
- [x] Pending Cut blocks another advance.
- [ ] Cut confirmation requires actual meters.
- [ ] Actor is stored.
- [ ] Timestamp is stored.
- [ ] Actual meters are stored.
- [ ] Confirmed items move to `IN_PREPARATION`.
- [ ] Remaining Cutter items can be processed later.

---

# SPRINT 4 — OFFICE + SUPPLIER WORKFLOW

## Goal

Handle all shading products and external supplier items simply and consistently.

This includes **all Roman curtains**.

## Flow

```text
AWAITING_SUPPLIER_ORDER
→ Office
→ Ordered
→ supplier dialog
→ supplier required
→ explicit confirmation
→ ORDERED
→ supplier tracking
→ READY
```

## Checklist

> מימוש חלקי בלבד: קיימים קידומי סטטוס כלליים ב־ProductionBoard וב־ItemAdvanceDialog. לא אומת תהליך ספק מלא עם בחירת ספק חובה, אישור ושמירתו; לכן תהליך זה נשאר פתוח.

- [ ] Office sees all items awaiting supplier handling.
- [ ] All Roman items appear in Office flow, not Cutter flow.
- [ ] Item can be marked Ordered.
- [ ] Ordered opens confirmation dialog.
- [ ] Supplier is mandatory.
- [ ] Supplier uses dropdown/list.
- [ ] Explicit confirmation is required.
- [ ] Supplier is stored.
- [ ] Actor is stored.
- [ ] Timestamp is stored.
- [ ] Item moves to `ORDERED`.
- [ ] Ordered stays in supplier tracking.
- [ ] Office/Admin can mark item `READY`.
- [ ] Ready transition is logged.

---

# SPRINT 5 — GOODS RECEIPT / SEWING RETURN

## Goal

Do not allow sewn-curtain Ready changes without a reviewable receipt document.

## Flow

```text
AT_SEWING items return
→ Office selection
→ Goods Receipt Draft
→ Review
→ Confirm
→ selected items = READY
```

## Checklist

- [ ] Single selection exists.
- [ ] Multi-selection exists.
- [ ] Selected items enter Goods Receipt Draft.
- [ ] Draft does not finalize Ready state.
- [ ] Receipt shows selected items.
- [ ] Receipt shows order references.
- [ ] Receipt shows width summary.
- [ ] Receipt shows basic grouping by sewing/product type.
- [ ] Confirm action exists.
- [ ] Confirm records actor.
- [ ] Confirm records timestamp.
- [ ] Confirm changes only receipt items.
- [ ] Confirmed items become `READY`.
- [ ] Receipt can be printed/downloaded.
- [ ] Confirmed receipt is not normally editable.

---

# SPRINT 6 — AUTOMATIC ORDER READY

## Goal

Order Ready is derived automatically from executable item readiness.

## Rule

```text
at least one executable item
+
all executable non-cancelled items = READY
→ ORDER = READY
```

## Checklist

- [ ] Order cannot become Ready while an executable item is not Ready.
- [ ] `OUTSIDE_EXECUTION` does not block Ready.
- [ ] `CANCELLED` does not block Ready.
- [ ] Transition happens automatically.
- [ ] Transition occurs in the authoritative operation.
- [ ] Transition is logged.
- [ ] Timestamp is stored.
- [ ] Triggering actor/action is stored.
- [ ] Event renders as a prominent milestone.
- [ ] Relevant item IDs are associated with the event.

---

# SPRINT 7 — PICKUP + TRACK CUTTING

## Goal

Handle Pickup orders without causing unnecessary track cutting or stock waste.

## Flow

```text
READY ORDER
→ PICKUP
→ select orders
→ TRACK CUTTING REPORT
→ preparation
```

## Critical rule

Only a **regular curtain** can create a track-cutting requirement.

Never create track-cutting requirements for:

```text
Roller
Zebra
Venetian
Roman
```

Roman is excluded in every case.

## Checklist

- [ ] Pickup can be selected.
- [ ] Multiple orders can be selected.
- [ ] One combined report can be generated.
- [ ] Report groups by order.
- [ ] Only regular curtains create track rows.
- [ ] Roller excluded.
- [ ] Zebra excluded.
- [ ] Venetian excluded.
- [ ] Roman excluded.
- [ ] Track width comes from the correct item.
- [ ] Report is printable.
- [ ] Report can span arbitrary pages/length.
- [ ] Order IDs are logged.
- [ ] Item IDs are logged.
- [ ] Report generation is logged.

---

# SPRINT 8 — INSTALLATION WORKFLOW

## Goal

Turn Installer screen into a real multi-order work queue.

## Flow

```text
READY ORDERS
→ INSTALLER
→ multi-select
→ print selected orders
→ each order starts on a new page
→ WAITING_FOR_INSTALLATION
```

## Checklist

- [ ] Installer sees only relevant orders.
- [ ] Multi-select exists.
- [ ] Multiple order cards can be selected.
- [ ] One print action handles the selection.
- [ ] Every order starts on a new page.
- [ ] Successful print/accept changes status.
- [ ] Order becomes `WAITING_FOR_INSTALLATION`.
- [ ] Installer/user is stored.
- [ ] Timestamp is stored.
- [ ] Transition is logged.
- [ ] Partial failure does not leave ambiguous accepted work.

---

# SPRINT 9 — SIGNATURES, PHOTOS + FINAL CLOSURE

## Goal

Close the workflow end to end.

When:

```text
ORDER = WAITING_FOR_INSTALLATION
```

Enable:

```text
Customer Signature
Installer Signature
Photos
```

## Closure requirements

```text
Customer Signature
+
Installer Signature
→ required for final closure
```

Photos are available but not mandatory for V1 closure.

## Permissions

```text
Installer → cannot final-close
Cutter → cannot final-close
Sales → cannot final-close
Office → can final-close
Admin → can final-close
```

## Checklist

> מימוש חלקי בלבד: OrderDetail.tsx מציג חתימות לקוח ומתקין בסטטוס picked_by_installer. טרם אומתה התאמתו לשלב WAITING_FOR_INSTALLATION הנדרש, ואין השלמה של תנאי הסגירה והרשאותיה בצד השרת. לכן הסעיפים נשארו פתוחים.

- [ ] Customer signature becomes enabled.
- [ ] Installer signature becomes enabled.
- [ ] Photos become enabled.
- [ ] Customer signature required for closure.
- [ ] Installer signature required for closure.
- [ ] Multiple photos supported.
- [ ] Installer cannot close order.
- [ ] Cutter cannot close order.
- [ ] Sales cannot close order.
- [ ] Only Office/Admin can perform final closure.
- [ ] Closure validates prerequisites server-side.
- [ ] Actor is stored.
- [ ] Timestamp is stored.
- [ ] Closure is logged.
- [ ] Order becomes `COMPLETED`.

---

# SPRINT 10 — USE CASE TESTING

## Goal

No new features. Validate the full system.

## Checklist

- [ ] Full Cash order.
- [ ] Full Check order.
- [ ] Credit Card order.
- [ ] Bank Transfer order.
- [ ] Quote.
- [ ] Regular-curtain-only order.
- [ ] Roller-only order.
- [ ] Mixed regular-curtain + shading order.
- [ ] Roman using KAIRI fabric — verify it still routes to Office.
- [ ] Roman from supplier — verify it routes to Office.
- [ ] Partial Cutter selection: 2 of 3 regular curtains.
- [ ] Multiple suppliers.
- [ ] Goods Receipt.
- [ ] Automatic Order Ready.
- [ ] Pickup.
- [ ] Track Cutting Report.
- [ ] Installation.
- [ ] Signatures.
- [ ] Photos.
- [ ] Final Closure.

---

# SPRINT 11 — EDGE CASES + BROWSER VALIDATION

## Checklist

- [ ] Refresh during an operation.
- [ ] Double click / duplicate action.
- [ ] Dialog closed without confirmation.
- [ ] Illegal state transition.
- [ ] Ordered item marked Ordered again.
- [ ] Pending Cut reopened.
- [ ] Mixed order with multiple owners.
- [ ] Unauthorized user attempts action.
- [ ] Print failure.
- [ ] Upload failure.
- [ ] Two users operate on the same order.
- [ ] Retry behavior.
- [ ] Desktop validation.
- [ ] Mobile validation.
- [ ] RTL validation.
- [ ] Browser validation.

---

# SPRINT 12 — SECURITY / PERMISSIONS

## Checklist

> בדיקת מימוש: הגנת התשלומים ב־migration 0015 ובדיקת דחיית Sales בקוד 42501 מתועדות ב־TEMP_ANS.md. הסימון אינו מעיד שכל הרשאות המערכת נבדקו.

- [ ] Sales sees only allowed scope.
- [ ] Cutter sees only regular-curtain Cutter work.
- [ ] Installer sees only installation work.
- [ ] Office has required operational permissions.
- [ ] Admin has required operational control.
- [ ] Final closure denied to non-Office/Admin.
- [x] Payment changes protected.
- [ ] Old logs cannot be edited normally.
- [ ] Audit trail append-only.
- [ ] RLS tested against every role.
- [ ] Signature storage protected.
- [ ] Photo storage protected.
- [ ] No secrets in frontend.
- [ ] Workflow cannot be bypassed through ordinary API calls.
- [ ] Server-side transitions re-check prerequisites.
- [ ] UI permission is never treated as the security boundary.

---

# SPRINT M1 — ספרינט מיגרציות מרוכז (טרם בוצע)

לפי הוראת המשתמש, כל המיגרציות הנדרשות יבוצעו בספרינט נפרד ומרוכז. אין להפעיל מיגרציה בספרינט המימוש הנוכחי. המספור 0–12 נשמר; M1 הוא מחזור המיגרציות הראשון ואינו מחליף את ספרינט 1 העסקי.

1. לאסוף טיוטות מכל ספרינט ולהכין סדר תלויות ורשימת גרסאות מדויקת.
2. לאמת בקריאה בלבד סכמה, פונקציות, הרשאות וטריגרים ב־Production, ולהכין דרך התאוששות.
3. לסקור את supabase/pending_migrations/sprint1_atomic_order_creation.sql. הטיוטה נבדקה ב־PostgreSQL מקומי בזיכרון ולא הופעלה ב־Production.
4. טיוטת 0016 תוקנה ונבדקה מקומית כך שכל הרומאים החדשים ינותבו למשרד. יש לסקור ולאשר את הגרסה המתוקנת ואת הסבת הפריטים ההיסטוריים לפני הפעלה; אין להשתמש בגרסה הישנה. 0015 דווחה כמופעלת ואין להריצה שוב אוטומטית.
5. לקבל אישור לחבילה המדויקת, להפעיל לפי התלויות ולוודא תוצאות. ספרינט מרוכז אינו אישור להריץ את כל קובצי התיקייה ללא בדיקה.
6. לפרוס ממשק רק לאחר זמינות ה־RPC והתלויות; לאמת חמש דרכי תשלום, שמירה מעורבת, הרשאות, כשל חלקי וניסיון חוזר ב־Production.

תוספות מחלק 2: sprint3_cutter_role.sql חייבת להסתיים ב־COMMIT לפני sprint3_cut_instructions.sql. שתיהן נמצאות ב־supabase/pending_migrations, והן תלויות ב־0016 המתוקנת. אין שיוך אוטומטי של משתמשים לתפקיד Cutter. יש להשלים גם את פעולת אישור המטרים בחלק 3 לפני הפעלה מבצעית, כדי שאפשר יהיה לשחרר את הנעילות.

שלבים אלה נפרדים מספירת 203 סעיפי המימוש המקוריים. אין כרגע אישור הפעלה או פריסה.

---

# 4. CODEX EXECUTION METHOD

## Branch policy

The old branch-per-Sprint strategy is cancelled.

```text
MAIN-ONLY
```

Normal work is performed on `main`.

A temporary branch may be used only by explicit human decision.

## Start of Sprint

Codex must:

```text
FETCH
→ VERIFY MAIN
→ VERIFY HEAD == origin/main
→ VERIFY NO MERGE / REBASE
→ READ WORKFLOW_V1
→ READ PROJECT_STATE
→ READ TASKS
→ READ RELEVANT DOMAIN CHAT FILE
→ REVALIDATE CURRENT CODE
→ EXECUTE SPRINT
```

## Required workspace files

```text
CHATGPT_WORKSPACE/
├── WORKFLOW_V1.md
├── PROJECT_STATE.md
├── TASKS.md
├── DECISIONS.md
├── TEMP_ANS.md
└── CHATS/
```

---

# 5. SAFETY GATES

A Safety Gate is an intentional stop inside a Sprint.

Codex must stop before:

- Production migration
- Destructive SQL
- Significant data backfill
- Significant RLS/permission change
- Production data deletion
- Secret/credential changes
- Hard-to-reverse production changes

## Migration sequence

```text
CODE
→ MIGRATION FILE
→ STATIC REVIEW
→ BUILD / TEST
→ SAFETY GATE
→ SUPERVISOR REVIEW
→ HUMAN APPROVAL
→ APPLY
→ E2E VALIDATION
```

Writing a migration does not authorize applying it.

---

# 6. COMMIT / PUSH POLICY

Codex must not Commit or Push on its own.

```text
WORK
→ BUILD
→ TEST
→ CHECKLIST
→ DIFF REVIEW
→ TEMP_ANS
→ STOP
```

Then:

```text
HUMAN APPROVAL
→ COMMIT
→ PUSH
```

---

# 7. SPRINT COMPLETION RULE

```text
CODE
→ BUILD
→ TEST
→ USE CASES
→ CHECKLIST
→ DIFF REVIEW
→ SAFETY GATE if required
→ ALL REQUIRED CHECKBOXES = COMPLETE
→ TEMP_ANS
→ SUPERVISOR REVIEW
→ HUMAN APPROVAL
→ COMMIT
→ PUSH
→ VERIFY HEAD == origin/main
→ FINAL SUPERVISOR REVIEW
→ SPRINT COMPLETE
```

Codex may not declare a Sprint complete while a required checkbox remains open.

---

# 8. MCP RULE

When an appropriate MCP connection exists, prefer it for backend verification and operations.

```text
Supabase MCP
→ Schema
→ SQL
→ RPC
→ RLS
→ Data Verification
```

Use application/browser validation for:

```text
UI
User Flow
RTL
Interaction
Visual behavior
```

Do not use browser automation to guess database state when direct authorized backend access exists.

---

# 9. AUDIT RULE

Every meaningful operational action must eventually answer:

```text
WHO
WHAT
FROM
TO
WHEN
WHY / METADATA
```

Operational history should not be normally editable or deletable.

State change and audit event should share the same authoritative success boundary wherever practical.

---

# 10. FUTURE VISION — OUTSIDE V1

Do not implement yet:

```text
same fabric
+
many items
+
many orders
→ one shared Work Order
```

Future capabilities may include:

```text
fabric_id
roll width
roll inventory
cross-order grouping
cutting optimization
waste optimization
```

For V1, Cutter work remains:

```text
Order
→ select regular-curtain items
→ Work Instructions
→ confirm actual meters
```

Roman curtains remain Office-routed in V1 unless a future explicit SOT decision changes this rule.

---

# 11. SOURCE-OF-TRUTH PRECEDENCE

When an older prompt, chat, migration draft, or document conflicts with this file:

```text
THIS SOT
↓
EXPLICIT RECORDED DECISIONS
↓
CURRENT REPOSITORY / PRODUCTION REALITY
↓
PROJECT_STATE
↓
TASKS
↓
TEMP_ANS
↓
OLD CHATS / OLD PROMPTS
```

A later decision changes this SOT only when explicitly approved and recorded.

---

# 12. CURRENT EXECUTION NOTE

At the time this SOT was generated:

- Sprint 0 was completed.
- Sprint 1 was reported complete by Codex validation.
- Sprint 2 had reached a Migration Safety Gate.
- A local Sprint 2 migration was reported as `supabase/migrations/0016_initial_item_routing_v1.sql`.

Because the Roman routing rule has now changed, **Migration 0016 must be reviewed/updated before it is applied**.

Any logic in 0016 that routes a Roman item to Cutter or introduces a Roman internal-routing exception must be removed before approval.

