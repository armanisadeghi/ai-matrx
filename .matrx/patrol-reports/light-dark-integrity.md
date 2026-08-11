# P4 Light/Dark Integrity Patrol

- **Run date:** 2026-08-11 (America/Los_Angeles)
- **Run kind:** first/full pass plus readiness completion and Tier-M tail batch
- **Tier:** M for one exact shared-surface repair
- **Baseline revision entering run:** `2f0b035c948a30e194f5b9695c67c02a4fa89224`
- **Outcome:** 1 finding, 1 fixed, 0 open

## Scope scanned

No prior P4 report existed, so the run scanned every `.tsx` file, verified the
P4 ledger, and established the first full baseline. The completed patrol skill
now provides the approved decision tree and detector:

```bash
node .claude/skills/light-dark-integrity/scripts/detect-light-dark.mjs --json
```

- 6,938 `.tsx` files scanned.
- 312 files / 754 lines contain `bg-white` or `text-black`.
- 615 matching lines contain a same-line `dark:` token.
- 139 matching lines require contextual review. The entering baseline contained
  one defect and 138 exclusions. After repair, the same line remains visible as
  an intentional explicit dark-surface variant, so all 139 current candidates
  are now verified pairings/variants or registered exception classes.

The next run compares structural novelty against this report, always includes
new P4 ledger entries, and performs the next full pass on run 4.

## Finding and fix

**Fixed — `components/errors/ErrorBoundaryView.tsx` shared CopyButton.** The
button rendered on both neutral theme surfaces and a permanently dark stack
trace, but all call sites inherited `hover:bg-white/10`. That hover disappeared
on neutral light surfaces, while a blind semantic substitution would have
damaged the fixed dark surface.

The shared primitive now defaults to semantic theme chrome
(`hover:bg-accent`, `text-muted-foreground`, `hover:text-foreground`). Its
stack-trace call site explicitly selects the established dark-surface variant
(`text-zinc-400`, `hover:text-white`, `hover:bg-white/10`). Clipboard behavior,
layout, imports, responsive classes, and chunking are unchanged.

## Triage and false positives

The other 138 contextual candidates were excluded only after component and
call-site review. The repaired line remains a visible 139th candidate because
the detector never suppresses explicit surface variants:

- print/export output;
- HTML/iframe/page-preview mattes;
- media, camera, crop, canvas, image, video, and gradient overlays;
- fixed visual specimens, games, loaders, and immersive authored designs;
- explicit theme props/conditionals and multiline pairs;
- comments, fixtures, samples, and non-rendered strings;
- deliberately verified contrast exceptions.

The detector intentionally does not suppress these. It emits possible hints
and requires review every time. The 33 file-level no-`dark:` baseline is:

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

## Certification and validation

- **Adversarial certifier:** CERTIFIED.
- The certifier reran focused ESLint, detector syntax/full scan, doctrine,
  tsconfig hygiene, skill validation, and diff checks.
- The generic error boundary has no deterministic demo route and the approved
  browser harness was unavailable. The certifier used the strongest
  non-mutating alternative: verified all call sites, token definitions,
  identical viewport geometry, and unchanged clipboard behavior.
- `pnpm check:ui-primitives` completed with 18 pre-existing warnings, none in
  this batch.
- `pnpm type-check` remains red with 78 pre-existing broker, marketing,
  generated-schema, and missing-`vitest` errors; none involves the P4 batch.
- `pnpm check:doctrine`, `pnpm check:migrations`, focused ESLint, detector
  syntax/full scan, skill validation, and both repositories' diff checks pass.

## Cadence health and candidates

There is only one P4 run in the preceding month, so no longer cadence is
proposed. No repeated rejected batches exist. No unregistered product-pattern
candidate emerged. The separate automation-failure visibility gap discovered
during this run is now covered by the systemwide Loud Degradation Contract and
the daily `Pattern Patrol Fleet Health` backstop.
