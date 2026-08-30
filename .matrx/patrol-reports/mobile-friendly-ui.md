# P3 Mobile-Friendly UI Patrol

**Updated:** 2026-08-30  
**Mode:** ERADICATION  
**Runs:** `20260830T141852Z`, `20260830T143951Z`

## Outcome

This wave verified and repaired 18 mobile defects: the open Provider Sync compressed header plus 17 hover-only interactive controls across 15 files. Both exact product candidates are independently certified and present on `origin/main`. No approval or exception is needed.

P3 remains in ERADICATION. The corrected repository detector reports 169 actionable findings, 4 review findings, 93 decorative matches, and 187 already-safe matches. The next bounded unit is 20 findings across 15 files.

## Provider Sync compressed header

The 375x812 sighting on `/administration/ai/ai-models/provider-sync` was reproduced: five metrics collapsed into narrow columns and the legend, Copy, and Refresh controls overlapped.

Exact candidate `141d52a518e50714c865419f020c0aa81f028566` repairs the shared dashboard toolbar by separating mobile statistics, legend, and actions into wrapping lanes; preserving the compact desktop row; and providing 44px mobile actions. Focused regression tests pass 2/2.

Independent certifier `/root/p3_provider_certifier_fresh` returned **CERTIFIED**:

- 375x812 light and dark: 375px document width, no overflow or overlap, three distinct lanes, 44px Copy and Refresh.
- 1440x900 light and dark: one compact 45px toolbar row, no overflow or overlap, 28px desktop actions.
- Exact blobs, type-check, focused Jest, and path diff check passed.

The shared controller integrated the candidate before certification. Run `20260830T141852Z` preserves that ordering failure, then records exact certification and integration-only delivery. No release was created for this unit.

## Hover-only interaction detector

`scripts/pattern-patrol/p3-hover-detector.ts` now distinguishes actionable controls from decorative icons, gives imported icon identity precedence over component-name suffixes, and requires hover hiding to be viewport-breakpoint-gated or otherwise explicitly safe below the breakpoint. Detector candidate `2a23c732f242b206db32064c4eec5cca060b6ed2` contains exactly the detector and its test; 15/15 tests pass.

The detector learned two concrete false-positive and false-negative classes during this run:

- Imported Lucide icons such as `ExternalLink` are decoration unless the callsite supplies interaction semantics.
- `@media (hover:hover)` alone is not mobile-safe because a browser can report hover capability at a 375px viewport; desktop hiding must also be breakpoint-gated.

Current inventory: 169 actionable, 4 review, 93 decoration, 187 safe.

## Hover repair unit 1

Exact replacement candidate `c4eed060429b9941c5325d3e8ff88a10edfd90e8` repairs 17 verified controls across 15 files. Controls are visible by default, retain keyboard focus visibility, use the nearest safe `.matrx-touch-targets` floor, and hide/reveal only under `sm:[@media(hover:hover)]`, preserving desktop behavior without re-hiding mobile-width actions.

The first retry `38173c5d5011a6e594c3e9aa0eecf4c86a735527` was correctly **REJECTED**: at 375x812 the Browser reported hover capability, and Workbooks Delete computed to opacity 0 despite a 44x44 box. The replacement fixes the entire 17-control class, not only that callsite.

Independent exact-candidate certification is **CERTIFIED**:

- 375x812 light and dark: Delete and Quick Look are visible at opacity 1, 44x44, with no overflow or overlap; Quick Look activation opened the expected dialog.
- 1440x900 light and dark: Delete is hidden at rest and revealed by card hover and true keyboard focus; dense 28px desktop geometry and non-overlap are preserved.
- All 15 owned blobs matched before and after Browser proof; type-check, syntax, path diff, and detector Jest 15/15 passed.

The shared release lane tagged the active replacement as `v0.4.1495` before certification. Permanent run `20260830T143951Z` retains the `infrastructure_blocked` and `escaped_delivery` events, the concrete rejected predecessor, exact replacement certification, and reconciliation to the existing release. No redundant release was created.

## Remaining routing

The next bounded repair unit contains 20 findings across PackBandsSection, PackMeaningSection, PackTopicsSection, SystemPromptColumnHeader, ToolsColumnHeader, TuningColumnHeader, VariationsColumnHeader, ResourcesSection, AgentContextPoliciesManager, AgentSettingsCore, StreamProfilerOverlay, DocumentsWorkspace, InstanceUIStateCore, InstanceUIStateList, and TaskPanel.

No finding was suppressed, allowlisted, or converted into an exception. The four detector review findings remain open for evidence-based classification.

## Baseline and infrastructure notes

- Canonical checkout and canonical `pnpm preview:start/status/stop` lease were used; no worktree was created.
- A poisoned preserved `.next-preview` cache reported a duplicate declaration absent from current source and passing type-check. The cache was moved recoverably to `/tmp/matrx-p3-next-preview-stale.bz3yvK/.next-preview`; the clean canonical rebuild returned HTTP 200.
- Independent Browser bindings reset several times. Those incidents were recorded as infrastructure evidence; no valid repair was rejected for them.
- Concurrent shared-checkout checkpoints twice absorbed exact owned bytes and once rolled back the first hover candidate. Durable refs and blob-scoped certification preserved exact provenance without overwriting unrelated work.

## Recursive learning

Imported-icon identity must precede component-name control heuristics, and mobile-safe hover hiding needs both hover capability and an explicit desktop breakpoint. The smallest next process improvement is to make the detector assertion and four-quadrant Browser probe a pre-certification gate before the shared release lane can checkpoint or tag an active candidate.
