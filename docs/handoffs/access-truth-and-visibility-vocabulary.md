---
status: blocked
updated: 2026-07-27
repos: [matrx-frontend]
vision: []
---

# Access truth & the one visibility vocabulary

`blocked` = the remaining code work is small and unblocked, but the two biggest
items (D105, D106b) need Arman's product decisions first. Start at
[Remaining work](#remaining-work) — items 1 and 2 need no decision.

---

## 1. Vision — Arman's words

**Original ask** (two symptoms on the scope detail page + `/files`):

> "On this page, it tells me that there are two files attached to this scope but when I click, it doesn't show a window panel to show me what they are."

> "Also, the file view attachments shows that even though I added those files, my view still shows those files as being 'Only You' access, but I don't think that is accurate so the system needs to be smarter in the way it calculates that and **not assume that public and direct shares are the only way to make something visible**."

**Refinement — the cost constraint** (stated in the same breath, and it shapes the whole design):

> "Now, we don't want to do that calculation on all files either so the best approach might be that we might need to have that in the info panel and other places where **it's one at a time and we do it right**."

**Refinement — he named the fork himself**, and it turned out to matter:

> "Alternatively, it could be that there is a bug and the org/scope members don't have access to the file so in that case, we have to fix that bug."

*(Resolved: there was no access bug. The DB was right; the UI label was lying. See Done.)*

**Refinement — the ruling that widened the job** (after being shown that the
client folded `internal` into `personal`):

> "Well, the bug you're mentioning is gigantic. So why don't you just fix it? It seems crazy that you tell me about it. **Of course, it shouldn't collapse anything. These are very, very different things.**"

> "You know what needs to be done. You know what the right way to do it is. So just get it done. **Let's make this thing amazing.**"

### The vision, assembled

1. **A UI must never claim privacy it cannot prove.** `visibility` is ONE of six
   ways `iam.has_access_for_base` grants access (owner · visibility+org · direct
   grant · membership · education assignment · **reachability through a
   container**). Any surface that reads one column and renders "Only you" is
   lying. Say what you know, or compute the real answer.
2. **Never collapse distinct concepts to shrink a type.** `internal` ("the whole
   org can read this") and `personal` ("belongs to one person") are different
   facts. So are `link` and `personal`. One vocabulary, no per-domain dialect.
3. **Truth is expensive, so buy it one entity at a time.** The honest computation
   walks reachability and resolves container titles — fine in a detail/info
   panel, never per row of a list. Lists get cheap signals and honest hedging.
4. *(inferred)* **Build the primitive, not the fix.** The access explainer is
   generic across entity tokens, not file-specific — consistent with the repo's
   standing "build the platform, not the artifact" rule.

### Why the key decisions went the way they did

- **Why an RPC, not client-side assembly.** Reachability lives in
  `platform.reachability`; assembling the answer client-side would mean N queries
  and duplicating `has_access` logic that already exists in SQL. One
  `SECURITY DEFINER` RPC keeps one authority.
- **Why lists don't call it.** Arman's explicit cost constraint. The list instead
  reuses the scope data it *already* fetches for the Context column — zero added
  queries — and degrades to "Personal" (a statement about a setting) rather than
  "Only you" (a claim about people).
- **Why the whole `shared`→`link` rename, not just un-collapsing `internal`.**
  Investigating turned up a second, worse bug: `shared` is not a synonym for
  `link`, it is a **retired** enum spelling the server maps to `personal`
  (`matrx_utils.visibility.LEGACY_VISIBILITY_MAP`). The UI read `link` as
  `"shared"` and wrote `"shared"` back — silently **downgrading** the file. That
  is data loss, so the dialect had to die entirely.
- **Why `internal` counts as "shared" in `isSharedResource`.** An org-readable
  row is emphatically not private; treating it as unshared is what produced the
  wrong labels in the first place.

---

## 2. Current state

### Done

- **`public.entity_access_summary(p_type,p_id)`** — every reason one entity is
  reachable (owner, visibility, org, direct grants, memberships, reachability
  containers w/ name+level+org+member count). Live; `viewer` required; grantee
  identities only for `admin` callers; container names filtered to containers the
  caller can already see.
- **`public.entity_titles(p_type,p_ids[])`** + **`platform.entity_title()`** —
  generic live title resolution, access-filtered. Live.
- **`platform.entity_types.title_column`** backfilled for `scope` and
  `data_store` (both had names but no declared title column, so nothing could
  name them).
- Migration `migrations/entity_access_summary.sql` — applied, verified live, and
  recorded in `public._schema_migrations`.
- **Client primitive** — `features/sharing/service/accessSummary.ts` →
  `hooks/useAccessSummary.ts` → `components/AccessSummaryPanel.tsx`. Generic over
  entity tokens.
- **Visibility vocabulary unified** — `features/files/types.ts#Visibility` and
  `features/files/blocks/types.ts#MediaVisibility` are both
  `personal | internal | link | public`, matching the DB and
  `matrx_utils.visibility`. `redux/converters.ts#toVisibility` validates instead
  of collapsing. 23 call sites updated; `Organization` added to file/folder
  menus, bulk actions, Share tab, Access filter.
- **Scope Resources card drill-in** —
  `features/scopes/components/associations/AttachedItemsSheet.tsx`, opened by the
  card body in `AssociationCard.tsx` (the body was previously a `div` with no
  handler, so "2 attached" was a dead end).
- **`PermissionsList`** no longer says "Only you can access this resource" from
  an empty grant list.
- Shipped **v0.4.138** and verified on `https://aimatrx.com` (not localhost):
  list shows `Organization: 34 / Personal: 9 / Public: 7`, `Only you: 0`; Info
  tab renders visibility + itemized reasons; Share tab shows all four levels.

### Partial

- **`AccessSummaryPanel` is mounted on exactly one surface** — the file Info tab
  (`FileInfoTab.tsx`). It is generic and takes `entityType`/`entityId`; every
  other entity's detail/info surface still shows nothing.
- **Access column container signal** covers scopes only. `AccessCell` reads the
  row-scope store, so a file reachable through a **project / data store /
  workbook** still reads "Personal" in the list. Not wrong (it hedges), but
  incomplete.
- **Direct-grant counts in lists are effectively always 0.** `loadPermissions`
  (`features/files/redux/thunks.ts`) is only dispatched per-single-resource, so
  `permissionsByResourceId` is empty for list rows and `AccessBadge`'s
  "N members" branch almost never fires. Pre-existing; unchanged by this work.

### Not started

- The five surfaces in **D106b** still make the same unprovable claim.
- No automated guard prevents the collapse from returning — nothing fails if
  someone re-adds a per-domain visibility dialect or a bare "Only you".

### Known issues / risks

- **D105 (needs Arman)** — `files.files.visibility` and `files.folders.visibility`
  both `DEFAULT 'internal'`. Live: **11,003 internal**, 10,463 personal, 1,238
  public, 1 link. Access never changed; only the label did. ~11k files that read
  "Only you" now read "Organization".
- **D106b (needs Arman for one of them)** — five surfaces still claim "Only you":
  `features/secrets/components/VaultItemDetail.tsx:1406` (credentials — highest
  stakes), `features/canvas/social/CanvasShareSheet.tsx:373`,
  `features/structured-lists/StructuredListManagerV2.tsx:139`,
  `features/content-ir/studio/components/ShapeOwnerEditor.tsx:40`, and
  `features/education/data/features.ts:236` — the last is **user-facing marketing
  copy** promising *"Only you, until you explicitly share... never a default"*,
  which is false wherever a table defaults to `internal`. Tied to D105.
- **D107 — the build-OOM fix is unattributed.** Production was stuck on v0.4.129
  for seven releases (compile-phase OOM). v0.4.138 went green, but TWO changes
  landed between the last red and that green: a parallel session's v0.4.137
  revert of the whole `React.lazy → next/dynamic` campaign, and this work's
  `turbopackMemoryLimit` 40→30 GiB in `next.config.js`. Either could be the sole
  cause. Measured peak RSS was 58.49 GiB on a 60 GB machine — the margin is thin
  either way.
- **The repo test runner is broken** — `pnpm test` dies with
  `Cannot find module './setup.ts'`; there is no `tests/` directory. So
  `features/files/handler/upload.test.ts` (edited here) has never been executed.
  Pre-existing, repo-wide.
- **`TEMP_SKIP_RELEASE_CHECKS=true`** is set in the shell environment, so
  `./scripts/release.sh` skips migrations, protocol-mirror, and quality gates.
  Run `pnpm type-check` and `pnpm check:migrations` by hand until that is off.
- `pnpm check:schema` reports one orphan (`platform.matrx_action_ledger`).
  Pre-existing in `HEAD`, unrelated.

---

## 3. Architecture / orientation

**The access chain, bottom to top:**

```
platform.associations            edges (file → scope), written via assoc_* RPCs
        │  trigger
        ▼
platform.reachability            flattened container→item cache (+max_level)
        │
        ▼
iam.has_access_for_base()        THE authority. 6 grant paths incl. reachability
        │                        RLS calls it; so does everything else
        ├──► files.has_access_for()   files.files RLS policies
        └──► public.entity_access_summary()   ← explains WHY, for the UI
```

- **DB truth:** `iam.has_access_for_base(user, type, id, level)`. Never
  reimplement it client-side.
- **The explainer:** `public.entity_access_summary` — same inputs, but returns
  the *reasons* rather than a boolean.
- **Client:** `features/sharing/service/accessSummary.ts` (typed parse, no `any`)
  → `useAccessSummary` (`enabled` flag so a collapsed tab costs nothing) →
  `<AccessSummaryPanel entityType entityId />`.
- **Lists:** `AccessCell.tsx` reads the shared row-scope store
  (`features/scopes/components/context-assignment/data.ts`), primed once per page
  by `FileTable.tsx` (`rowScopesNeeded`), and hands `scopeCount` to
  `AccessBadge.tsx`. No per-row queries anywhere.
- **Vocabulary:** `features/files/types.ts#Visibility` is the canonical union;
  `redux/converters.ts#toVisibility` is the only read boundary.

**Docs:** `features/sharing/FEATURE.md` (four load-bearing invariants +
change log), `FOUND_DEFECTS.md` (D105 / D106b / D107).

---

## 4. Remaining work

1. **Mount `<AccessSummaryPanel>` on other entities' info surfaces.** It is
   already generic — `entityType` + `entityId`. Start with agents, notes, and
   data stores. Pure consumption, no new primitive.
2. **Add a guard so the collapse cannot return.** Two cheap ones: an ESLint rule
   banning a `Visibility`-like union that omits `internal`, and a
   `pnpm check:*` grep for user-visible "Only you". Follow
   `scripts/schema-check/FEATURE.md` conventions.
3. **Resolve D107 with ONE controlled experiment.** Restore
   `turbopackMemoryLimit` to `42949672960` alone and release. Green ⇒ the v0.4.137
   revert was the fix, keep 40 GiB and re-land the `React.lazy → next/dynamic`
   campaign. Red ⇒ the ceiling is load-bearing, keep 30 GiB and re-land the
   campaign on top. **Never change the ceiling and re-land the campaign in the
   same release** — that is precisely how this became unattributable.
4. **After Arman answers D105** — implement his choice. If he picks a backfill,
   push back once: nothing records who set `internal` deliberately, so it can
   only be a blunt date-cutoff sweep that may revoke access people are using.
5. **After D105 — fix the five D106b surfaces.** Each needs its own conveyance
   check first (does that entity type even have container conveyance?). Do not
   bulk-rewrite blind.
6. **Widen the list container signal beyond scopes** (project / data store /
   workbook) *only* if a cheap bulk source exists. If it needs a per-row query,
   don't — that breaks Arman's cost constraint.

---

## 5. Gotchas & context

- **`shared` and `private` are RETIRED enum spellings.** Sending either to the
  server silently rewrites it to `personal`
  (`matrx_utils.visibility.LEGACY_VISIBILITY_MAP`). Never write them. The FE
  union no longer contains them; keep it that way.
- **`internal` is the DB default for files/folders.** Any new "is this private?"
  logic that tests `visibility === 'personal'` will be wrong for the majority of
  rows.
- **`entity_access_summary` is not list-safe.** It walks reachability and resolves
  titles per container. One entity at a time — this is Arman's explicit
  constraint, not a performance guess.
- **Never render a denormalized association label.** `platform.associations.label`
  is a snapshot from attach time, is frequently `NULL` in live data, and goes
  stale on rename. Use `entity_titles`.
- **Deploys only happen via `./scripts/release.sh` or `./ship.sh`.** A plain
  commit to `main` is **cancelled by design** by Vercel's Ignored Build Step
  (`scripts/vercel-ignore-build.sh`) — it will show as `CANCELED`, not failed.
  Hours were lost to this; do not conclude "the build is broken" from a
  `CANCELED` state.
- **A plain `release.sh` leaves the dirty tree alone** (only `package.json` is
  committed); `--ship` does `git add -A`. This repo often has several agent
  sessions with uncommitted work — use plain, and never `git add -A`.
- **Parallel sessions rewrite `main` constantly.** Expect your commits to be
  swept into someone else's release commit, and expect `git pull --rebase
  --autostash` to conflict on *their* files. Restore their working copy from the
  autostash rather than resolving their conflict.
- **`visibility` is a "belongs to" statement, not an ACL.** Per
  `docs/official/db-rules.md` §6, `personal` means "belongs to an individual
  person" — chats and DMs, almost nothing else. Org work defaults `internal`.
  Do not read `personal` as "secret".
