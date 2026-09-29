# Auth and RLS

## Scope

Authentication, user roles, route access, row-level security, and permission alignment.

## Current context

Client authentication is centered in `src/lib/auth.tsx`; routes are protected in `src/App.tsx`. Database policies are defined in migrations, and `docs/PERMISSIONS_MAP.md` records an audit of UI and RLS behavior.

## Open issues

- Documented UI-versus-RLS gaps require current-state verification before remediation.

## Decisions

- No new authorization decision is recorded in this workspace.

## Next action

Revalidate the relevant role, UI gate, and RLS policy together before any authorization change.
