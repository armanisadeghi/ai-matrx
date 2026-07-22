# lib/list-scope — THE VIEW LAW primitive

## The law

RLS is the ceiling, never the view definition. A list query that relies on
"RLS will filter it to what makes sense" is a defect the moment a user
belongs to more than one org (every user does — personal org + N
companies). Every list query MUST declare its own scope explicitly.

## The canonical scope model

- **Mine** — rows created by the caller, across all orgs (`{ kind: "mine" }`).
- **Shared with me** — rows explicitly granted to the caller, not owned,
  not by org (`{ kind: "shared" }`). No generic filter yet — each feature
  supplies its own shared-with-me RPC/fetcher (a platform-wide shared RPC
  is tracked as Brief 3A).
- **Org** — rows belonging to ONE specific org the caller is a member of
  (`{ kind: "org"; organizationId }`). One chip per org, never a blended
  "all my orgs" bucket.

## The primitive

- `types.ts` — `ListScope` union + narrowing helpers (`isMineScope`,
  `isOrgScope`, `isSharedScope`).
- `applyListScope.ts` — `applyListScope(query, scope, { userId, ownerColumn?, orgColumn? })`.
  Applies `.eq(ownerColumn ?? "created_by", userId)` for "mine",
  `.eq(orgColumn ?? "organization_id", scope.organizationId)` for "org",
  and throws a descriptive error for "shared" (use the feature's own
  shared-with-me fetcher instead).
- `components/official/ListScopeSwitcher.tsx` — controlled segmented
  control (Mine / Shared* / org chips). Reads orgs from
  `features/agent-context/redux/organizationsSlice` and excludes the
  personal org from chips (personal-org content already lives under Mine).

## Consumer rules

1. Every bare `.select("*")`-style list fetch that used to lean on RLS
   alone must declare a scope — either via `applyListScope` or, where the
   helper's typing fights the callsite (custom builders, cross-schema
   clients, `unknown`-cast tables), a direct `.eq(owner, userId)` with a
   `// VIEW LAW: mine-scoped` comment.
2. Resolve `userId` the way the surrounding service already does
   (`requireUserId()`, a passed-in param, session/store read). Never derive
   scope from the *active org* — access must never depend on which org is
   currently selected (see `docs/official/db-rules.md` §6).
3. A deliberate org-browse surface (reads across an org set by design, not
   a bug) still declares its intent — either an explicit org-scope filter,
   or a loud comment naming it as such — never a silent bare select.
4. `owner_column` defaults to `created_by`; several tables use `user_id`
   instead — check the table before assuming.

## Change log

- 2026-07-22 — Primitive created (types, `applyListScope`,
  `ListScopeSwitcher`) as part of the VIEW LAW rollout across the 14 bare-RLS
  personal-space list surfaces; wired as the reference implementation into
  the transcripts list page.
