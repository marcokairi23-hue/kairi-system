# Screen Management and Feature-Flag Pattern

## Problem solved

Provide one administrable model for controlling whether application screens and nested UI components are visible globally and for specific roles, while keeping navigation, routes, and component rendering consistent.

## Architecture

1. **Configuration data** — `feature_flags` stores screen/component metadata, global enablement, hierarchy, lock state, and ordering. `feature_permissions` stores per-feature, per-role allow/deny values.
2. **Database policy** — authenticated users can read configuration; admin-only RLS policies control configuration writes.
3. **Shared client state** — `FeatureFlagsProvider` loads both tables once and exposes their state and mutation functions.
4. **Pure evaluation** — `evaluateFeature` combines global state, role permission, and parent visibility.
5. **Consistent consumers** — `useFeature` gates navigation, routes, and individual dashboard components.
6. **Administration UI** — `ScreenManager` edits global and role settings, previews a role, and uses optimistic updates with rollback on failure.

## Relevant files

- `src/lib/featureFlags.tsx` — provider, evaluator, hook, and mutations
- `src/pages/admin/ScreenManager.tsx` — administration and role preview
- `src/App.tsx` — route gating through `FeatureRoute`
- `src/components/Layout.tsx` — navigation filtering
- `src/pages/Dashboard.tsx` — component-level visibility
- `src/lib/auth.tsx` — current profile and role source
- `supabase/migrations/0012_feature_flags.sql` — tables, RLS, and initial seed
- `supabase/migrations/0013_users_settings_flags.sql` — additional screen seeds

## How screen visibility is controlled

For a requested feature key, the current evaluator:

1. Returns visible when the feature record is missing.
2. Returns hidden when `enabled_global` is false.
3. Finds the current role’s permission; a missing permission defaults to allowed.
4. Returns hidden when that permission is false.
5. Recursively requires the parent feature to be visible.
6. Returns visible when all checks pass.

Navigation uses a fixed route list filtered by evaluated visibility. Protected routes redirect when evaluation fails. Individual components call the same hook before rendering. `is_locked` prevents global toggling in the administration UI; it does not itself grant role access.

## Relationship to roles and permissions

The UI evaluator uses the authenticated profile’s role and the `feature_permissions` matrix. Some navigation is also constructed by role before feature filtering.

This is a **UI visibility and product-configuration layer, not a security boundary**. Hiding navigation, redirecting a route, or omitting a component does not prevent direct database or API access. Supabase RLS and server-side authorization must independently enforce access to protected data and mutations.

## What is reusable

- A normalized screen/component registry
- Global plus per-role visibility rules
- Parent-child inheritance
- One pure evaluator shared by navigation, routes, components, and previews
- An administration UI with optimistic updates and rollback
- Separate persistence authorization for configuration writes

## What is Kairi-specific

- Feature keys, labels, roles, routes, and seeded defaults
- Hebrew administration copy
- The fixed Kairi navigation list and dashboard component keys
- Supabase table names and the `current_role()` helper

## Risks and limitations

- Missing flags and permissions currently fail open; that may be unsuitable for other products.
- Client-side visibility cannot replace RLS or server authorization.
- Every entry point must use the evaluator; a missed route or component can remain visible.
- Parent cycles are not prevented by the client evaluator and could recurse indefinitely.
- Role values in `feature_permissions` are text and require separate consistency controls.
- Fetch errors are not surfaced distinctly from empty configuration.
- Optimistic updates can briefly show state not yet persisted.
- Navigation remains statically declared; database metadata does not create routes automatically.
- Locked state is partly a UI convention and still depends on database write policies.

## Implementation checklist for another project

- [ ] Define stable feature keys and supported feature types.
- [ ] Define role identifiers and their source of truth.
- [ ] Choose fail-open or fail-closed behavior explicitly.
- [ ] Model global enablement, role permission, and optional parent relationships.
- [ ] Prevent or detect parent cycles.
- [ ] Add database authorization for reading and changing configuration.
- [ ] Build a pure evaluator with unit tests for missing data, disabled parents, and denied roles.
- [ ] Use the same evaluator in navigation, route guards, and component rendering.
- [ ] Add loading and error behavior that cannot be confused with permission grants.
- [ ] Build an administration surface with save feedback and rollback.
- [ ] Audit every protected data path separately with server authorization or RLS.
- [ ] Test direct URL access and direct API access for every role.
