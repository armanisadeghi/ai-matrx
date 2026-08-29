# P12 · Surface Values completeness

Run: `20260828T162115Z`

Base: `c50b4cfbcb557c66dbc2d128caa574f3788b48b1`

Scope: structural novelty since the prior P12 artifact plus the periodic full inventory of route leaves, canonical overlays, manifest readiness, live providers, and direct dialog/drawer/sheet/tab roots.

Run classification: **inventory/machinery**, not a product Surface completion. No live Surface UI was enhanced in this run.

## Outcome

- Verified open surface units: **374**
  - **161** canonical overlay ids have no Surface manifest.
  - **95** `(core)` route leaves are undeclared after canonical resolution and deliberate-unmapped handling.
  - **118** declared surfaces have not earned verified readiness: 105 partial + 13 stub.
- Product findings fixed: **1** — `keywordQuickAnswersWindow` appeared twice in the canonical overlay-id union. The duplicate identity was removed, leaving 189 total and 189 unique ids without changing runtime behavior.
- Patrol machinery fixed: **1** — `pnpm check:surface-interactive-roots` now classifies direct canonical interaction roots by identity, explicit state, component role, action/size exclusions, and nearby provider evidence. Its output is explicitly an audit queue, never automatic findings. `check:surface-overlays` now also fails on duplicate canonical ids.
- Product UI, runtime behavior, manifests, database, and schema changed: **none**.
- Human decisions required: **1 existing product decision** — whether `/education/learn` remains intentionally non-emitting, gets a thin client identity shell while preserving server rendering, or becomes client-rendered.
- Exceptions proposed or approved: **0**.
- Certification: **CERTIFIED** for exact candidate `2470f82af0a2726af49786c4a25a8451282e7a76`. The independent certifier found no batch-caused defect.
- Delivery: **DELIVERED** — the certified candidate is preserved at `refs/heads/patrol-runs/P12/20260828T162115Z`, is an ancestor of release commit `e1968d0a6e`, and shipped successfully in `v0.4.1392`. Later releases continue to contain it; no redundant release is required.

## Baseline and delta diagnostics

- Isolation: the automation ran only in `/Users/armanisadeghi/.codex/worktrees/b923/matrx-frontend`; dependencies were installed locally with `pnpm install --offline --frozen-lockfile` and were never symlinked.
- Worktree recovery: after certification, the isolated worktree was unexpectedly removed. It was recreated at the exact certified candidate and dependencies were reinstalled offline. The remote candidate and hash-chained authority record prevented code or evidence loss.
- `pnpm type-check`: baseline and candidate both PASS with byte-identical output hash `414f6f5ac4bb546e075d4c8298e3f99977a43fa48cf878c4b806144a2ad00702`. An intermediate unsafe import-map inference was caught and repaired before candidacy.
- `pnpm check:surface-drift`: PASS — 194 manifests, 4,751 values, 427 write targets, 6 client tools.
- `pnpm check:surface-routes`: PASS — 703 `(core)` routes; 581 resolved, 27 deliberately unmapped, 95 undeclared.
- `pnpm check:surface-overlays`: PASS — 189 total ids, 189 unique ids, 28 declared, 161 undeclared.
- `pnpm check:surface-interactive-roots`: PASS — 7,752 tracked runtime TSX files, 764 canonical roots, 756 with explicit state, 502 subordinate or uncertain roots excluded, 254 independent audit candidates; 4 candidates have provider evidence and 250 do not.
- Structural novelty since prior artifact `6947c913`: 148 new `(core)` route leaves and 63 new signature TSX/TS files; 24 enter the conservative direct-root audit queue.
- `pnpm check:patrol-contracts`: the P12 prompt matches the canonical manifest. The command still reports unrelated fleet prompt/status drift and Fleet Health debt; those baseline failures are not P12 findings.
- `pnpm check:migrations`: exits successfully but cannot compare the shared ledger without Supabase credentials. This batch has no database or migration change.
- `pnpm check:reuse-index`: exits successfully with four unrelated stale paths.
- Preview lease: another checkout owned the machine preview. No preview was reused and no visual certification was required because this batch changes no rendered or runtime product behavior.

## Independent certification

