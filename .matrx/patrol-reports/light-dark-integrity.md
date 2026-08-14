# P4 Light/Dark Integrity Patrol

- **Run date:** 2026-08-14 (America/Los_Angeles)
- **Run kind:** scheduled Tier-M patrol; structural-novelty scope plus full pass
- **Outcome:** 46 active manual exception proposals / 100 raw-token lines; 0
  new defects; 0 auto-fixes; 1 stale proposal resolved before this run
- **Readiness:** P4 still declares Skill ✅ and Detector ✅

## Immutable baseline and isolation

- Checkout: `/Users/armanisadeghi/.codex/worktrees/f8df/matrx-frontend`
- Starting commit: `3528d656712fd4ace5bc08fb8ef3d15c13cb8640`
  (`HEAD == origin/main`), detached isolated worktree, clean status.
- `node_modules` was absent, so the mandated
  `pnpm install --offline --frozen-lockfile` completed without changing the
  lockfile or dependency declarations.
- Pre-edit `pnpm type-check`: PASS.
- Pre-edit detector tests: 4/4 PASS.
- Pre-edit `pnpm check:doctrine`: PASS.
- Pre-edit `pnpm check:ui-primitives`: PASS with 19 pre-existing warnings.
- Pre-edit strict detector: expected exit 1 because unapproved proposals remain;
  no invalid exception record exists.
- `pnpm check:migrations` completed after linking the canonical ignored
  `.env.local` without reading or tracking it. It exposed three unrelated,
  pre-existing non-blocking drift records: `iam_verify_canonical.sql`,
  `iam_verify_canonical_add_legacy_is_deleted.sql`, and
  `mtx_public_url_guard_schema_aware.sql`. P4 did not alter migrations or the
  live database.
- `pnpm sync-types` was intentionally not run because this patrol's explicit
  hard rule forbids touching generated files; the required read-only
  `pnpm type-check` gate passed before and after the report update.

## Scope and detector baseline

The prior report anchor was commit
`f549da931d4bd4d069becdd6535beadc14b7c2a2`. The required structural-novelty
scope contained 195 added/changed runtime and test `.tsx` files, including
eight new route leaves and no new top-level `features/*` directory:

1. `app/(admin)/administration/reporting/unwired/page.tsx`
2. `app/(core)/crm/duplicates/page.tsx`
3. `app/(core)/crm/outreach-lists/[listId]/dial/page.tsx`
4. `app/(core)/crm/outreach-lists/[listId]/page.tsx`
5. `app/(core)/crm/outreach-lists/page.tsx`
6. `app/(core)/marketing/brands/[brandId]/sites/[siteId]/growth-loop/page.tsx`
7. `app/(core)/marketing/growth-loop/[loopRunId]/page.tsx`
8. `app/(core)/marketing/initiatives/page.tsx`

Scoped detector result: 195 files scanned, 11 raw-token lines, 4 contextual
candidates. All four are pre-existing proposals whose source lines moved or
whose surrounding component changed; component and call-site review confirmed
their fixed-output/on-color intent is still plausible but not agent-approvable:

- `MediaBody.tsx:73` — fixed white document iframe matte.
- `PageEditor.tsx:756` — fixed white authored-page preview canvas.
- `LearningGainReportView.tsx:80` — print-only white report background.
- `HtmlInlinePreview.tsx:317` — fixed white rendered-webpage iframe matte.

The extra full pass scanned 6,635 `.tsx` files and found 262 files / 668
matching lines: 532 property-specific same-line pairs and 136 contextual
candidates. Those 136 reconcile to 100 active proposal lines plus 36 existing
explicit/multiline theme branches, overridden fallbacks, comments, or
non-rendered outputs. Approved exceptions: 0. Invalid exception records: 0.

## Routed report

### Auto-fixed now

None. No verified theme-surface defect in this run matched the skill's exact
mechanical semantic-token repair table.

### Manual approval requested

The complete production URLs, reproduction states, raw tokens, contrast
rationale, and normal-fix effects are maintained in
`.matrx/patrol-reports/light-dark-integrity-exception-review.md`. The current
46-item decision set is:

