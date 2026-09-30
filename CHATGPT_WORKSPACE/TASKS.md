# Tasks

## ACTIVE

- Human-review Order V1 Phase A on new/edit order pages, mobile, desktop, and RTL.
- Review the complete uncommitted diff before commit approval.

## NEXT

- Design and implement the approved Phase B payment/custody migration, RLS, and RPCs.
- Update every balance consumer to count only received payments after Phase B schema support exists.
- Add the future office action `התקבל במשרד` after custody persistence exists.
- Decide whether the Orders “advance” and “items” actions should remain separate.

## BLOCKED

- Pending-payment persistence and cash/check custody reporting: awaiting Phase B schema/RPC approval and implementation.
- Production Board redesign: awaiting new design direction.

## DONE

- Order V1 Phase A: full/partial execution selection, live selection summary, semi-automatic total, simplified routing confirmation, and Phase A payment-route preparation.
- Prompt 1 order-form UI: order number, item-button placement, width validation, split control, city, and simplified creation controls.
- Feature-flag infrastructure and administration are documented as completed and manually verified in `docs/HANDOFF.md`.
- Development branch created from `origin/main`.