- Verdict: **CERTIFIED** — exact candidate `2470f82af0a2726af49786c4a25a8451282e7a76`, certifier task `/root/p12_certifier`.
- Focused Jest tests: 5/5 passed, covering controlled substantial dialogs, aliased tabs, provider evidence, fake/subordinate roots, action-dialog exclusion, and explicit state.
- Scoped ESLint, Prettier, `git diff --check`, type-check, surface drift, route, overlay, and interactive-root checks passed.
- Counts independently reproduced: 189 total overlay ids, 189 unique, 0 duplicates.
- Mutation proof: reintroducing the removed duplicate made `check:surface-overlays` exit nonzero and name `keywordQuickAnswersWindow`; restoring the candidate returned the detector to clean.
- Adversarial in-memory assertions confirmed aliased imports, fake primitives, explicit state, action/subordinate exclusion, and provider-present/provider-absent classification.
- The certifier confirmed the scanner labels all 254 results as audit candidates rather than automatic findings.

## Inventory evidence

### Declared surfaces

| Readiness | Count | Meaning                                                             |
| --------- | ----: | ------------------------------------------------------------------- |
| Verified  |    76 | Browser-earned contract evidence recorded                           |
| Partial   |   105 | At least one declaration/emitter/Locate/mirror/browser item remains |
| Stub      |    13 | Vocabulary only or no live emitter                                  |
| Total     |   194 | Current code manifests                                              |

Readiness counts are taken from `ALL_MANIFESTS`; green manifest drift proves internal declaration consistency, not live completeness.

### Canonical overlays

- Canonical ids: 189 total and 189 unique after removing the duplicate.
- Manifests declaring an overlay id: 28.
- Undeclared canonical ids: **161**.
- A duplicate canonical id is now a hard detector failure; undeclared ids remain a printed C/R backlog until each surface earns a complete declaration.

The exact live backlog is emitted by:

```bash
pnpm check:surface-overlays
```

### Undeclared routes

The 95 undeclared route leaves group into 55 HR routes, 18 workflow routes, 12 RAG routes, 6 tool/product-capture routes, 2 Google review routes, 1 launchpad route, and 1 trash route. These are inventory candidates until route resolution and host ownership are audited; they are not safe targets for mass-generated manifests.

### Direct interactive roots

The new conservative classifier found 254 independent audit candidates from 764 canonical roots. It excluded 502 subordinate or uncertain roots using component identity and action/size evidence. Only 4 candidates have a nearby `SurfaceRuntimeProvider`; absence is evidence to inspect ownership, not proof that the child requires a new manifest.

## Finding routes

### Standing-authority repair backlog

1. Audit undeclared overlay ids in coherent surface families, at no more than 15 files per certified batch. Complete identity, values, live provider, typed scopes, Locate anchors, readiness evidence, and any mirror contract together.
2. Resolve the 95 route leaves against canonical hosts before declaring new surfaces. A route leaf may be an alias, a deliberate non-emitter, or an independent surface.
3. Use the 254 direct-root candidates as a conservative review queue. Responsive Dialog/Drawer twins and nested action dialogs should resolve to their owner rather than acquire duplicate manifests.
4. Promote partial or stub readiness only from recorded live evidence; manifest-only consistency is not closure.

### Missing evidence or machinery

1. The direct-root classifier still needs owner-level deduplication for responsive Drawer/Dialog twins.
2. Route, overlay, manifest, and provider outputs remain separate evidence sets; correlating them by canonical owner would reduce repeated manual triage without turning candidates into findings.
3. Supabase-backed checks remain unmeasured in this isolated environment, though this batch does not touch database state.

### Genuine human decision

`matrx-user/education-learn` is a public, server-rendered reader. Three outcomes remain legitimate: keep it non-emitting, add a thin client identity shell while retaining server-rendered article content, or make the reader client-rendered. No prior approval was found, and the patrol does not choose that product reachability tradeoff.

## Recursive learning

Identity + explicit state + action/size evidence removed 502 subordinate or uncertain roots from the raw interaction inventory. The smallest next precision gain is owner-level deduplication of responsive Drawer/Dialog twins, followed by correlation of route, overlay, manifest, and provider evidence under one canonical owner.

User-facing acceptance must distinguish inventory from completion. Future product-completion runs select one ranked Surface family, complete its full contract end to end, and report the exact live URL plus the interaction path that exposes the changed Surface. A detector-only run is labeled **inventory/machinery** and must not imply that a live Surface was enhanced.
