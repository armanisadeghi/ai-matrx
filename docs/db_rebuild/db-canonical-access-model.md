# Canonical Access Model — The Rulebook (agents must not diverge)

> Access is **generated from two registries**, never hand-written per table. If you find yourself writing a one-off exception for a specific table, you are doing it wrong — change the registry instead.

## 0. Canonical truth (no exceptions)
These tables are the ONLY source of truth; no feature may keep its own:
- **Sharing / grants** → `public.permissions` (user/org grants + `is_public`, levels viewer<editor<admin).
- **Invitations** → `iam.invitations`.
- **Membership** → `iam.memberships` (project/war_room/…) + `organization_members` (org).
- **Default behavior** → `platform.entity_types` (declarative).
- **Cascade relationships** → `platform.entity_relationships` (declarative).
The access resolver reads ONLY these. Nothing else governs access.

## 1. Two axes + secrets
- **Visibility** answers "who can *discover/open* this." Ordered ladder: `private < internal < link < public`. (`internal` = your org + contextual containment.) A separate `is_listed` flag = "appears in a catalog/search" — discoverability is NOT an access tier.
- **Access role** answers "what can an authorized user *do*": `viewer < commenter < editor < owner`. (Matches Google Drive / Notion exactly.)
- **Secret** (API keys, tokens) is NOT a visibility tier — encrypt at rest (Supabase Vault), owner-only, never returned in normal selects.

## 2. The three relationship kinds (only two affect access)
- **containment** — cascade-as-FLOOR. Parent membership grants the child a baseline; the child may be **more** restrictive via its own visibility. `task→project`, `thread→war_room`, `project→org`. Triggered only when the child is `>= internal`.
- **composition** — FULL inherit. The child is a structural part of the parent; it has **no visibility of its own**; access = parent's access, always. `message→conversation`, `tool_call→conversation`, `artifact→conversation`. This is why sharing a conversation never breaks the view — the parts travel with it, and they can never be independently shared.
- **association** (`platform.associations`) — the lateral web. **No access implication.** Deliberately absent from the access registry.

## 3. Where everything is declared (answers to the three questions)
**Q1 — default visibility/behavior:** `platform.entity_types`
- `default_visibility` (null = infra, not governed) · `is_component` (true ⇒ defers to composition parent) · `is_listed` (catalog flag).
- The default is copied into the row's own `visibility` column **at insert** (a column default/trigger). RLS reads the **row's** value at runtime — never the registry. The registry feeds (a) the insert default, (b) policy generation, (c) the drift cron.

**Q2 — cascade relationships:** `platform.entity_relationships` `(child_type, parent_type, fk_column, kind)`. The ONLY place a parent FK is named for access. `apply_rls` reads this at **generation time** and bakes the concrete walk into each table's policy — so runtime stays fast and nothing is hardcoded.

**Q3 — deep/internal composition:** same registry, `kind='composition'`. Declared once; the generated child policy is simply "defer to parent access."

## 4. The canonical resolution order (what generated policies and `iam.has_access` both do)
For (user U, row R of type T), R is accessible iff, short-circuiting in order:
1. **Component?** (`entity_types.is_component`) → return `has_access(parent_type, R.<fk>)`. Nothing else applies.
2. `R.visibility = 'public'` → yes.
3. `R.created_by = U` (owner) → yes.
4. `R.visibility >= 'internal'` AND (`has_org_access(R.org_id)` OR any **containment** parent grants access) → yes.
5. Explicit grant: `has_permission(T, R.id, required)` (covers user grant, org grant, `is_public`/`link`) → yes.
6. else **no**.
Role = `max()` across every pathway that says yes (broadest-access-wins, per Notion/Drive).

## 5. Generation, not hand-writing
`apply_rls(schema, table, token)` (v2, to build) reads `entity_types` (default_visibility, is_component) + `entity_relationships` (parent hops) and **emits** the table's policy:
- component entity ⇒ policy = `iam.has_access(parent_type, <fk_col>, required)` only.
- standard entity ⇒ owner / `public` / `visibility>='internal' AND (org OR each declared containment parent) / grant.
Containment helpers are `SECURITY DEFINER` (bypass the parent's RLS to stop recursion) and use `(select auth.uid())` (per-query eval).

## 6. One resolver, used everywhere (to build): `iam.has_access(p_type, p_id, p_required)`
A single SECURITY DEFINER function that implements §4 by reading the registries. **RLS policies and Python both call this same function** — Python passes the acting user. No logic is ever reimplemented in Python (it would drift). Service-role Python either impersonates the user (RLS applies) or calls `iam.has_access` explicitly.

## 7. Current seeded truth
- **private:** conversation, thread, war_room
- **internal:** project, task, note, file, category, comment, context_item, scope, scope_type, membership, invitation, prompt, studio_session, transcript
- **internal + listed:** agent
- **components (no own visibility):** message, tool_call, artifact
- **containment edges:** task→project, conversation→project, thread→war_room, project→organization
- **composition edges:** message→conversation, tool_call→conversation, artifact→conversation

## 8. Known edge cases (decide before they bite)
- **Polymorphic-parent composition** (e.g. `comment` on any entity): the registry edge needs a fixed parent type, but a comment's parent type varies. For now comment = `internal` standard; if comments must inherit their target's exact access, handle via a resolver special-case keyed on `entity_type`, not a static edge.
- **Org is the universal root** — resolved by `has_org_access(org_id)` on every row; the `project→organization` edge is documentation, not an extra generated hop.
- **Denormalized `conversation_id`** on tool_call/artifact lets composition defer in one hop; the logical parent is still the message.

## 9. Next build (real updates, after this registry foundation)
1. Add `visibility platform.visibility` column to every governed entity table (base retrofit); default it from `entity_types.default_visibility` via trigger at insert.
2. Build `iam.has_access` (§6) + the containment helpers.
3. `apply_rls` v2 — generate policies from the registries (§5); re-apply per table.
4. Python access module — thin wrapper calling `iam.has_access`; no reimplemented logic.
5. Drift cron (weekly) — assert each table's live policy matches its declared `default_visibility`/relationships; flag divergence.
