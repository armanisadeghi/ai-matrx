# P12 · Surface Values completeness

Run: `20260828T162115Z`

Base: `c50b4cfbcb557c66dbc2d128caa574f3788b48b1`

Scope: structural novelty since the prior P12 artifact plus the route, overlay, readiness, direct-interactive-root, and open-sighting inventory axes.

## Outcome

- Verified open surface units: **374**.
  - **161** unique registered overlay ids have no canonical Surface manifest.
  - **95** `(core)` route leaves resolve to no surface.
  - **118** declared surfaces have not earned verified readiness: 105 partial + 13 stub.
- Verified findings fixed: **1**. The canonical overlay union listed `keywordQuickAnswersWindow` twice; the duplicate was removed and the overlay detector now rejects duplicate registry identities.
- Patrol machinery added: **1**. `pnpm check:surface-interactive-roots` conservatively inventories canonical Dialog / AlertDialog / Drawer / Sheet / Tabs roots with explicit state and an interaction-bearing owner identity. It labels them audit candidates, never automatic Surface findings.
- Product behavior, surface manifests, DB mirror rows, and UI output changed: **none**.
- Human decisions required: **1 existing product decision** — whether the public, server-rendered `/education/learn` reader remains intentionally non-emitting, gains a thin client identity shell, or becomes client-rendered. The current source still presents those as materially different outcomes; no prior approval was found.
- Exceptions proposed or approved: **0**.
- Certification: **PENDING** for the exact candidate commit.

## Baseline and post-change diagnostics

- Isolated worktree: clean at the baseline SHA after reconciling the prior run from `delivery_queued` to `delivered` in `v0.4.1390`; dependencies installed locally with `pnpm install --offline --frozen-lockfile`.
- `pnpm type-check`: baseline PASS and final pre-candidate PASS with byte-identical output (`sha256 414f6f5ac4bb546e075d4c8298e3f99977a43fa48cf878c4b806144a2ad00702`). An intermediate post-change run caught an unsafe import-map inference; the candidate replaces it with an explicitly typed map and the clean baseline was restored.
- `pnpm check:surface-drift`: PASS — 194 manifests, 4,751 values, 427 write targets, 6 client tools.
- `pnpm check:surface-routes`: PASS — 703 `(core)` routes; 581 resolved, 27 deliberately unmapped, 95 undeclared.
- `pnpm check:surface-overlays`: PASS — 189 unique ids; 28 manifest declarations, 161 undeclared, zero duplicate registry ids, zero phantom claims, zero duplicate manifest claims.
- Focused Jest classifier suite: PASS — 5 tests covering controlled identity, aliased roots, runtime-provider evidence, subordinate/fake-root exclusion, action-dialog exclusion, and explicit-state requirements.
- Scoped ESLint, Prettier, `git diff --check`, and `pnpm check:doctrine`: PASS.
- `pnpm check:patrol-contracts`: unrelated baseline fleet drift remains for other patrol statuses/prompts and Fleet Health configuration; the live P12 prompt matches `scripts/pattern-patrol/manifest.ts` exactly.
- Managed preview: occupied by `/Users/armanisadeghi/code/matrx-frontend`. No browser proof is required for this detector/tuple-only batch because it changes no rendered UI or runtime overlay behavior.

## Structural novelty

- **148** new `(core)` route leaves since the prior P12 artifact.
- **63** newly added TS/TSX files contain a Surface runtime provider or canonical Dialog / Drawer / Sheet / Tabs root.
- **24** of those new signature files enter the conservative direct-interactive audit queue.
- Open P12 sightings: **0**.

The 95 currently unresolved route leaves group as:

| Family               | Count |
| -------------------- | ----: |
| HR                   |    55 |
| Workflows            |    18 |
| RAG                  |    12 |
| Product Capture      |     6 |
| Google review routes |     2 |
| Launchpad            |     1 |
| Trash                |     1 |

These are verified inventory gaps, not permission to mass-generate manifests. Each family needs a data-meaning audit, honest manifest, live emitter, Locate anchors, DB sync, and browser-earned readiness.

## Direct interactive-root evidence

`pnpm check:surface-interactive-roots` scanned 7,752 tracked runtime TSX files and found:

| Classification                                                 | Count |
| -------------------------------------------------------------- | ----: |
| Canonical roots                                                |   764 |
| Roots with explicit `open` / `value` / `defaultValue` state    |   756 |
| Subordinate or uncertain roots excluded from the audit queue   |   502 |
| Independent identity + state audit candidates                  |   254 |
| Candidate owners with a runtime provider in the same component |     4 |
| Candidate owners without same-component provider evidence      |   250 |

The 254 candidates are a triage pool, not 254 verified Surface defects. Action-named dialogs, small utility interactions, components without interaction identity, uncontrolled roots, tests, and fake local primitives are excluded. Owner/data-meaning review remains mandatory because static identity and state cannot decide whether two legitimate agent-binding boundaries should be one surface or two.

## Finding routes

### Standing-authority repair backlog

1. Process the 161 undeclared overlay ids in bounded family batches, completing the full Surface contract rather than landing manifest-only declarations.
2. Process route families in the order their owning data model is explicit; HR, Workflows, RAG, and Product Capture require family-level surface-boundary decisions before per-route manifests.
3. Promote the 105 partial and 13 stub surfaces only from recorded live evidence: declared/live parity, no runtime-only keys, Locate behavior, DB mirror sync, and the relevant non-matching-name binding test.

### Missing evidence or machinery

1. The direct-root detector now supplies a conservative queue, but it cannot infer data meaning or automatically merge responsive Drawer + Dialog twins into one candidate identity. The smallest next detector improvement is owner-level deduplication plus route/overlay/manifest correlation.
2. The stale `check:registry` command named in `overlay-ids.ts` remains absent from `package.json`; `check:surface-overlays` now covers duplicate canonical ids and manifest coverage but does not compare the metadata catalogue.
3. The foreign preview lease prevents this worktree from browser-checking UI candidates until released. This run's detector-only batch does not require that proof and did not reuse the foreign server.

### Genuine human decision

`matrx-user/education-learn` remains a stub by design pending a product choice. The public reader is intentionally server-rendered for SEO, while a live Surface emitter requires a client boundary. The three current outcomes remain: accept non-emitting reader pages, add a thin client identity shell while preserving server-rendered articles, or convert the reader to a client component.

## Recursive learning

Identity + explicit state + action/size classification removes 502 subordinate or uncertain roots from the direct-interactive audit queue without hiding them. The next smallest precision gain is deduplicating responsive Drawer/Dialog twins by owning component and correlating candidates to existing route, overlay, and manifest identities before human data-meaning review.
