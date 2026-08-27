# P3 Mobile-Friendly UI Patrol

- **Run date:** 2026-08-27 (America/Los_Angeles)
- **Run id:** `2026-08-27T131727Z`
- **Base:** `2cfc5d15ffbb1886572f97f7ea58451dadcc1aa6` (`v0.4.1306` ancestry)
- **Run kind:** structural-novelty scope + open-sighting verification + periodic full viewport/safe-area pass
- **Current state:** closed after exact-SHA certification and escaped-delivery reconciliation through `v0.4.1307`
- **Findings:** 19 verified occurrences in 8 files
- **Fixed in candidate:** 19
- **Approvals needed:** 0
- **Degradation:** none outstanding. Two detached automation worktrees were removed externally and exact-checkout browser navigation timed out; the candidate was preserved, independently certified with bounded evidence, and fully reconciled.

## Resume reconciliation

The prior P3 candidate `e8a5e84287f0d68962bcbcd067419432d706fcc2`
was already an ancestor of `origin/main` and release `v0.4.980`. Its permanent
authority record now carries the missing `delivered` event.

This run began in the detached automation worktree at base `2cfc5d15ff`. That
worktree and one exact replacement were removed externally after baseline
capture. The integration controller preserved the coherent fixing-state batch
as `f28850472b2c617b9adcb53aeb43e37c2d96471a` on `origin/main` before
certification. The permanent record therefore names the infrastructure block
and escaped delivery explicitly; integration is not being treated as proof.

## Scope scanned

Structural novelty since the preceding certified candidate:

- 177 added route leaves (1,217 current; SHA-256 `b496f1096b12b8e576f25656f7b07e0f702db5b8fbe77fe2e7dad287ce0d468c`)
- 754 added direct client TSX files
- 11 net-new top-level feature directories (138 current; SHA-256 `2ebbc9373a2253eeaf669f3aae26f0be45b4b8dd4256a6fea12c67c3354bcea8`)
- all open P3 sightings
- a periodic full runtime pass for numeric `vh`, `h-screen`, pinch-zoom config, inline sub-16px font sizes, and fixed-bottom safe-area candidates
- targeted triage of new hover-hidden candidates and direct client route roots

The full mechanical viewport/config pass is clean: no live numeric `vh`, no
`h-screen`, no inline sub-16px font size, correct `userScalable: true` /
`maximumScale: 5`, and no verified fixed-bottom safe-area defect.

## Verified findings and standing-authority repairs

### Hover-hidden touch actions — 11 occurrences

Eleven real edit, delete, filter, and row-menu actions were unconditionally
`opacity-0` and depended on `group-hover` to become visible. They occurred in:

- Industry pack bands (2)
- Industry pack meaning (2)
- Industry pack topics (2)
- Taxonomy tree row actions (1)
- Performance review delete (1)
- HR self-service edit (1)
- Keyword Workbench filter (1)
- Workflow browse row menu (1)

Every action is now visible by default. Desktop hover-capable devices retain
the dense reveal behavior through `[@media(hover:hover)]`; focus visibility is
preserved. Event handlers, labels, permissions, and desktop dimensions are
unchanged.

### Coarse-pointer touch floor — 8 surface roots

The same eight dense roots now consume the existing `.matrx-touch-targets`
primitive. It applies only under `pointer: coarse`, raises controls to the 44px
minimum, and leaves mouse/desktop density unchanged.

## Baseline-delta verification

- `pnpm type-check`: PASS -> PASS
- `pnpm check:doctrine`: PASS -> PASS
- `pnpm check:page-headers`: 7 warnings -> the same 7
- `pnpm check:ui-primitives`: 25 warnings -> the same 25
- `pnpm check:tsconfig`: PASS with the same two notes
- `pnpm check:patrol-contracts`: unchanged baseline failure limited to other patrol/fleet automation drift; P3 has no manifest drift
- `pnpm check:migrations`: exit 0 with 60 unrelated pre-existing drift warnings
- scoped ESLint: the same two baseline errors before and after (`PackTopicsSection.tsx:67`, `TaxonomyTree.tsx:113`); neither changed line is involved
- PostCSS/Tailwind compilation: PASS, 1,649,911 generated CSS bytes
- changed-file assertions: 8 touch-floor roots, 11 `hover:hover` hides, 11 matching hover reveals, 0 unconditional hover-hidden action matches
- `git diff --check`: PASS

The managed preview is owned by the requested checkout but was already at
approximately 25 GB RSS. A 375x812 in-app Browser navigation timed out; the
owned tab was closed and viewport override reset. No foreign preview, Chrome,
or user tab was used. Under the baseline-delta constitution this is
infrastructure evidence, not a product rejection.

## Open routing

- `/administration/ai/ai-models/provider-sync` remains open: the prior 375x812
  compressed-header sighting could not be re-verified because the exact
  checkout navigation timed out. It remains a missing-current-evidence task,
  not an exception.
- The broad hover-only backlog remains a detector/triage task. This run repaired
  all 11 verified real actions in the structurally new candidate set; decorative
  hover polish and responsive desktop-only actions were not counted.

No exception was proposed, suppressed, or allowlisted. No product-layout choice
requiring Arman was found.

## Certification

Independent adversarial review **CERTIFIED** exact candidate
`f28850472b2c617b9adcb53aeb43e37c2d96471a`: all 19 repairs, Tailwind
semantics, coarse-pointer isolation, keyboard visibility, unchanged handlers,
and the baseline-delta evidence passed with no concrete batch-caused defect.
The candidate had already been preserved on `origin/main` and entered
`v0.4.1307`; the permanent record retains that ordering as escaped delivery and
then closes it with exact-candidate certification and delivery reconciliation.

## Recursive learning

This run proved the hover detector becomes useful when it requires a real
interactive element plus unconditional `opacity-0`/`group-hover`, and that the
same nearest-root `.matrx-touch-targets` repair safely closes the paired target
floor. The smallest next improvement is a P3 detector that reports interactive
hover-hidden controls separately from decorative icons and asserts the nearest
coarse-pointer floor.
