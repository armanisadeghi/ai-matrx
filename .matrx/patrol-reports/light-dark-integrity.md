# P4 Light/Dark Integrity Patrol

- **Run date:** 2026-08-11 (America/Los_Angeles)
- **Run kind:** first run; required full-repository pass
- **Tier:** R (report-only)
- **Readiness guard:** active — the P4 registry row still says `Skill 🔶`; no code mutation is permitted until it says `Skill ✅` with an exact patrol recipe
- **Baseline revision:** `2f0b035c948a30e194f5b9695c67c02a4fa89224`
- **Working tree:** 21 unrelated pre-existing changes were present; the scan included them, and this patrol changed only this report and the P4 ledger entries

## Scope scanned

The registry requires new/changed `.tsx` files since the previous baseline, the P4 ledger, and a full pass every fourth run. No prior report existed, so this run performed the first/full pass across every `.tsx` file in the working tree.

Detection commands:

```bash
rg -l --glob '*.tsx' '(bg-white|text-black)' .
rg -l --glob '*.tsx' 'dark:' .
rg -n --glob '*.tsx' '(bg-white|text-black)' .
```

Baseline totals:

- 312 `.tsx` files contain `bg-white` or `text-black`.
- 754 source lines match at least one of those tokens.
- 33 matching files contain no `dark:` token anywhere in the file.
- 139 matching lines across 72 files contain no same-line `dark:` token and received context review.
- 615 matching lines contain a same-line `dark:` token; these passed the registered paired detector for this report-only run.

The next run should use the baseline revision above to identify new/changed `.tsx` files, always include the open P4 ledger entries, and rerun a full pass on run 4. Re-scanning later commits that incorporate the current dirty worktree is acceptable and safer than treating unrelated uncommitted work as a durable baseline.

## Findings

**1 finding, 0 fixed.**

1. **High — shared hover state disappears in light mode**
   - `components/errors/ErrorBoundaryView.tsx:121`
   - `CopyButton` uses `hover:bg-white/10`. The same primitive renders over the dark stack-trace block and neutral light surfaces such as the JSON-dump row and error-id row. The white overlay is meaningful on the dark block but effectively invisible on the light surfaces.
   - This needs a context-aware, semantic-token treatment defined by the completed P4 skill; guessing a global substitution could damage the dark code-block state.

## Triage and false positives

The remaining 138 no-same-line-`dark:` matches were verified and excluded from the finding count:

- **Explicit theme/style selection or multiline pairing:** `OpenStreetMapComponent`, `SearchReplaceDiffRenderer`, `AgentPicker`, feedback active-state counts, and conditional podcast-player classes select or pair the other theme outside the matching source line.
- **Print, HTML, canvas, and export surfaces:** print-only white backgrounds; iframe/page-preview mattes in CMS, HTML pages, agent context bodies, and setup previews; bounding-box and crop canvases.
- **Intentionally white media/on-color chrome:** podcast asset galleries and players, image/video viewers, capture controls, image-upload controls, colored-button badges, stepper dots, draggable-card glare, and translucent controls over gradients/artwork.
- **Fixed visual specimens or immersive designs:** Coming Soon hero, tic-tac-toe, branded loader, flashcards, canvas reveal, animated component specimens, and the Tailwind button specimen catalogue.
- **Non-rendered/irrelevant text:** the commented `LinkComponentWithFetch` class and parent `text-black` classes whose visible child text already supplies its own light/dark colors.
- **Known contrast exception:** `Tooltip.tsx` retains black text on warning/success surfaces because the defined semantic foreground is too light for those backgrounds.

The 33 file-level no-`dark:` baseline remains entirely within those verified exclusions plus the newly added dark-only `RoomHeader` surface:

```text
app/(core)/podcast/studio/run-a/_components/AssetGallery.tsx
app/(core)/podcast/studio/run-f/_components/AssetGallery.tsx
app/(core)/podcast/studio/run-reimagine/[id]/_components/StageCanvas.tsx
app/(dev)/demos/tool-viz/in-action/page.dev.tsx
app/(public)/free/games/tic-tac-toe/page.tsx
components/coming-soon/CominSoonTemplate.tsx
components/loaders/MatxLoader.tsx
components/mardown-display/blocks/flashcards/FlashcardMobileView.tsx
components/mardown-display/blocks/images/ImageBlock.tsx
components/mardown-display/blocks/links/LinkComponentWithFetch.tsx
components/matrx/Tooltip.tsx
components/official/card-and-grid/IosWidget.tsx
components/ui/canvas-reveal-effect-impl.tsx
features/agent-apps/components/QuickHtmlShareModal.tsx
features/agents/components/context-items/bodies/MediaBody.tsx
features/agents/components/context-items/bodies/WebpageBody.tsx
features/applet/home/app-display/ModernGlass.tsx
features/education/notes/LiveCaptureButton.tsx
features/file-analysis/components/BboxPreview.tsx
features/files/blocks/image/UnifiedImageBlockRenderer.tsx
features/files/blocks/video/UnifiedVideoBlockRenderer.tsx
features/files/components/core/FilePreview/previewers/HtmlPreview.tsx
features/html-pages/components/HtmlInlinePreview.tsx
features/image-studio/components/CropPreview.tsx
features/image-studio/components/InitialCropPanel.tsx
features/marketing/content-plan/setup/components/SetupBridgeSection.tsx
features/pdf/scanner/components/CaptureView.tsx
features/podcasts/components/player/PodcastAudioPlayer.tsx
features/podcasts/components/player/PodcastEpisodePage.tsx
features/podcasts/components/player/PodcastShowPage.tsx
features/podcasts/generator/components/AssetCard.tsx
features/podcasts/generator/components/ProductionTeaser.tsx
features/war-room/components/room/RoomHeader.tsx
```

## Fixes and certification

- **Fixed:** 0 files.
- **Certification:** not applicable — Tier R report-only run; no Tier M batch exists.
- **Rejected batches:** none.
- **Paused:** mutation remains readiness-blocked by the registry's partial P4 skill status; the patrol itself is not paused.

## Validation

- `pnpm type-check` — **failed with 78 pre-existing errors** from the unrelated dirty worktree, principally stale/missing generated database RPC/view types, one marketing AI-visibility boundary error, and the existing missing `vitest` module types in `packages/matrx-agents`.
- The patrol did not modify product code or generated files, and the P4 hard rules prohibit repairing those unrelated/generated failures in this Tier R run.

## Cadence health

No current or historical P4 report exists in the preceding month, so there is not enough run history to propose a longer cadence. No repeated certification rejections exist.

## Candidates noticed

None. The sole actionable issue is already covered by P4; no evidence-backed unregistered recurring class emerged.