1. `P4-PENDING-001` — `FeedbackTable.tsx:934` selected-stage count badge.
2. `P4-PENDING-002` — run-a `AssetGallery.tsx:102` media play disc.
3. `P4-PENDING-003` — run-f `AssetGallery.tsx:54` media play disc.
4. `P4-PENDING-004` — `ProductionStage.tsx:105,106` artwork carousel dots.
5. `P4-PENDING-005` — `StageCanvas.tsx:169,170,185,186` artwork status/dots.
6. `P4-PENDING-006` — `PageSpeedResults.tsx:76` gradient-button count badge.
7. `P4-PENDING-007` — tool-viz `page.dev.tsx:1279` selected-row badge.
8. `P4-PENDING-008` — tic-tac-toe `page.tsx:280` fixed-dark board hover.
9. `P4-PENDING-009` — `PromptExecutionDebugPanel.tsx:222` blue-header hover.
10. `P4-PENDING-010` — `ErrorBoundaryView.tsx:129` dark stack chrome.
11. `P4-PENDING-011` — `MatxLoader.tsx:70,71` authored loader dots.
12. `P4-PENDING-012` — `DecisionTreeBlock.tsx:340` active-node hover.
13. `P4-PENDING-013` — `FlashcardMobileView.tsx:138,140,142,143,151,624,929,930,935,995,1094,1103` fixed-dark study chrome.
14. `P4-PENDING-014` — `FlashcardsBlock.tsx:392` gradient-prompt button.
15. `P4-PENDING-015` — `ImageBlock.tsx:337,369` black fullscreen viewer chrome.
16. `P4-PENDING-016` — `TimelineBlock.tsx:363` on-color completion badge.
17. `P4-PENDING-017` — `DefaultLoadingComponent.tsx:299,334,398,442,480` authored loading accents.
18. `P4-PENDING-018` — `DynamicView.tsx:96` slate-header skeleton.
19. `P4-PENDING-019` — `IntroOutroListView.tsx:49,159,162,165,168` gradient-header accents.
20. `P4-PENDING-020` — `KeyPointsNestedListView.tsx:240` gradient progress track.
21. `P4-PENDING-021` — `KeyPointsView.tsx:46,144,148,149,150` gradient accents.
22. `P4-PENDING-022` — `LsiKeywordView.tsx:570` gradient-header skeleton.
23. `P4-PENDING-023` — `ModernKeywordAnalyzerView.tsx:184,198` gradient editor chrome.
24. `P4-PENDING-024` — `PageTemplate.tsx:106,280` colored-header tiles/badge.
25. `P4-PENDING-025` — `ImageUploadField.tsx:115` image-overlay remove control.
26. `P4-PENDING-026` — `MediaBody.tsx:73` document iframe matte.
27. `P4-PENDING-032` — `PageEditor.tsx:756` authored-page preview canvas.
28. `P4-PENDING-033` — `LiveCaptureButton.tsx:96,97` recording indicators.
29. `P4-PENDING-034` — `LearningGainReportView.tsx:80` print/PDF background.
30. `P4-PENDING-035` — `BboxPreview.tsx:43` transparent-image matte.
31. `P4-PENDING-036` — `UnifiedImageBlockRenderer.tsx:528,952` media toolbar.
32. `P4-PENDING-037` — `UnifiedVideoBlockRenderer.tsx:356,636` video toolbar.
33. `P4-PENDING-038` — `HtmlPreview.tsx:183` saved-HTML iframe matte.
34. `P4-PENDING-039` — `HtmlInlinePreview.tsx:317` rendered-page matte.
35. `P4-PENDING-040` — `HtmlPreviewModal.tsx:1190` light HTML preview matte.
36. `P4-PENDING-041` — `SavePageTab.tsx:444` publish-preview canvas.
37. `P4-PENDING-042` — `CropPreview.tsx:342,350` image crop marker.
38. `P4-PENDING-043` — `InitialCropPanel.tsx:742,749,756,763,772,779,786,793` image resize handles.
39. `P4-PENDING-044` — `SetupBridgeSection.tsx:1120` authored-page iframe matte.
40. `P4-PENDING-045` — `CaptureView.tsx:195,251,269` camera chrome.
41. `P4-PENDING-046` — `PodcastAudioPlayer.tsx:423,425,431,468,570,573` explicit dark player variant.
42. `P4-PENDING-047` — `PodcastEpisodePage.tsx:54` video-hero action.
43. `P4-PENDING-048` — `PodcastShowPage.tsx:136` cover-art hero action.
44. `P4-PENDING-049` — `AssetCard.tsx:234` media-overlay cover action.
45. `P4-PENDING-050` — `ProductionTeaser.tsx:108,109` artwork carousel dots.
46. `P4-PENDING-051` — `HeaderAnalysis.tsx:118,126,134,142,319` colored-header tiles/badge.

Each item has exactly two safe routes: Arman approves the fixed-palette intent,
after which the typed exception ledger and exact source annotation may be
added; or Arman rejects it, after which the owning theme surface is repaired
with the skill's semantic token/explicit-variant recipe in a certified batch.

### Backlog retained

No new unresolved defect lacks evidence or a repair decision. The 36 remaining
detector candidates are retained as repeatedly scanned non-findings rather
than suppressed: explicit/multiline theme branches, overridden fallbacks,
comments, or non-rendered output. They remain visible on every full pass.

### Resolved before this run

`P4-PENDING-027` (`WebpageBody.tsx:49`) no longer exists. Commit
`acbeea1b5ccedf8996a224604b2476105452867a` replaced the fixed-white live-page
iframe with the canonical saved-snapshot renderer. No exception was approved.
The missing `PageTemplate.tsx:280` on-color badge was added to
`P4-PENDING-024`, keeping the active raw-token line total at 100 while reducing
the active proposal file count from 47 to 46.

## Certification and post-run verification

No product-code Tier-M batch was created, so no adversarial certifier or
browser matrix was required. This is not a report-only downgrade: the patrol
completed its detector, triage, routing, ledger, and reporting duties and found
no auto-approved repair. Product certifier verdict: **NOT APPLICABLE — no
mutation batch**.

Post-report verification must match the immutable baseline:

- `pnpm type-check`: PASS.
- Detector regression suite: 4/4 PASS.
- Full detector: 6,635 files; 668 matching lines; 136 review candidates; 0
  approved and 0 invalid exceptions.
- Scoped detector: 195 files; 11 matching lines; 4 review candidates, all
  routed above.
- `pnpm check:doctrine`: PASS.
- `pnpm check:ui-primitives`: PASS with the same 19 pre-existing warnings.
- `pnpm check:migrations`: completed with the same three unrelated drift
  records listed in the baseline; no P4 migration exists.

## Cadence health and candidates

The preceding month is not all clean: P4 produced defect repairs and continuing
human-owned proposals on August 11–12. No longer cadence is proposed. No
concrete batch-caused rejection pattern exists, so mutation is not paused. No
new recurring unregistered class was found, so there is no Candidate-bench
nomination from this run.

## EXCEPTION APPROVAL REQUIRED

Arman must approve or reject every active item `P4-PENDING-001` through
`P4-PENDING-051`, excluding resolved items `027`–`031` and `052`, using the
complete production review instructions in
`.matrx/patrol-reports/light-dark-integrity-exception-review.md`.

ARMAN, WE NEED YOU: approve or reject every listed P4 exception.
