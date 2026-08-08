# lib/list-scope — THE VIEW LAW primitive

## The law

RLS is the ceiling, never the view definition. A list query that relies on
"RLS will filter it to what makes sense" is a defect the moment a user
belongs to more than one org (every user does — personal org + N
companies). Every list query MUST declare its own scope explicitly.

## The canonical scope model — a FIXED vocabulary of five

Ratified 2026-07-26. A list surface declares WHICH of these five it supports
and supplies the predicate. **It may not invent a sixth.** The flexibility is
in which subset applies, not in the vocabulary — a scope the user learns on one
page must mean the same thing on every other page.

| Scope              | The question it answers          | Reach                                                                                                 |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Mine**           | What did I make?                 | `created_by = auth.uid()` (some tables use `user_id` — check)                                         |
| **My Orgs**        | What does my team have?          | created by someone else, in a **non-personal** org I belong to, at a visibility that admits org-mates |
| **Shared with me** | What did someone hand me?        | an explicit `iam.permissions` grant (to me, or to one of my orgs)                                     |
| **Industry**       | What does my field publish?      | see below                                                                                             |
| **Public**         | What has the platform published? | `visibility = 'public'`, not mine                                                                     |

`My Orgs` and `Shared with me` may overlap on the same row. That is correct —
they answer different questions, and hiding an org row because it also carries
a grant would make "what does my team have?" lie.

### Industry — subscription, not ambient reach

Industry is the one scope with a two-sided contract, and it is **opt-in on both
ends**:

- **Publishing in** is restricted: the platform, or an approved curator
  (`iam.industry_curators` / `is_industry_curator(user, industry)`).
- **Reading out** requires an org to have _attached_ the industry —
  `iam.org_industries`, written by `industry_assign_org`. Once attached, the
  corpus is instantly available to every member of that org.

So the predicate is: _the record is granted to industry I, AND one of my orgs
has attached I._ It is `My Orgs` with one more hop, not a new kind of thing.

**Records attach to an industry by GRANT ROW**, following the precedent already
in the DB (`rag.data_store_grants.industry_id`): a record can be granted to N
industries, the grant is a deliberate revocable act, and reach is computed the
same way for every feature. Never an `industry_id` column on the record (one
industry only, re-classification with no audit trail) and never a
`platform.associations` edge (associations are explicitly NOT an access grant —
see `common-docs/systems/access-architecture/FEATURE.md` §2.4).

`iam.industries` is a hierarchy with a `facet` (`domain` / `jurisdiction` /
`practice_area`): `legal` → `workers-comp` → `ca-workers-comp`. Reach should
respect `parent_id`, so attaching `workers-comp` sees `ca-workers-comp` content.

### UI shape

`Mine · My Orgs · Shared · Industry · Public` as fixed tabs, each showing a TRUE
server count. **My Orgs and Industry each render as ONE tab with a dropdown to
narrow**, never one chip per org/industry — a user belongs to a personal org + N
companies and may attach several industries, so a chip-per-entity tab bar has
unbounded width and offers no blended view.

**Narrowing options come from the COUNTS QUERY, never from a Redux slice.**
`agx_list_scope_counts` returns `(scope, narrow_id, label, total)` — names and
counts together. This is load-bearing, not tidiness: the tabs originally read
org names from the organizations slice, which is hydrated by
`fetchFullContext` — a thunk that only runs on tasks / org-settings surfaces.
On `/agents/all` that slice was empty, so the My Orgs dropdown silently never
rendered for anyone. A tab bar must be self-sufficient from its own query.

> `components/official/ListScopeSwitcher.tsx` still implements the older
> chip-per-org shape and knows nothing about Industry or Public. It loads its
> organizations through `useUserOrganizations`, so it is self-sufficient on
> routes that have not hydrated an organization Redux slice. The worked
> implementation of the full five-scope model is
> `lib/entity-list/components/EntityScopeTabs.tsx` (live at `/agents/all` and
> `/transcripts`; also consumed by CRM). ListScopeSwitcher's one remaining
> consumer is `TranscriptsSidebar` — it should absorb EntityScopeTabs rather
> than the two diverging further.

