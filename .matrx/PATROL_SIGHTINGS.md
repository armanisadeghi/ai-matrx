# Patrol Sightings — matrx-frontend

One line per spotted violation of a REGISTERED patrol (see
`/Users/armanisadeghi/code/common-docs/systems/pattern-patrols/PATROL_REGISTRY.md`;
protocol in the `pattern-patrol` skill). Agents on other missions log here and
move on; patrol runs verify each line themselves and check it off with a
one-word outcome. Sightings are hints, not facts.

Format: `- [ ] <P#> | <file-or-route> | <one line> | <date>`

## Open

- [ ] P7 | (2 files, grep `window.confirm\|window.alert\|window.prompt` in features/components/app) | last 2 browser-dialog files in the repo — finish the eradication | 2026-08-08
- [ ] P3 | 6 files via grep `h-screen\|100vh` | banned viewport units still present | 2026-08-08
- [ ] P3 | 9 files: `fixed bottom-0` without `pb-safe` | fixed bottom bars missing safe-area padding | 2026-08-08
- [ ] P4 | 282 total `bg-white`/`text-black` files still need per-line triage (the no-`dark:` batch below is cleared) | 2026-08-08

## Cleared

- [x] P4 | 44-file no-`dark:` batch (re-grep found 63) | FIXED 31 files → semantic tokens (bottom-sheet white-alphas → `bg-glass`/`active:bg-glass-active`/`border-glass-edge`; light cards → `bg-card`/`border-border`; switch knobs → `bg-background`; ImageBlock share modal). SKIPPED (legitimate, verified per-line): media-overlay chrome (`bg-white/N` over artwork/photos/video — podcast players/galleries/StageCanvas/ProductionTeaser/AssetCard, ImageBlock+Unified image/video viewer controls, IosWidget, ModernGlass, FlashcardMobileView immersive deck, CropPreview/InitialCropPanel handles, LiveCaptureButton/CaptureView camera chrome, tool-viz pill on primary); iframe backgrounds for rendered HTML (HtmlPreview, HtmlInlinePreview, QuickHtmlShareModal, MediaBody, WebpageBody, SetupBridgeSection); BboxPreview white matte; single-theme designs (CominSoonTemplate dark hero, tic-tac-toe board, MatxLoader branded, canvas-reveal-effect vendored); Tooltip.tsx `text-black` on `bg-warning`/`bg-success` kept for contrast (defined `--warning-foreground` is near-white — would fail on amber); LinkComponentWithFetch commented code only | 2026-08-09
