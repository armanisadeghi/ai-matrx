# P13 — Picker custom entry

Run `20260830T081317Z` · ERADICATION · reconciled 2026-08-30

## Certified repair wave

- Candidate: `bfd76db84e4760ed73380389306689ba6174de26` (10 files, two coherent product commits).
- `BrandIdentitySiteSurface` now uses the shared `CreatablePicker`, canonical URL normalization, and the existing `useCreateSite` → `web.create_site` writer; the created site is refreshed and selected immediately.
- `ResearchTopicSelect` now uses the shared `CreatablePicker` and the existing `research#createTopic` writer with the viewed site's explicit `organization_id`; the created topic is refreshed and selected immediately across all callers.
- Both controls retain a door to the vocabulary's owning surface.
- Independent verdict: **CERTIFIED** by `competitor_pickers`; no candidate-caused defect across the exact 10-file diff.

## Verification

- Baseline `920388cbe63aa759408b63722128b499f1673d87`: `pnpm type-check` passed; `pnpm check:picker-add` reported `BrandIdentitySiteSurface`.
- Candidate: `pnpm type-check`, `pnpm check:picker-add`, scoped ESLint, and `git diff --check` passed.
- Focused tests: `ResearchTopicSelect` 2/2 and website URL normalization 11/11 passed.
- Candidate ancestry and candidate-file invariance against later run-record commits passed.
- Managed preview was running, but the isolated in-app Browser selector was unavailable. This is recorded as infrastructure evidence, not a product rejection.

## Delivery reconciliation

The scheduled fleet release consumed shared-checkout `main` while independent certification was still running. The ledger records the resulting `escaped_delivery`, later exact-candidate `CERTIFIED` evidence, delivery in `v0.4.1485` at integration `1c345d7f6660196238ee5775693e3d7e71390c8e`, and reconciliation. Authority ref: `refs/heads/patrol-runs/P13/20260830T081317Z`.

## Remaining routed work

- Repair next: wire the four existing-record owner doors in `ScopeContextTargetPicker` without adding duplicate record writers.
- Human product decision: choose the canonical metadata model before merging the legacy shortcut-category fork; do not add an inline writer to the fork.
- Human product decision: rule whether broker-authored generic `SelectInput` options are user vocabulary or true closed enums.
- Exception approval remains open for `SurfaceSimulatorSelect`; the existing detector allowlist predates this run and was not approved or cleared by the patrol.

## Recursive learning

Once a formerly exempt picker becomes safely creatable, remove its detector allowlist in the same patrol so the repaired contract becomes regression coverage.