## The primitive

- `types.ts` — `ListScope` union + narrowing helpers (`isMineScope`,
  `isOrgScope`, `isSharedScope`).
- `applyListScope.ts` — `applyListScope(query, scope, { userId, ownerColumn?, orgColumn? })`.
  Covers only the simple table-query cases. A surface with real scale (server
  paging, per-column filtering, true counts) uses a dedicated
  `*_list_scoped` RPC instead — see the template note below.
  Applies `.eq(ownerColumn ?? "created_by", userId)` for "mine",
  `.eq(orgColumn ?? "organization_id", scope.organizationId)` for "org",
  and throws a descriptive error for "shared" (use the feature's own
  shared-with-me fetcher instead).
- `components/official/ListScopeSwitcher.tsx` — controlled segmented
  control (Mine / Shared* / org chips). Loads orgs through
  `useUserOrganizations` and excludes the personal org from chips
  (personal-org content already lives under Mine).

## Consumer rules

1. Every bare `.select("*")`-style list fetch that used to lean on RLS
   alone must declare a scope — either via `applyListScope` or, where the
   helper's typing fights the callsite (custom builders, cross-schema
   clients, `unknown`-cast tables), a direct `.eq(owner, userId)` with a
   `// VIEW LAW: mine-scoped` comment.
2. Resolve `userId` the way the surrounding service already does
   (`requireUserId()`, a passed-in param, session/store read). Never derive
   scope from the _active org_ — access must never depend on which org is
   currently selected (see `docs/official/db-rules.md` §6).
3. A deliberate org-browse surface (reads across an org set by design, not
   a bug) still declares its intent — either an explicit org-scope filter,
   or a loud comment naming it as such — never a silent bare select.
4. `owner_column` defaults to `created_by`; several tables use `user_id`
   instead — check the table before assuming.

## Scoped-list RPCs — hand-written from a template, not generated

A list surface that pages server-side gets its own `<feature>_list_scoped` RPC.
These are **hand-written per feature from a documented template**, deliberately
not generated: a generator would have to model every feature's access semantics
and would become its own language to debug, whereas ~150 lines of explicit SQL
is readable and fixable at 2am. `public.agx_list_scoped`
(`migrations/agx_list_scoped_v3_all_columns.sql`) is the worked reference.

Invariants the template carries, all of them learned the hard way:

1. **Every `ORDER BY` ends in `id`.** A non-total order silently drops rows
   across pages — that bug cost the agents table 59 of 365 rows once.
2. **`deleted_at IS NULL`**, always.
3. **`count(*) OVER ()` as `total_count`** — the caller needs a true total, not
   `rows.length`.
4. **One `p_filters jsonb` bag** keyed by column id, so column headers and a
   filter panel write the same structure and cannot drift.
5. **Filter and sort server-side or not at all.** A control that filters only
   the loaded page is worse than no control.
6. `SECURITY DEFINER` ⇒ the function enforces membership itself; never trust a
   passed-in org/industry id without joining the membership table.

## Change log

- 2026-08-08 — `ListScopeSwitcher` now self-loads organizations through the
  canonical organization hook instead of depending on an unrelated Redux
  hydration path; its compact chips retain 44px touch targets below desktop.
- 2026-07-27 — `ListScope` migrated to the five-scope union (`org` → `orgs`
  with a nullable id; adds `industry`, `public`), plus `scopeKey` / `makeScope`
  / `scopeOrgId` / `scopeIndustryId` helpers. `applyListScope` now throws with
  a specific reason for every scope a single `.eq()` cannot express. Scope
  counts carry labels.
- 2026-07-26 — Scope vocabulary ratified as a fixed FIVE (adds Industry and
  Public). Industry documented as opt-in subscription (`iam.org_industries`)
  over curator-published content attached by grant row. Scoped-list RPC
  template rules recorded. Worked implementation: `/agents/all`.
- 2026-07-22 — Primitive created (types, `applyListScope`,
  `ListScopeSwitcher`) as part of the VIEW LAW rollout across the 14 bare-RLS
  personal-space list surfaces; wired as the reference implementation into
  the transcripts list page.
