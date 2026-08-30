# P13 — Picker custom entry

Latest run `20260830T083100Z` · ERADICATION · closed 2026-08-30

## Latest certified repair wave

- Candidate: `562eaed419b332de4a1cf31136642fcf1e9248ae` (five cumulative files, two product commits).
- `ScopeContextTargetPicker` keeps its selection-only organization → scope type → scope → context-item cascade and now exposes the selected records plus each level's canonical owner/create surface. It adds no organization, scope, or context-item writer.
- The first candidate was correctly rejected because the new compact door links had 20×20px mobile targets. The repaired candidate scopes the picker with `matrx-touch-targets` and marks both local and shared official door links with `data-tap-target`, preserving compact desktop geometry while enforcing the coarse-pointer 44px floor.
- Independent verdict: **CERTIFIED** by `competitor_pickers`; no candidate-caused defect across the exact cumulative five-file diff.

## Earlier certified repair wave

- Candidate: `bfd76db84e4760ed73380389306689ba6174de26` (10 files, two coherent product commits).
- `BrandIdentitySiteSurface` now uses the shared `CreatablePicker`, canonical URL normalization, and the existing `useCreateSite` → `web.create_site` writer; the created site is refreshed and selected immediately.
- `ResearchTopicSelect` now uses the shared `CreatablePicker` and the existing `research#createTopic` writer with the viewed site's explicit `organization_id`; the created topic is refreshed and selected immediately across all callers.
- Both controls retain a door to the vocabulary's owning surface.
- Independent verdict: **CERTIFIED** by `competitor_pickers`; no candidate-caused defect across the exact 10-file diff.

## Verification

- `pnpm patrol:run verify --patrol P13 --run 20260830T083100Z` validates the 10-event hash chain at final state `closed` and event hash `19b31e7e035f2f3b86bab66095357edf6f663dacbe08e0291ba4adc07d128392`.
- Latest candidate checks passed: two focused suites / eight tests, `pnpm type-check`, `pnpm check:picker-add:strict`, scoped ESLint, ancestry, and `git diff --check`.
- Earlier candidate checks passed: `ResearchTopicSelect` 2/2, website URL normalization 11/11, type-check, picker detector, scoped ESLint, and diff/ancestry checks.
- The certifier's isolated Browser selector was unavailable for the latest batch; the risk was covered by focused rendered-component tests and static CSS-selector proof, so infrastructure did not reject valid work.

## Delivery and ancestry

- Candidate `562eaed419b332de4a1cf31136642fcf1e9248ae` is an ancestor of certified integration `e6c6a35eca1266bfd5804edd0c755d79f7b0e5b3`, current `origin/main`, and first containing release `v0.4.1486`. Authority ref: `refs/heads/patrol-runs/P13/20260830T083100Z`.
- The earlier candidate remains delivered in `v0.4.1485`; its pre-certification release ordering escape is reconciled in run `20260830T081317Z`.

## Remaining human decisions

- Human product decision: choose the canonical metadata model before merging the legacy shortcut-category fork; do not add an inline writer to the fork.
- Human product decision: generic `SelectInput` already honors the agent-authored `allowOther` flag. Choose whether `allowOther={false}` remains an intentionally closed execution schema or every generic choice control must accept a one-off custom value. Inline durable creation is not a safe third path because static agent options and structured user lists have different canonical owners and permissions.

## EXCEPTION APPROVAL REQUIRED

- `features/agents/components/run-controls/SurfaceSimulatorSelect.tsx`: proposed existing-record exception because it selects registered `ui.ui_surface` records whose creation belongs to the canonical surface registry; an ad-hoc value would bypass server tool resolution. Stable review path: `/chat/new` → input `+` → Run controls → Creator/advanced settings → Surface. The detector allowlist predates this run; P13 did not approve, clear, or add an exception. Arman must approve or reject it explicitly.

## Recursive learning

Compact official link controls need both a `matrx-touch-targets` host and `data-tap-target`; the host alone expands buttons but deliberately does not expand unmarked prose links.
