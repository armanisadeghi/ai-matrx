# P6 — No emojis in UI

- Run date: 2026-08-30
- Mode: ERADICATION
- Base SHA: `857dcd2c3b7bed591441c6a175caf72eb1397ec4`
- Outcome: four independently certified batches delivered to `origin/main`; versioned release remains in the serialized release lane
- Automation: ACTIVE, Wednesdays and Saturdays at 6:10 AM, canonical local checkout

## Scope and baseline

- Resumed the 2026-08-29 queue of 102 verified user-visible literal nodes in 47 files before broad discovery.
- Pre-edit registry detector: 1,146 raw lines in 434 files.
- Pre-edit `pnpm type-check`: PASS.
- Structural-novelty audit since the prior certified candidate found 71 added raw matches; all 71 are non-rendered comments or JSX comments.
- Independent review found two additional user-visible empty-set symbols outside the registry range, increasing the verified run scope to 104 nodes in 48 files.
- Existing unrelated shared-checkout dirt was captured and excluded. No worktree was created or used.

## Standing-authority repairs

- Fixed 100 verified user-visible glyph nodes in 46 unique files.
- Replaced semantic success, failure, warning, refresh, search, close, rating, state-count, and selection glyphs with Lucide icons.
- Deleted redundant decoration where adjacent text or existing icons already carried the meaning.
- Replaced the missing-state `∅` and null-history `∅` with explicit `missing` and `None` text.
- Preserved handlers, copy, state, colors, layout, theme behavior, and responsive behavior.
- Restored explicit accessibility after adversarial review with `aria-pressed`, screen-reader completion text, and screen-reader rating/review/applied/rejected/supported/refuted labels while keeping visual icons decorative.

## Certified batches

1. Demo/auth — 15 files — `d3abcf9afad3fc356465db3daa1d3e8df920660f` — **CERTIFIED**.
   - Initial reconstructions were rejected because unrelated same-file `EntityRef` and Slack permalink behavior contaminated the boundary.
   - Retry 2 contains only P6 hunks; detector clean and contamination absent.
   - Permanent run: `73c40b81-9bae-4c53-a852-9c65c0a73260`.
2. Admin/canvas — 15 files — `533da349ffc81fd2b9126892750a9c090142cb8f` — **CERTIFIED**.
   - Initial candidate was rejected because two decorative icons removed accessible selected/completed state.
   - Retry adds `aria-pressed` and explicit screen-reader completion text.
   - Permanent run: `b0934bd3-4f5c-40c1-b2ee-8fde587a8eb6`.
3. Feature surfaces — 15 files — `abe3c5ca9ab8bd25a2bd895527add992a4324dab` — **CERTIFIED**.
   - Initial reconstruction was rejected for an unrelated table-copy contract; the first retry was rejected for title-only accessible meaning.
   - Retry 2 excludes the copy contract and restores explicit screen-reader meanings.
   - Permanent run: `a256b3eb-ee6c-4da4-b2e0-ea3bdf5a9cc0`.
4. Detector gap — 2 files — `68294e85d79077c2ef526bb180cac43032f9c6e0` — **CERTIFIED**.
   - Replaced two visible `∅` status values with explicit text.
   - Permanent run: `fa598c34-b3a6-4c08-abe0-15a9c1d2ac2f`.

All four candidates are certified ancestors of `origin/main` at integration checkpoint `05ad7aa37eb95e8f0f539068ff732ec87a3957d5`. Their permanent records preserve every rejection, correction, certification, delivery queue, and delivery event. Release field: `pending-serialized-release`.

## Remaining verified findings — human decision

Four prompt glyphs remain in two terminal files:

- `features/code/terminal/SimpleTerminal.tsx:290,325`
- `features/code/terminal/TerminalTab.tsx:99,700`

The rendered `❯` is terminal prompt/protocol output. The P6 skill expressly forbids automatic terminal-protocol rewrites. The exact proposed repair is `❯` → ASCII `>` in all four locations. This is the only remaining verified product-authored UI decision; there are no remaining repair-now items.

## False-positive audit

- Nine matches in the repaired 45-file queue are non-rendered comments.
- Five added `∅` matches in `RefineRunPage.tsx` are internal selector sentinel ids and never reach rendered/exported content.
- The prior ten console-only literal nodes remain false positives.
- Expanded post-run detector: 1,053 raw lines in 394 files. The increase from the original post-run range is the five internal `∅` sentinels; the prior emoji-range output is 1,048 lines in 393 files.
- Approved exceptions: none. Proposed exceptions: none.

## Verification

- Independent adversarial verdicts: **CERTIFIED** for all four exact candidates.
- Exact candidate boundaries: 15 / 15 / 15 / 2 files.
- `git diff --check`: PASS for all candidates.
- `pnpm check:doctrine`: PASS.
- `pnpm type-check`: pre-edit PASS; post-edit PASS before unrelated concurrent membership edits, and later diagnostics named only those unrelated files. No candidate error was reported.
- Candidate detectors: demo/auth clean; admin/canvas two comment-only matches; feature surfaces seven comment-only matches; detector-gap batch clean under both the registry range and `∅` expansion.
- Exact candidate-blob ESLint: only unchanged baseline debt; both detector-gap files clean.
- Managed preview lease remained owned by the canonical checkout and was not stopped. Browser control was unavailable in this task, so certification used exact candidate/source, DOM/accessibility, detector, type, doctrine, lint, and adversarial evidence.

## Detector/process learning

- The detector now includes `U+2205` because visible Unicode iconography is broader than emoji blocks; internal sentinel ids are documented false positives.
- In a high-concurrency shared checkout, reconstruct certification candidates from path-scoped repair hunks, not current whole-file blobs, because same-file work from other patrols can contaminate an otherwise bounded candidate.
