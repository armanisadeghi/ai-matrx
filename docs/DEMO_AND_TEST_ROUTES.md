# Demo, test, and component playground routes

This inventory lists **App Router** `page.tsx` entry points that exist primarily for **demos**, **QA experiments**, **component playgrounds**, or **internal harnesses** — not end-user product flows.

**Total routes:** 359 (generated from filesystem rules; adjust `docs/DEMO_AND_TEST_ROUTES.md` if a route is miscategorized.)

URL paths omit route-group segments `(name)` (e.g. `(authenticated)`, `(admin-auth)`).

---

## By area

### Public — `/demos` and related

*35 routes*

- `/demos` — `app/(public)/demos/page.tsx`
- `/demos/api-tests` — `app/(public)/demos/api-tests/page.tsx`
- `/demos/api-tests/agent` — `app/(public)/demos/api-tests/agent/page.tsx`
- `/demos/api-tests/block-processing` — `app/(public)/demos/api-tests/block-processing/page.tsx`
- `/demos/api-tests/chat` — `app/(public)/demos/api-tests/chat/page.tsx`
- `/demos/api-tests/health` — `app/(public)/demos/api-tests/health/page.tsx`
- `/demos/api-tests/matrx-ai` — `app/(public)/demos/api-tests/matrx-ai/page.tsx`
- `/demos/api-tests/matrx-ai/agent-demo` — `app/(public)/demos/api-tests/matrx-ai/agent-demo/page.tsx`
- `/demos/api-tests/matrx-ai/conversation-demo` — `app/(public)/demos/api-tests/matrx-ai/conversation-demo/page.tsx`
- `/demos/api-tests/matrx-ai/dynamic-api` — `app/(public)/demos/api-tests/matrx-ai/dynamic-api/page.tsx`
- `/demos/api-tests/matrx-ai/tools-demo` — `app/(public)/demos/api-tests/matrx-ai/tools-demo/page.tsx`
- `/demos/api-tests/pdf-extract` — `app/(public)/demos/api-tests/pdf-extract/page.tsx`
- `/demos/api-tests/setup` — `app/(public)/demos/api-tests/setup/page.tsx`
- `/demos/api-tests/tool-testing` — `app/(public)/demos/api-tests/tool-testing/page.tsx`
- `/demos/api-tests/unified-chat` — `app/(public)/demos/api-tests/unified-chat/page.tsx`
- `/demos/color-test` — `app/(public)/demos/color-test/page.tsx`
- `/demos/feature-tests` — `app/(public)/demos/feature-tests/page.tsx`
- `/demos/feature-tests/microphone-icon-button` — `app/(public)/demos/feature-tests/microphone-icon-button/page.tsx`
- `/demos/feature-tests/speaker-button` — `app/(public)/demos/feature-tests/speaker-button/page.tsx`
- `/demos/local-tools` — `app/(public)/demos/local-tools/page.tsx`
- `/demos/local-tools/cloud-sync` — `app/(public)/demos/local-tools/cloud-sync/page.tsx`
- `/demos/local-tools/documents` — `app/(public)/demos/local-tools/documents/page.tsx`
- `/demos/local-tools/engine` — `app/(public)/demos/local-tools/engine/page.tsx`
- `/demos/local-tools/files` — `app/(public)/demos/local-tools/files/page.tsx`
- `/demos/local-tools/powershell` — `app/(public)/demos/local-tools/powershell/page.tsx`
- `/demos/local-tools/scraper` — `app/(public)/demos/local-tools/scraper/page.tsx`
- `/demos/local-tools/shell` — `app/(public)/demos/local-tools/shell/page.tsx`
- `/demos/local-tools/system` — `app/(public)/demos/local-tools/system/page.tsx`
- `/demos/local-tools/terminal` — `app/(public)/demos/local-tools/terminal/page.tsx`
- `/demos/overlay-instances` — `app/(public)/demos/overlay-instances/page.tsx`
- `/demos/scraper` — `app/(public)/demos/scraper/page.tsx`
- `/demos/scraper/quick-scrape` — `app/(public)/demos/scraper/quick-scrape/page.tsx`
- `/demos/scraper/search` — `app/(public)/demos/scraper/search/page.tsx`
- `/demos/scraper/search-and-scrape` — `app/(public)/demos/scraper/search-and-scrape/page.tsx`
- `/demos/scraper/test-new` — `app/(public)/demos/scraper/test-new/page.tsx`

### Public — `/p/demo`

*1 route*

- `/p/demo/[slug]` — `app/(public)/p/demo/[slug]/page.tsx`

### Public — `/p/fast-test`

*1 route*

- `/p/fast-test/[slug]` — `app/(public)/p/fast-test/[slug]/page.tsx`

### Public — misc demo pages

*1 route*

- `/google-auth-demo` — `app/(public)/google-auth-demo/page.tsx`

### SSR — `/ssr/demos`

*66 routes*

- `/ssr/demos` — `app/(ssr)/ssr/demos/page.tsx`
- `/ssr/demos/agent-selector-demo` — `app/(ssr)/ssr/demos/agent-selector-demo/page.tsx`
- `/ssr/demos/button-demo` — `app/(ssr)/ssr/demos/button-demo/page.tsx`
- `/ssr/demos/ca-pd-calculator` — `app/(ssr)/ssr/demos/ca-pd-calculator/page.tsx`
- `/ssr/demos/cloud-files-debug` — `app/(ssr)/ssr/demos/cloud-files-debug/page.tsx`
- `/ssr/demos/container-drop` — `app/(ssr)/ssr/demos/container-drop/page.tsx`
- `/ssr/demos/context-menu` — `app/(ssr)/ssr/demos/context-menu/page.tsx`
- `/ssr/demos/context-menu/lab` — `app/(ssr)/ssr/demos/context-menu/lab/page.tsx`
- `/ssr/demos/context-menu/scenarios` — `app/(ssr)/ssr/demos/context-menu/scenarios/page.tsx`
- `/ssr/demos/date-pickers` — `app/(ssr)/ssr/demos/date-pickers/page.tsx`
- `/ssr/demos/glass-lab` — `app/(ssr)/ssr/demos/glass-lab/page.tsx`
- `/ssr/demos/header-demo` — `app/(ssr)/ssr/demos/header-demo/page.tsx`
- `/ssr/demos/icon-finder-demo` — `app/(ssr)/ssr/demos/icon-finder-demo/page.tsx`
- `/ssr/demos/model-activity-indicators` — `app/(ssr)/ssr/demos/model-activity-indicators/page.tsx`
- `/ssr/demos/pdf-processing` — `app/(ssr)/ssr/demos/pdf-processing/page.tsx`
- `/ssr/demos/pdf-processing/classify-pages` — `app/(ssr)/ssr/demos/pdf-processing/classify-pages/page.tsx`
- `/ssr/demos/pdf-processing/compress` — `app/(ssr)/ssr/demos/pdf-processing/compress/page.tsx`
- `/ssr/demos/pdf-processing/crop-pages` — `app/(ssr)/ssr/demos/pdf-processing/crop-pages/page.tsx`
- `/ssr/demos/pdf-processing/delete-pages` — `app/(ssr)/ssr/demos/pdf-processing/delete-pages/page.tsx`
- `/ssr/demos/pdf-processing/detect-repeated-regions` — `app/(ssr)/ssr/demos/pdf-processing/detect-repeated-regions/page.tsx`
- `/ssr/demos/pdf-processing/duplicate-pages` — `app/(ssr)/ssr/demos/pdf-processing/duplicate-pages/page.tsx`
- `/ssr/demos/pdf-processing/extract-pages` — `app/(ssr)/ssr/demos/pdf-processing/extract-pages/page.tsx`
- `/ssr/demos/pdf-processing/extract-reading-order` — `app/(ssr)/ssr/demos/pdf-processing/extract-reading-order/page.tsx`
- `/ssr/demos/pdf-processing/extract-tables` — `app/(ssr)/ssr/demos/pdf-processing/extract-tables/page.tsx`
- `/ssr/demos/pdf-processing/extract-text` — `app/(ssr)/ssr/demos/pdf-processing/extract-text/page.tsx`
- `/ssr/demos/pdf-processing/flatten-annotations` — `app/(ssr)/ssr/demos/pdf-processing/flatten-annotations/page.tsx`
- `/ssr/demos/pdf-processing/insert-pages` — `app/(ssr)/ssr/demos/pdf-processing/insert-pages/page.tsx`
- `/ssr/demos/pdf-processing/merge` — `app/(ssr)/ssr/demos/pdf-processing/merge/page.tsx`
- `/ssr/demos/pdf-processing/redact-pattern` — `app/(ssr)/ssr/demos/pdf-processing/redact-pattern/page.tsx`
- `/ssr/demos/pdf-processing/redact-regions` — `app/(ssr)/ssr/demos/pdf-processing/redact-regions/page.tsx`
- `/ssr/demos/pdf-processing/redact-repeated-regions` — `app/(ssr)/ssr/demos/pdf-processing/redact-repeated-regions/page.tsx`
- `/ssr/demos/pdf-processing/render-all` — `app/(ssr)/ssr/demos/pdf-processing/render-all/page.tsx`
- `/ssr/demos/pdf-processing/render-page` — `app/(ssr)/ssr/demos/pdf-processing/render-page/page.tsx`
- `/ssr/demos/pdf-processing/render-thumbnail` — `app/(ssr)/ssr/demos/pdf-processing/render-thumbnail/page.tsx`
- `/ssr/demos/pdf-processing/reorder-pages` — `app/(ssr)/ssr/demos/pdf-processing/reorder-pages/page.tsx`
- `/ssr/demos/pdf-processing/rotate-pages` — `app/(ssr)/ssr/demos/pdf-processing/rotate-pages/page.tsx`
- `/ssr/demos/pdf-processing/scrub` — `app/(ssr)/ssr/demos/pdf-processing/scrub/page.tsx`
- `/ssr/demos/pdf-processing/split` — `app/(ssr)/ssr/demos/pdf-processing/split/page.tsx`
- `/ssr/demos/pdf-processing/strip-metadata` — `app/(ssr)/ssr/demos/pdf-processing/strip-metadata/page.tsx`
- `/ssr/demos/pdf-processing/strip-repeated-regions` — `app/(ssr)/ssr/demos/pdf-processing/strip-repeated-regions/page.tsx`
- `/ssr/demos/pdf-processing/studio` — `app/(ssr)/ssr/demos/pdf-processing/studio/page.tsx`
- `/ssr/demos/popup-demo` — `app/(ssr)/ssr/demos/popup-demo/page.tsx`
- `/ssr/demos/resizables` — `app/(ssr)/ssr/demos/resizables/page.tsx`
- `/ssr/demos/resizables/00-baseline` — `app/(ssr)/ssr/demos/resizables/00-baseline/page.tsx`
- `/ssr/demos/resizables/01-cookie-ssr` — `app/(ssr)/ssr/demos/resizables/01-cookie-ssr/page.tsx`
- `/ssr/demos/resizables/02-workbench` — `app/(ssr)/ssr/demos/resizables/02-workbench/page.tsx`
- `/ssr/demos/resizables/03-vscode-shell` — `app/(ssr)/ssr/demos/resizables/03-vscode-shell/page.tsx`
- `/ssr/demos/resizables/04-mac-mail` — `app/(ssr)/ssr/demos/resizables/04-mac-mail/page.tsx`
- `/ssr/demos/resizables/05-conditional-panels` — `app/(ssr)/ssr/demos/resizables/05-conditional-panels/page.tsx`
- `/ssr/demos/run-settings` — `app/(ssr)/ssr/demos/run-settings/page.tsx`
- `/ssr/demos/run-settings/advanced-run-settings-demo` — `app/(ssr)/ssr/demos/run-settings/advanced-run-settings-demo/page.tsx`
- `/ssr/demos/run-settings/run-settings-demo` — `app/(ssr)/ssr/demos/run-settings/run-settings-demo/page.tsx`
- `/ssr/demos/screen-capture` — `app/(ssr)/ssr/demos/screen-capture/page.tsx`
- `/ssr/demos/selection-demo` — `app/(ssr)/ssr/demos/selection-demo/page.tsx`
- `/ssr/demos/smart-code-editor` — `app/(ssr)/ssr/demos/smart-code-editor/page.tsx`
- `/ssr/demos/speaker-demo` — `app/(ssr)/ssr/demos/speaker-demo/page.tsx`
- `/ssr/demos/sync-demo/preferences` — `app/(ssr)/ssr/demos/sync-demo/preferences/page.tsx`
- `/ssr/demos/sync-demo/theme` — `app/(ssr)/ssr/demos/sync-demo/theme/page.tsx`
- `/ssr/demos/tasks-widgets` — `app/(ssr)/ssr/demos/tasks-widgets/page.tsx`
- `/ssr/demos/textarea-tiers` — `app/(ssr)/ssr/demos/textarea-tiers/page.tsx`
- `/ssr/demos/upgrade` — `app/(ssr)/ssr/demos/upgrade/page.tsx`
- `/ssr/demos/upgrade/industry/[id]` — `app/(ssr)/ssr/demos/upgrade/industry/[id]/page.tsx`
- `/ssr/demos/upgrade/landing` — `app/(ssr)/ssr/demos/upgrade/landing/page.tsx`
- `/ssr/demos/whatsapp-demo` — `app/(ssr)/ssr/demos/whatsapp-demo/page.tsx`
- `/ssr/demos/whatsapp-window-demo` — `app/(ssr)/ssr/demos/whatsapp-window-demo/page.tsx`
- `/ssr/demos/window-demo` — `app/(ssr)/ssr/demos/window-demo/page.tsx`

### Authenticated — `/demo`

*23 routes*

- `/demo` — `app/(authenticated)/demo/page.tsx`
- `/demo/code-generator` — `app/(authenticated)/demo/code-generator/page.tsx`
- `/demo/code-generator/react-live` — `app/(authenticated)/demo/code-generator/react-live/page.tsx`
- `/demo/code-generator/react-live-parts` — `app/(authenticated)/demo/code-generator/react-live-parts/page.tsx`
- `/demo/fetch-react` — `app/(authenticated)/demo/fetch-react/page.tsx`
- `/demo/monaco-test` — `app/(authenticated)/demo/monaco-test/page.tsx`
- `/demo/resizable-demo` — `app/(authenticated)/demo/resizable-demo/page.tsx`
- `/demo/resizable-demo/nested-split` — `app/(authenticated)/demo/resizable-demo/nested-split/page.tsx`
- `/demo/resizable-demo/nested-with-header-footer` — `app/(authenticated)/demo/resizable-demo/nested-with-header-footer/page.tsx`
- `/demo/resizable-demo/resizable-builder` — `app/(authenticated)/demo/resizable-demo/resizable-builder/page.tsx`
- `/demo/resizable-demo/vertical-split` — `app/(authenticated)/demo/resizable-demo/vertical-split/page.tsx`
- `/demo/services` — `app/(authenticated)/demo/services/page.tsx`
- `/demo/services/callback-manager` — `app/(authenticated)/demo/services/callback-manager/page.tsx`
- `/demo/services/ref-manager` — `app/(authenticated)/demo/services/ref-manager/page.tsx`
- `/demo/voice` — `app/(authenticated)/demo/voice/page.tsx`
- `/demo/voice/debate-assistant` — `app/(authenticated)/demo/voice/debate-assistant/page.tsx`
- `/demo/voice/server-token` — `app/(authenticated)/demo/voice/server-token/page.tsx`
- `/demo/voice/tts-with-controls` — `app/(authenticated)/demo/voice/tts-with-controls/page.tsx`
- `/demo/voice/voice-assistant` — `app/(authenticated)/demo/voice/voice-assistant/page.tsx`
- `/demo/voice/voice-assistant-cdn` — `app/(authenticated)/demo/voice/voice-assistant-cdn/page.tsx`
- `/demo/voice/voice-assistant-two` — `app/(authenticated)/demo/voice/voice-assistant-two/page.tsx`
- `/demo/voice/voice-manager` — `app/(authenticated)/demo/voice/voice-manager/page.tsx`
- `/demo/voice/wake-word-debug` — `app/(authenticated)/demo/voice/wake-word-debug/page.tsx`

### Authenticated — `/tests`

*74 routes*

- `/tests` — `app/(authenticated)/tests/page.tsx`
- `/tests/_maps` — `app/(authenticated)/tests/_maps/page.tsx`
- `/tests/animation-tests` — `app/(authenticated)/tests/animation-tests/page.tsx`
- `/tests/animation-tests/animated-menu` — `app/(authenticated)/tests/animation-tests/animated-menu/page.tsx`
- `/tests/animation-tests/animated-menu/with-css` — `app/(authenticated)/tests/animation-tests/animated-menu/with-css/page.tsx`
- `/tests/animation-tests/animation-show` — `app/(authenticated)/tests/animation-tests/animation-show/page.tsx`
- `/tests/animation-tests/scale` — `app/(authenticated)/tests/animation-tests/scale/page.tsx`
- `/tests/app-shell-test` — `app/(authenticated)/tests/app-shell-test/page.tsx`
- `/tests/app-shell-test/layout-choices` — `app/(authenticated)/tests/app-shell-test/layout-choices/page.tsx`
- `/tests/app-shell-test/single-option` — `app/(authenticated)/tests/app-shell-test/single-option/page.tsx`
- `/tests/app-shell-test/single-option/layout-choices` — `app/(authenticated)/tests/app-shell-test/single-option/layout-choices/page.tsx`
- `/tests/app-shell-test/single-option/sample-nested` — `app/(authenticated)/tests/app-shell-test/single-option/sample-nested/page.tsx`
- `/tests/app-shell-test/single-option/sample-nested/sample-nested-again` — `app/(authenticated)/tests/app-shell-test/single-option/sample-nested/sample-nested-again/page.tsx`
- `/tests/applet-tests` — `app/(authenticated)/tests/applet-tests/page.tsx`
- `/tests/applet-tests/applet-builder-3` — `app/(authenticated)/tests/applet-tests/applet-builder-3/page.tsx`
- `/tests/applet-tests/resume-builder-test` — `app/(authenticated)/tests/applet-tests/resume-builder-test/page.tsx`
- `/tests/audio-recorder-test` — `app/(authenticated)/tests/audio-recorder-test/page.tsx`
- `/tests/audio-recorder-test/combined-page` — `app/(authenticated)/tests/audio-recorder-test/combined-page/page.tsx`
- `/tests/audio-recorder-test/initial` — `app/(authenticated)/tests/audio-recorder-test/initial/page.tsx`
- `/tests/audio-recorder-test/recording-management` — `app/(authenticated)/tests/audio-recorder-test/recording-management/page.tsx`
- `/tests/camera-test` — `app/(authenticated)/tests/camera-test/page.tsx`
- `/tests/chat-tests` — `app/(authenticated)/tests/chat-tests/page.tsx`
- `/tests/chat-tests/chat-assistant` — `app/(authenticated)/tests/chat-tests/chat-assistant/page.tsx`
- `/tests/chat-tests/conversation-search-ui` — `app/(authenticated)/tests/chat-tests/conversation-search-ui/page.tsx`
- `/tests/direct-chat-test` — `app/(authenticated)/tests/direct-chat-test/page.tsx`
- `/tests/dynamic-gateway-concept` — `app/(authenticated)/tests/dynamic-gateway-concept/page.tsx`
- `/tests/dynamic-gateway-concept/gateway-hook-test` — `app/(authenticated)/tests/dynamic-gateway-concept/gateway-hook-test/page.tsx`
- `/tests/extension-bridge` — `app/(authenticated)/tests/extension-bridge/page.tsx`
- `/tests/field-tests` — `app/(authenticated)/tests/field-tests/page.tsx`
- `/tests/field-tests/direct-fields` — `app/(authenticated)/tests/field-tests/direct-fields/page.tsx`
- `/tests/field-tests/manual-simple-fields` — `app/(authenticated)/tests/field-tests/manual-simple-fields/page.tsx`
- `/tests/full-screen-demo` — `app/(authenticated)/tests/full-screen-demo/page.tsx`
- `/tests/google-apis` — `app/(authenticated)/tests/google-apis/page.tsx`
- `/tests/google-apis/pagespeed` — `app/(authenticated)/tests/google-apis/pagespeed/page.tsx`
- `/tests/google-apis/search-console` — `app/(authenticated)/tests/google-apis/search-console/page.tsx`
- `/tests/google-apis/simple` — `app/(authenticated)/tests/google-apis/simple/page.tsx`
- `/tests/integrations` — `app/(authenticated)/tests/integrations/page.tsx`
- `/tests/integrations/option-two` — `app/(authenticated)/tests/integrations/option-two/page.tsx`
- `/tests/integrations/simple` — `app/(authenticated)/tests/integrations/simple/page.tsx`
- `/tests/links` — `app/(authenticated)/tests/links/page.tsx`
- `/tests/markdown-tests` — `app/(authenticated)/tests/markdown-tests/page.tsx`
- `/tests/markdown-tests/markdown-split-screen` — `app/(authenticated)/tests/markdown-tests/markdown-split-screen/page.tsx`
- `/tests/markdown-tests/tui-tests` — `app/(authenticated)/tests/markdown-tests/tui-tests/page.tsx`
- `/tests/matrx-local` — `app/(authenticated)/tests/matrx-local/page.tsx`
- `/tests/matrx-table` — `app/(authenticated)/tests/matrx-table/page.tsx`
- `/tests/metadata-test` — `app/(authenticated)/tests/metadata-test/page.tsx`
- `/tests/modals` — `app/(authenticated)/tests/modals/page.tsx`
- `/tests/modals/modal-test` — `app/(authenticated)/tests/modals/modal-test/page.tsx`
- `/tests/modals/table-modal-test` — `app/(authenticated)/tests/modals/table-modal-test/page.tsx`
- `/tests/oauth` — `app/(authenticated)/tests/oauth/page.tsx`
- `/tests/oauth/app_callback/[provider]` — `app/(authenticated)/tests/oauth/app_callback/[provider]/page.tsx`
- `/tests/qr-labels` — `app/(authenticated)/tests/qr-labels/page.tsx`
- `/tests/qr-labels/pdf-generator` — `app/(authenticated)/tests/qr-labels/pdf-generator/page.tsx`
- `/tests/qr-labels/qr-label-generator` — `app/(authenticated)/tests/qr-labels/qr-label-generator/page.tsx`
- `/tests/slack` — `app/(authenticated)/tests/slack/page.tsx`
- `/tests/slack/login` — `app/(authenticated)/tests/slack/login/page.tsx`
- `/tests/slack/with-brokers` — `app/(authenticated)/tests/slack/with-brokers/page.tsx`
- `/tests/sms` — `app/(authenticated)/tests/sms/page.tsx`
- `/tests/tailwind-test` — `app/(authenticated)/tests/tailwind-test/page.tsx`
- `/tests/tailwind-test/animations` — `app/(authenticated)/tests/tailwind-test/animations/page.tsx`
- `/tests/tailwind-test/color-converter` — `app/(authenticated)/tests/tailwind-test/color-converter/page.tsx`
- `/tests/tailwind-test/color-converter/color-conversion-tester` — `app/(authenticated)/tests/tailwind-test/color-converter/color-conversion-tester/page.tsx`
- `/tests/tailwind-test/color-swatches` — `app/(authenticated)/tests/tailwind-test/color-swatches/page.tsx`
- `/tests/tailwind-test/demo-page` — `app/(authenticated)/tests/tailwind-test/demo-page/page.tsx`
- `/tests/tailwind-test/test-card-colors` — `app/(authenticated)/tests/tailwind-test/test-card-colors/page.tsx`
- `/tests/tailwind-test/test-tailwind-utilities` — `app/(authenticated)/tests/tailwind-test/test-tailwind-utilities/page.tsx`
- `/tests/utility-function-tests` — `app/(authenticated)/tests/utility-function-tests/page.tsx`
- `/tests/utility-function-tests/create-table-templates` — `app/(authenticated)/tests/utility-function-tests/create-table-templates/page.tsx`
- `/tests/utility-function-tests/documentation` — `app/(authenticated)/tests/utility-function-tests/documentation/page.tsx`
- `/tests/utility-function-tests/function-button-demo` — `app/(authenticated)/tests/utility-function-tests/function-button-demo/page.tsx`
- `/tests/utility-function-tests/function-registry-demo` — `app/(authenticated)/tests/utility-function-tests/function-registry-demo/page.tsx`
- `/tests/utility-function-tests/smart-executor-demo` — `app/(authenticated)/tests/utility-function-tests/smart-executor-demo/page.tsx`
- `/tests/windows` — `app/(authenticated)/tests/windows/page.tsx`
- `/tests/workflow-source-config` — `app/(authenticated)/tests/workflow-source-config/page.tsx`

### Authenticated — `/layout-tests`

*5 routes*

- `/layout-tests` — `app/(authenticated)/layout-tests/page.tsx`
- `/layout-tests/fixed-input` — `app/(authenticated)/layout-tests/fixed-input/page.tsx`
- `/layout-tests/no-scroll` — `app/(authenticated)/layout-tests/no-scroll/page.tsx`
- `/layout-tests/prompt-input` — `app/(authenticated)/layout-tests/prompt-input/page.tsx`
- `/layout-tests/resizable-test` — `app/(authenticated)/layout-tests/resizable-test/page.tsx`

### Authenticated — flash card experiments

*3 routes*

- `/flash-cards/audio/test-one` — `app/(authenticated)/flash-cards/audio/test-one/page.tsx`
- `/flash-cards/audio/test-two` — `app/(authenticated)/flash-cards/audio/test-two/page.tsx`
- `/flash-cards/modal-test` — `app/(authenticated)/flash-cards/modal-test/page.tsx`

### Authenticated — settings UI demos

*3 routes*

- `/settings-hooks-demo` — `app/(authenticated)/settings-hooks-demo/page.tsx`
- `/settings-shell-demo` — `app/(authenticated)/settings-shell-demo/page.tsx`
- `/settings-tree-demo` — `app/(authenticated)/settings-tree-demo/page.tsx`

### Authenticated — registered-results harness

*3 routes*

- `/registered-results` — `app/(authenticated)/registered-results/page.tsx`
- `/registered-results/events-viewer` — `app/(authenticated)/registered-results/events-viewer/page.tsx`
- `/registered-results/sitemap-viewer` — `app/(authenticated)/registered-results/sitemap-viewer/page.tsx`

### Authenticated — `apps/demo`

*1 route*

- `/apps/demo` — `app/(authenticated)/apps/demo/page.tsx`

### Authenticated — `apps/debug`

*3 routes*

- `/apps/debug/[slug]` — `app/(authenticated)/apps/debug/[slug]/page.tsx`
- `/apps/debug/admin/[slug]` — `app/(authenticated)/apps/debug/admin/[slug]/page.tsx`
- `/apps/debug/admin/[slug]/[appletSlug]` — `app/(authenticated)/apps/debug/admin/[slug]/[appletSlug]/page.tsx`

### Authenticated — app builder field demo

*1 route*

- `/apps/builder/modules/field-demo` — `app/(authenticated)/apps/builder/modules/field-demo/page.tsx`

### Workspace `(a)` — `/sandbox`

*2 routes*

- `/sandbox` — `app/(a)/sandbox/page.tsx`
- `/sandbox/[id]` — `app/(a)/sandbox/[id]/page.tsx`

### Legacy — `/legacy/demo`

*83 routes*

- `/legacy/demo/component-demo` — `app/(legacy)/legacy/demo/component-demo/page.tsx`
- `/legacy/demo/component-demo/accordion` — `app/(legacy)/legacy/demo/component-demo/accordion/page.tsx`
- `/legacy/demo/component-demo/ai-prog` — `app/(legacy)/legacy/demo/component-demo/ai-prog/page.tsx`
- `/legacy/demo/component-demo/ai-prog/ai-code-editor-v3` — `app/(legacy)/legacy/demo/component-demo/ai-prog/ai-code-editor-v3/page.tsx`
- `/legacy/demo/component-demo/ai-prog/basic` — `app/(legacy)/legacy/demo/component-demo/ai-prog/basic/page.tsx`
- `/legacy/demo/component-demo/ai-prog/code-block-tests` — `app/(legacy)/legacy/demo/component-demo/ai-prog/code-block-tests/page.tsx`
- `/legacy/demo/component-demo/ai-prog/direct` — `app/(legacy)/legacy/demo/component-demo/ai-prog/direct/page.tsx`
- `/legacy/demo/component-demo/ai-prog/streaming-diff` — `app/(legacy)/legacy/demo/component-demo/ai-prog/streaming-diff/page.tsx`
- `/legacy/demo/component-demo/button` — `app/(legacy)/legacy/demo/component-demo/button/page.tsx`
- `/legacy/demo/component-demo/button/loading-button-demo` — `app/(legacy)/legacy/demo/component-demo/button/loading-button-demo/page.tsx`
- `/legacy/demo/component-demo/button/loading-button-demo-2` — `app/(legacy)/legacy/demo/component-demo/button/loading-button-demo-2/page.tsx`
- `/legacy/demo/component-demo/calendar` — `app/(legacy)/legacy/demo/component-demo/calendar/page.tsx`
- `/legacy/demo/component-demo/checkbox-radio` — `app/(legacy)/legacy/demo/component-demo/checkbox-radio/page.tsx`
- `/legacy/demo/component-demo/chip-demo` — `app/(legacy)/legacy/demo/component-demo/chip-demo/page.tsx`
- `/legacy/demo/component-demo/color-tester` — `app/(legacy)/legacy/demo/component-demo/color-tester/page.tsx`
- `/legacy/demo/component-demo/config-builder` — `app/(legacy)/legacy/demo/component-demo/config-builder/page.tsx`
- `/legacy/demo/component-demo/container-queries` — `app/(legacy)/legacy/demo/component-demo/container-queries/page.tsx`
- `/legacy/demo/component-demo/draggables` — `app/(legacy)/legacy/demo/component-demo/draggables/page.tsx`
- `/legacy/demo/component-demo/draggables/container-drop-demo` — `app/(legacy)/legacy/demo/component-demo/draggables/container-drop-demo/page.tsx`
- `/legacy/demo/component-demo/draggables/draggable-interactive-cards` — `app/(legacy)/legacy/demo/component-demo/draggables/draggable-interactive-cards/page.tsx`
- `/legacy/demo/component-demo/draggables/draggable-photo-cards` — `app/(legacy)/legacy/demo/component-demo/draggables/draggable-photo-cards/page.tsx`
- `/legacy/demo/component-demo/draggables/enhanced-draggable-cards` — `app/(legacy)/legacy/demo/component-demo/draggables/enhanced-draggable-cards/page.tsx`
- `/legacy/demo/component-demo/draggables/transformable-cards-demo` — `app/(legacy)/legacy/demo/component-demo/draggables/transformable-cards-demo/page.tsx`
- `/legacy/demo/component-demo/entity-analyzer` — `app/(legacy)/legacy/demo/component-demo/entity-analyzer/page.tsx`
- `/legacy/demo/component-demo/entity-analyzer/mock-data` — `app/(legacy)/legacy/demo/component-demo/entity-analyzer/mock-data/page.tsx`
- `/legacy/demo/component-demo/entity-select-demo` — `app/(legacy)/legacy/demo/component-demo/entity-select-demo/page.tsx`
- `/legacy/demo/component-demo/entity-select-demo/selection-demo-two` — `app/(legacy)/legacy/demo/component-demo/entity-select-demo/selection-demo-two/page.tsx`
- `/legacy/demo/component-demo/floating-labels` — `app/(legacy)/legacy/demo/component-demo/floating-labels/page.tsx`
- `/legacy/demo/component-demo/floating-sheet` — `app/(legacy)/legacy/demo/component-demo/floating-sheet/page.tsx`
- `/legacy/demo/component-demo/floating-sheet/persistence` — `app/(legacy)/legacy/demo/component-demo/floating-sheet/persistence/page.tsx`
- `/legacy/demo/component-demo/floating-slider-demo` — `app/(legacy)/legacy/demo/component-demo/floating-slider-demo/page.tsx`
- `/legacy/demo/component-demo/json-again` — `app/(legacy)/legacy/demo/component-demo/json-again/page.tsx`
- `/legacy/demo/component-demo/json-again/function-declaration-editor` — `app/(legacy)/legacy/demo/component-demo/json-again/function-declaration-editor/page.tsx`
- `/legacy/demo/component-demo/json-components-demo` — `app/(legacy)/legacy/demo/component-demo/json-components-demo/page.tsx`
- `/legacy/demo/component-demo/json-viewer` — `app/(legacy)/legacy/demo/component-demo/json-viewer/page.tsx`
- `/legacy/demo/component-demo/json-viewer/json-editor-test` — `app/(legacy)/legacy/demo/component-demo/json-viewer/json-editor-test/page.tsx`
- `/legacy/demo/component-demo/json-viewer/test` — `app/(legacy)/legacy/demo/component-demo/json-viewer/test/page.tsx`
- `/legacy/demo/component-demo/light-switch-button` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/fancy-demo` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/fancy-demo/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/glass-showcase` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/glass-showcase/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/light-switch` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/light-switch/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/light-switch-demo-2` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/light-switch-demo-2/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/light-switch-demo-2/reusable` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/light-switch-demo-2/reusable/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/orbital-demo` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/orbital-demo/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/orbital-demo/reusable` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/orbital-demo/reusable/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/particles` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/particles/page.tsx`
- `/legacy/demo/component-demo/light-switch-button/select-showcase` — `app/(legacy)/legacy/demo/component-demo/light-switch-button/select-showcase/page.tsx`
- `/legacy/demo/component-demo/loading` — `app/(legacy)/legacy/demo/component-demo/loading/page.tsx`
- `/legacy/demo/component-demo/markdown-text-block-editor` — `app/(legacy)/legacy/demo/component-demo/markdown-text-block-editor/page.tsx`
- `/legacy/demo/component-demo/markdown-to-flow` — `app/(legacy)/legacy/demo/component-demo/markdown-to-flow/page.tsx`
- `/legacy/demo/component-demo/radio-group` — `app/(legacy)/legacy/demo/component-demo/radio-group/page.tsx`
- `/legacy/demo/component-demo/sample-component-upgrade` — `app/(legacy)/legacy/demo/component-demo/sample-component-upgrade/page.tsx`
- `/legacy/demo/component-demo/selects` — `app/(legacy)/legacy/demo/component-demo/selects/page.tsx`
- `/legacy/demo/component-demo/selects/floating-label-select` — `app/(legacy)/legacy/demo/component-demo/selects/floating-label-select/page.tsx`
- `/legacy/demo/component-demo/selects/next-ui-select` — `app/(legacy)/legacy/demo/component-demo/selects/next-ui-select/page.tsx`
- `/legacy/demo/component-demo/selects/searchable-entity-select` — `app/(legacy)/legacy/demo/component-demo/selects/searchable-entity-select/page.tsx`
- `/legacy/demo/component-demo/selects/searchable-entity-select/isolated-test` — `app/(legacy)/legacy/demo/component-demo/selects/searchable-entity-select/isolated-test/page.tsx`
- `/legacy/demo/component-demo/selects/selects-2` — `app/(legacy)/legacy/demo/component-demo/selects/selects-2/page.tsx`
- `/legacy/demo/component-demo/selects/selects-3` — `app/(legacy)/legacy/demo/component-demo/selects/selects-3/page.tsx`
- `/legacy/demo/component-demo/selects/selects-4` — `app/(legacy)/legacy/demo/component-demo/selects/selects-4/page.tsx`
- `/legacy/demo/component-demo/selects/selects-5` — `app/(legacy)/legacy/demo/component-demo/selects/selects-5/page.tsx`
- `/legacy/demo/component-demo/socket-form-builder` — `app/(legacy)/legacy/demo/component-demo/socket-form-builder/page.tsx`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui` — `app/(legacy)/legacy/demo/component-demo/socket-form-builder/scraper-ui/page.tsx`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-bookmark-viewer` — `app/(legacy)/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-bookmark-viewer/page.tsx`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-one` — `app/(legacy)/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-one/page.tsx`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-two` — `app/(legacy)/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-two/page.tsx`
- `/legacy/demo/component-demo/socket-form-builder/user-concept` — `app/(legacy)/legacy/demo/component-demo/socket-form-builder/user-concept/page.tsx`
- `/legacy/demo/component-demo/sortable-demo` — `app/(legacy)/legacy/demo/component-demo/sortable-demo/page.tsx`
- `/legacy/demo/component-demo/sortable-demo/dnd` — `app/(legacy)/legacy/demo/component-demo/sortable-demo/dnd/page.tsx`
- `/legacy/demo/component-demo/sortable-demo/drag-drop-1` — `app/(legacy)/legacy/demo/component-demo/sortable-demo/drag-drop-1/page.tsx`
- `/legacy/demo/component-demo/structured-section` — `app/(legacy)/legacy/demo/component-demo/structured-section/page.tsx`
- `/legacy/demo/component-demo/structured-section/themed-section-component` — `app/(legacy)/legacy/demo/component-demo/structured-section/themed-section-component/page.tsx`
- `/legacy/demo/component-demo/tags-text-array` — `app/(legacy)/legacy/demo/component-demo/tags-text-array/page.tsx`
- `/legacy/demo/component-demo/textarea/auto-grow-textarea` — `app/(legacy)/legacy/demo/component-demo/textarea/auto-grow-textarea/page.tsx`
- `/legacy/demo/component-demo/toast-demo` — `app/(legacy)/legacy/demo/component-demo/toast-demo/page.tsx`
- `/legacy/demo/component-demo/tool-selector` — `app/(legacy)/legacy/demo/component-demo/tool-selector/page.tsx`
- `/legacy/demo/component-demo/tooltip-demo` — `app/(legacy)/legacy/demo/component-demo/tooltip-demo/page.tsx`
- `/legacy/demo/many-to-many-ui` — `app/(legacy)/legacy/demo/many-to-many-ui/page.tsx`
- `/legacy/demo/many-to-many-ui/claude` — `app/(legacy)/legacy/demo/many-to-many-ui/claude/page.tsx`
- `/legacy/demo/many-to-many-ui/grok` — `app/(legacy)/legacy/demo/many-to-many-ui/grok/page.tsx`
- `/legacy/demo/many-to-many-ui/grok-dynamic` — `app/(legacy)/legacy/demo/many-to-many-ui/grok-dynamic/page.tsx`
- `/legacy/demo/many-to-many-ui/grok-modular` — `app/(legacy)/legacy/demo/many-to-many-ui/grok-modular/page.tsx`
- `/legacy/demo/many-to-many-ui/grok/quick-tester` — `app/(legacy)/legacy/demo/many-to-many-ui/grok/quick-tester/page.tsx`

### Legacy — `/legacy/tests`

*28 routes*

- `/legacy/tests/advanced-data-table` — `app/(legacy)/legacy/tests/advanced-data-table/page.tsx`
- `/legacy/tests/dynamic-entity-test` — `app/(legacy)/legacy/tests/dynamic-entity-test/page.tsx`
- `/legacy/tests/dynamic-entity-test/basic-table` — `app/(legacy)/legacy/tests/dynamic-entity-test/basic-table/page.tsx`
- `/legacy/tests/dynamic-layouts` — `app/(legacy)/legacy/tests/dynamic-layouts/page.tsx`
- `/legacy/tests/dynamic-layouts/basic-layout-options` — `app/(legacy)/legacy/tests/dynamic-layouts/basic-layout-options/page.tsx`
- `/legacy/tests/dynamic-layouts/grid-demo` — `app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/page.tsx`
- `/legacy/tests/dynamic-layouts/grid-demo/email-app-demo` — `app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-app-demo/page.tsx`
- `/legacy/tests/dynamic-layouts/grid-demo/email-with-grid-system` — `app/(legacy)/legacy/tests/dynamic-layouts/grid-demo/email-with-grid-system/page.tsx`
- `/legacy/tests/dynamic-layouts/grid-system-12` — `app/(legacy)/legacy/tests/dynamic-layouts/grid-system-12/page.tsx`
- `/legacy/tests/dynamic-layouts/grid-system-12/grid-display` — `app/(legacy)/legacy/tests/dynamic-layouts/grid-system-12/grid-display/page.tsx`
- `/legacy/tests/dynamic-layouts/interactive-demo` — `app/(legacy)/legacy/tests/dynamic-layouts/interactive-demo/page.tsx`
- `/legacy/tests/dynamic-layouts/interactive-light-dark` — `app/(legacy)/legacy/tests/dynamic-layouts/interactive-light-dark/page.tsx`
- `/legacy/tests/dynamic-layouts/random-layouts` — `app/(legacy)/legacy/tests/dynamic-layouts/random-layouts/page.tsx`
- `/legacy/tests/fetch-test` — `app/(legacy)/legacy/tests/fetch-test/page.tsx`
- `/legacy/tests/forms` — `app/(legacy)/legacy/tests/forms/page.tsx`
- `/legacy/tests/forms/entity-final-test` — `app/(legacy)/legacy/tests/forms/entity-final-test/page.tsx`
- `/legacy/tests/forms/entity-form-basic-container` — `app/(legacy)/legacy/tests/forms/entity-form-basic-container/page.tsx`
- `/legacy/tests/forms/entity-management` — `app/(legacy)/legacy/tests/forms/entity-management/page.tsx`
- `/legacy/tests/forms/entity-management-smart-fields` — `app/(legacy)/legacy/tests/forms/entity-management-smart-fields/page.tsx`
- `/legacy/tests/forms/entity-smart-armani-fields` — `app/(legacy)/legacy/tests/forms/entity-smart-armani-fields/page.tsx`
- `/legacy/tests/forms/single-entity` — `app/(legacy)/legacy/tests/forms/single-entity/page.tsx`
- `/legacy/tests/relationship-management` — `app/(legacy)/legacy/tests/relationship-management/page.tsx`
- `/legacy/tests/relationship-management/entity-json-builder` — `app/(legacy)/legacy/tests/relationship-management/entity-json-builder/page.tsx`
- `/legacy/tests/relationship-management/entity-json-builder/async-direct-create` — `app/(legacy)/legacy/tests/relationship-management/entity-json-builder/async-direct-create/page.tsx`
- `/legacy/tests/relationship-management/entity-json-builder/async-sequential-create` — `app/(legacy)/legacy/tests/relationship-management/entity-json-builder/async-sequential-create/page.tsx`
- `/legacy/tests/relationship-management/metadata-test` — `app/(legacy)/legacy/tests/relationship-management/metadata-test/page.tsx`
- `/legacy/tests/relationship-management/original-manual` — `app/(legacy)/legacy/tests/relationship-management/original-manual/page.tsx`
- `/legacy/tests/relationship-management/rel-with-fetch-test` — `app/(legacy)/legacy/tests/relationship-management/rel-with-fetch-test/page.tsx`

### Admin — official component library

*4 routes*

- `/administration/official-components` — `app/(authenticated)/(admin-auth)/administration/official-components/page.tsx`
- `/administration/official-components/[componentId]` — `app/(authenticated)/(admin-auth)/administration/official-components/[componentId]/page.tsx`
- `/administration/official-components/to-be-added/toggle-menu-demo` — `app/(authenticated)/(admin-auth)/administration/official-components/to-be-added/toggle-menu-demo/page.tsx`
- `/administration/official-components/to-be-added/toggle-menu-demo/toggle-with-categories` — `app/(authenticated)/(admin-auth)/administration/official-components/to-be-added/toggle-menu-demo/toggle-with-categories/page.tsx`

### Admin — template pages

*2 routes*

- `/admin/template-pages/app-template` — `app/(authenticated)/admin/template-pages/app-template/page.tsx`
- `/admin/template-pages/module-link-pack` — `app/(authenticated)/admin/template-pages/module-link-pack/page.tsx`

### Admin — concept illustrations

*1 route*

- `/admin/concepts/file-system` — `app/(authenticated)/admin/concepts/file-system/page.tsx`

### Admin — labs, smoketests, and testers

*7 routes*

- `/administration/experimental-routes` — `app/(authenticated)/(admin-auth)/administration/experimental-routes/page.tsx`
- `/administration/markdown-tester` — `app/(authenticated)/(admin-auth)/administration/markdown-tester/page.tsx`
- `/administration/persistence-test` — `app/(authenticated)/(admin-auth)/administration/persistence-test/page.tsx`
- `/administration/resilience-lab` — `app/(authenticated)/(admin-auth)/administration/resilience-lab/page.tsx`
- `/administration/sandbox` — `app/(authenticated)/(admin-auth)/administration/sandbox/page.tsx`
- `/administration/scheduling/cron-tester` — `app/(authenticated)/(admin-auth)/administration/scheduling/cron-tester/page.tsx`
- `/administration/window-panels-smoketest` — `app/(authenticated)/(admin-auth)/administration/window-panels-smoketest/page.tsx`

### Authenticated — `ai/prompts/experimental`

*12 routes*

- `/ai/prompts/experimental` — `app/(authenticated)/ai/prompts/experimental/page.tsx`
- `/ai/prompts/experimental/action-test` — `app/(authenticated)/ai/prompts/experimental/action-test/page.tsx`
- `/ai/prompts/experimental/broker-test` — `app/(authenticated)/ai/prompts/experimental/broker-test/page.tsx`
- `/ai/prompts/experimental/builder` — `app/(authenticated)/ai/prompts/experimental/builder/page.tsx`
- `/ai/prompts/experimental/card-demo` — `app/(authenticated)/ai/prompts/experimental/card-demo/page.tsx`
- `/ai/prompts/experimental/chatbot-customizer` — `app/(authenticated)/ai/prompts/experimental/chatbot-customizer/page.tsx`
- `/ai/prompts/experimental/chatbot-customizer/instant-custom-chatbot` — `app/(authenticated)/ai/prompts/experimental/chatbot-customizer/instant-custom-chatbot/page.tsx`
- `/ai/prompts/experimental/chatbot-customizer/modular` — `app/(authenticated)/ai/prompts/experimental/chatbot-customizer/modular/page.tsx`
- `/ai/prompts/experimental/execution-demo` — `app/(authenticated)/ai/prompts/experimental/execution-demo/page.tsx`
- `/ai/prompts/experimental/prompt-overlay-test` — `app/(authenticated)/ai/prompts/experimental/prompt-overlay-test/page.tsx`
- `/ai/prompts/experimental/result-components` — `app/(authenticated)/ai/prompts/experimental/result-components/page.tsx`
- `/ai/prompts/experimental/test-controls` — `app/(authenticated)/ai/prompts/experimental/test-controls/page.tsx`

---

## Flat index (URLs only)

- `/admin/concepts/file-system`
- `/admin/template-pages/app-template`
- `/admin/template-pages/module-link-pack`
- `/administration/experimental-routes`
- `/administration/markdown-tester`
- `/administration/official-components`
- `/administration/official-components/[componentId]`
- `/administration/official-components/to-be-added/toggle-menu-demo`
- `/administration/official-components/to-be-added/toggle-menu-demo/toggle-with-categories`
- `/administration/persistence-test`
- `/administration/resilience-lab`
- `/administration/sandbox`
- `/administration/scheduling/cron-tester`
- `/administration/window-panels-smoketest`
- `/ai/prompts/experimental`
- `/ai/prompts/experimental/action-test`
- `/ai/prompts/experimental/broker-test`
- `/ai/prompts/experimental/builder`
- `/ai/prompts/experimental/card-demo`
- `/ai/prompts/experimental/chatbot-customizer`
- `/ai/prompts/experimental/chatbot-customizer/instant-custom-chatbot`
- `/ai/prompts/experimental/chatbot-customizer/modular`
- `/ai/prompts/experimental/execution-demo`
- `/ai/prompts/experimental/prompt-overlay-test`
- `/ai/prompts/experimental/result-components`
- `/ai/prompts/experimental/test-controls`
- `/apps/builder/modules/field-demo`
- `/apps/debug/[slug]`
- `/apps/debug/admin/[slug]`
- `/apps/debug/admin/[slug]/[appletSlug]`
- `/apps/demo`
- `/demo`
- `/demo/code-generator`
- `/demo/code-generator/react-live`
- `/demo/code-generator/react-live-parts`
- `/demo/fetch-react`
- `/demo/monaco-test`
- `/demo/resizable-demo`
- `/demo/resizable-demo/nested-split`
- `/demo/resizable-demo/nested-with-header-footer`
- `/demo/resizable-demo/resizable-builder`
- `/demo/resizable-demo/vertical-split`
- `/demo/services`
- `/demo/services/callback-manager`
- `/demo/services/ref-manager`
- `/demo/voice`
- `/demo/voice/debate-assistant`
- `/demo/voice/server-token`
- `/demo/voice/tts-with-controls`
- `/demo/voice/voice-assistant`
- `/demo/voice/voice-assistant-cdn`
- `/demo/voice/voice-assistant-two`
- `/demo/voice/voice-manager`
- `/demo/voice/wake-word-debug`
- `/demos`
- `/demos/api-tests`
- `/demos/api-tests/agent`
- `/demos/api-tests/block-processing`
- `/demos/api-tests/chat`
- `/demos/api-tests/health`
- `/demos/api-tests/matrx-ai`
- `/demos/api-tests/matrx-ai/agent-demo`
- `/demos/api-tests/matrx-ai/conversation-demo`
- `/demos/api-tests/matrx-ai/dynamic-api`
- `/demos/api-tests/matrx-ai/tools-demo`
- `/demos/api-tests/pdf-extract`
- `/demos/api-tests/setup`
- `/demos/api-tests/tool-testing`
- `/demos/api-tests/unified-chat`
- `/demos/color-test`
- `/demos/feature-tests`
- `/demos/feature-tests/microphone-icon-button`
- `/demos/feature-tests/speaker-button`
- `/demos/local-tools`
- `/demos/local-tools/cloud-sync`
- `/demos/local-tools/documents`
- `/demos/local-tools/engine`
- `/demos/local-tools/files`
- `/demos/local-tools/powershell`
- `/demos/local-tools/scraper`
- `/demos/local-tools/shell`
- `/demos/local-tools/system`
- `/demos/local-tools/terminal`
- `/demos/overlay-instances`
- `/demos/scraper`
- `/demos/scraper/quick-scrape`
- `/demos/scraper/search`
- `/demos/scraper/search-and-scrape`
- `/demos/scraper/test-new`
- `/flash-cards/audio/test-one`
- `/flash-cards/audio/test-two`
- `/flash-cards/modal-test`
- `/google-auth-demo`
- `/layout-tests`
- `/layout-tests/fixed-input`
- `/layout-tests/no-scroll`
- `/layout-tests/prompt-input`
- `/layout-tests/resizable-test`
- `/legacy/demo/component-demo`
- `/legacy/demo/component-demo/accordion`
- `/legacy/demo/component-demo/ai-prog`
- `/legacy/demo/component-demo/ai-prog/ai-code-editor-v3`
- `/legacy/demo/component-demo/ai-prog/basic`
- `/legacy/demo/component-demo/ai-prog/code-block-tests`
- `/legacy/demo/component-demo/ai-prog/direct`
- `/legacy/demo/component-demo/ai-prog/streaming-diff`
- `/legacy/demo/component-demo/button`
- `/legacy/demo/component-demo/button/loading-button-demo`
- `/legacy/demo/component-demo/button/loading-button-demo-2`
- `/legacy/demo/component-demo/calendar`
- `/legacy/demo/component-demo/checkbox-radio`
- `/legacy/demo/component-demo/chip-demo`
- `/legacy/demo/component-demo/color-tester`
- `/legacy/demo/component-demo/config-builder`
- `/legacy/demo/component-demo/container-queries`
- `/legacy/demo/component-demo/draggables`
- `/legacy/demo/component-demo/draggables/container-drop-demo`
- `/legacy/demo/component-demo/draggables/draggable-interactive-cards`
- `/legacy/demo/component-demo/draggables/draggable-photo-cards`
- `/legacy/demo/component-demo/draggables/enhanced-draggable-cards`
- `/legacy/demo/component-demo/draggables/transformable-cards-demo`
- `/legacy/demo/component-demo/entity-analyzer`
- `/legacy/demo/component-demo/entity-analyzer/mock-data`
- `/legacy/demo/component-demo/entity-select-demo`
- `/legacy/demo/component-demo/entity-select-demo/selection-demo-two`
- `/legacy/demo/component-demo/floating-labels`
- `/legacy/demo/component-demo/floating-sheet`
- `/legacy/demo/component-demo/floating-sheet/persistence`
- `/legacy/demo/component-demo/floating-slider-demo`
- `/legacy/demo/component-demo/json-again`
- `/legacy/demo/component-demo/json-again/function-declaration-editor`
- `/legacy/demo/component-demo/json-components-demo`
- `/legacy/demo/component-demo/json-viewer`
- `/legacy/demo/component-demo/json-viewer/json-editor-test`
- `/legacy/demo/component-demo/json-viewer/test`
- `/legacy/demo/component-demo/light-switch-button`
- `/legacy/demo/component-demo/light-switch-button/fancy-demo`
- `/legacy/demo/component-demo/light-switch-button/glass-showcase`
- `/legacy/demo/component-demo/light-switch-button/light-switch`
- `/legacy/demo/component-demo/light-switch-button/light-switch-demo-2`
- `/legacy/demo/component-demo/light-switch-button/light-switch-demo-2/reusable`
- `/legacy/demo/component-demo/light-switch-button/orbital-demo`
- `/legacy/demo/component-demo/light-switch-button/orbital-demo/reusable`
- `/legacy/demo/component-demo/light-switch-button/particles`
- `/legacy/demo/component-demo/light-switch-button/select-showcase`
- `/legacy/demo/component-demo/loading`
- `/legacy/demo/component-demo/markdown-text-block-editor`
- `/legacy/demo/component-demo/markdown-to-flow`
- `/legacy/demo/component-demo/radio-group`
- `/legacy/demo/component-demo/sample-component-upgrade`
- `/legacy/demo/component-demo/selects`
- `/legacy/demo/component-demo/selects/floating-label-select`
- `/legacy/demo/component-demo/selects/next-ui-select`
- `/legacy/demo/component-demo/selects/searchable-entity-select`
- `/legacy/demo/component-demo/selects/searchable-entity-select/isolated-test`
- `/legacy/demo/component-demo/selects/selects-2`
- `/legacy/demo/component-demo/selects/selects-3`
- `/legacy/demo/component-demo/selects/selects-4`
- `/legacy/demo/component-demo/selects/selects-5`
- `/legacy/demo/component-demo/socket-form-builder`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-bookmark-viewer`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-one`
- `/legacy/demo/component-demo/socket-form-builder/scraper-ui/scraper-two`
- `/legacy/demo/component-demo/socket-form-builder/user-concept`
- `/legacy/demo/component-demo/sortable-demo`
- `/legacy/demo/component-demo/sortable-demo/dnd`
- `/legacy/demo/component-demo/sortable-demo/drag-drop-1`
- `/legacy/demo/component-demo/structured-section`
- `/legacy/demo/component-demo/structured-section/themed-section-component`
- `/legacy/demo/component-demo/tags-text-array`
- `/legacy/demo/component-demo/textarea/auto-grow-textarea`
- `/legacy/demo/component-demo/toast-demo`
- `/legacy/demo/component-demo/tool-selector`
- `/legacy/demo/component-demo/tooltip-demo`
- `/legacy/demo/many-to-many-ui`
- `/legacy/demo/many-to-many-ui/claude`
- `/legacy/demo/many-to-many-ui/grok`
- `/legacy/demo/many-to-many-ui/grok-dynamic`
- `/legacy/demo/many-to-many-ui/grok-modular`
- `/legacy/demo/many-to-many-ui/grok/quick-tester`
- `/legacy/tests/advanced-data-table`
- `/legacy/tests/dynamic-entity-test`
- `/legacy/tests/dynamic-entity-test/basic-table`
- `/legacy/tests/dynamic-layouts`
- `/legacy/tests/dynamic-layouts/basic-layout-options`
- `/legacy/tests/dynamic-layouts/grid-demo`
- `/legacy/tests/dynamic-layouts/grid-demo/email-app-demo`
- `/legacy/tests/dynamic-layouts/grid-demo/email-with-grid-system`
- `/legacy/tests/dynamic-layouts/grid-system-12`
- `/legacy/tests/dynamic-layouts/grid-system-12/grid-display`
- `/legacy/tests/dynamic-layouts/interactive-demo`
- `/legacy/tests/dynamic-layouts/interactive-light-dark`
- `/legacy/tests/dynamic-layouts/random-layouts`
- `/legacy/tests/fetch-test`
- `/legacy/tests/forms`
- `/legacy/tests/forms/entity-final-test`
- `/legacy/tests/forms/entity-form-basic-container`
- `/legacy/tests/forms/entity-management`
- `/legacy/tests/forms/entity-management-smart-fields`
- `/legacy/tests/forms/entity-smart-armani-fields`
- `/legacy/tests/forms/single-entity`
- `/legacy/tests/relationship-management`
- `/legacy/tests/relationship-management/entity-json-builder`
- `/legacy/tests/relationship-management/entity-json-builder/async-direct-create`
- `/legacy/tests/relationship-management/entity-json-builder/async-sequential-create`
- `/legacy/tests/relationship-management/metadata-test`
- `/legacy/tests/relationship-management/original-manual`
- `/legacy/tests/relationship-management/rel-with-fetch-test`
- `/p/demo/[slug]`
- `/p/fast-test/[slug]`
- `/registered-results`
- `/registered-results/events-viewer`
- `/registered-results/sitemap-viewer`
- `/sandbox`
- `/sandbox/[id]`
- `/settings-hooks-demo`
- `/settings-shell-demo`
- `/settings-tree-demo`
- `/ssr/demos`
- `/ssr/demos/agent-selector-demo`
- `/ssr/demos/button-demo`
- `/ssr/demos/ca-pd-calculator`
- `/ssr/demos/cloud-files-debug`
- `/ssr/demos/container-drop`
- `/ssr/demos/context-menu`
- `/ssr/demos/context-menu/lab`
- `/ssr/demos/context-menu/scenarios`
- `/ssr/demos/date-pickers`
- `/ssr/demos/glass-lab`
- `/ssr/demos/header-demo`
- `/ssr/demos/icon-finder-demo`
- `/ssr/demos/model-activity-indicators`
- `/ssr/demos/pdf-processing`
- `/ssr/demos/pdf-processing/classify-pages`
- `/ssr/demos/pdf-processing/compress`
- `/ssr/demos/pdf-processing/crop-pages`
- `/ssr/demos/pdf-processing/delete-pages`
- `/ssr/demos/pdf-processing/detect-repeated-regions`
- `/ssr/demos/pdf-processing/duplicate-pages`
- `/ssr/demos/pdf-processing/extract-pages`
- `/ssr/demos/pdf-processing/extract-reading-order`
- `/ssr/demos/pdf-processing/extract-tables`
- `/ssr/demos/pdf-processing/extract-text`
- `/ssr/demos/pdf-processing/flatten-annotations`
- `/ssr/demos/pdf-processing/insert-pages`
- `/ssr/demos/pdf-processing/merge`
- `/ssr/demos/pdf-processing/redact-pattern`
- `/ssr/demos/pdf-processing/redact-regions`
- `/ssr/demos/pdf-processing/redact-repeated-regions`
- `/ssr/demos/pdf-processing/render-all`
- `/ssr/demos/pdf-processing/render-page`
- `/ssr/demos/pdf-processing/render-thumbnail`
- `/ssr/demos/pdf-processing/reorder-pages`
- `/ssr/demos/pdf-processing/rotate-pages`
- `/ssr/demos/pdf-processing/scrub`
- `/ssr/demos/pdf-processing/split`
- `/ssr/demos/pdf-processing/strip-metadata`
- `/ssr/demos/pdf-processing/strip-repeated-regions`
- `/ssr/demos/pdf-processing/studio`
- `/ssr/demos/popup-demo`
- `/ssr/demos/resizables`
- `/ssr/demos/resizables/00-baseline`
- `/ssr/demos/resizables/01-cookie-ssr`
- `/ssr/demos/resizables/02-workbench`
- `/ssr/demos/resizables/03-vscode-shell`
- `/ssr/demos/resizables/04-mac-mail`
- `/ssr/demos/resizables/05-conditional-panels`
- `/ssr/demos/run-settings`
- `/ssr/demos/run-settings/advanced-run-settings-demo`
- `/ssr/demos/run-settings/run-settings-demo`
- `/ssr/demos/screen-capture`
- `/ssr/demos/selection-demo`
- `/ssr/demos/smart-code-editor`
- `/ssr/demos/speaker-demo`
- `/ssr/demos/sync-demo/preferences`
- `/ssr/demos/sync-demo/theme`
- `/ssr/demos/tasks-widgets`
- `/ssr/demos/textarea-tiers`
- `/ssr/demos/upgrade`
- `/ssr/demos/upgrade/industry/[id]`
- `/ssr/demos/upgrade/landing`
- `/ssr/demos/whatsapp-demo`
- `/ssr/demos/whatsapp-window-demo`
- `/ssr/demos/window-demo`
- `/tests`
- `/tests/_maps`
- `/tests/animation-tests`
- `/tests/animation-tests/animated-menu`
- `/tests/animation-tests/animated-menu/with-css`
- `/tests/animation-tests/animation-show`
- `/tests/animation-tests/scale`
- `/tests/app-shell-test`
- `/tests/app-shell-test/layout-choices`
- `/tests/app-shell-test/single-option`
- `/tests/app-shell-test/single-option/layout-choices`
- `/tests/app-shell-test/single-option/sample-nested`
- `/tests/app-shell-test/single-option/sample-nested/sample-nested-again`
- `/tests/applet-tests`
- `/tests/applet-tests/applet-builder-3`
- `/tests/applet-tests/resume-builder-test`
- `/tests/audio-recorder-test`
- `/tests/audio-recorder-test/combined-page`
- `/tests/audio-recorder-test/initial`
- `/tests/audio-recorder-test/recording-management`
- `/tests/camera-test`
- `/tests/chat-tests`
- `/tests/chat-tests/chat-assistant`
- `/tests/chat-tests/conversation-search-ui`
- `/tests/direct-chat-test`
- `/tests/dynamic-gateway-concept`
- `/tests/dynamic-gateway-concept/gateway-hook-test`
- `/tests/extension-bridge`
- `/tests/field-tests`
- `/tests/field-tests/direct-fields`
- `/tests/field-tests/manual-simple-fields`
- `/tests/full-screen-demo`
- `/tests/google-apis`
- `/tests/google-apis/pagespeed`
- `/tests/google-apis/search-console`
- `/tests/google-apis/simple`
- `/tests/integrations`
- `/tests/integrations/option-two`
- `/tests/integrations/simple`
- `/tests/links`
- `/tests/markdown-tests`
- `/tests/markdown-tests/markdown-split-screen`
- `/tests/markdown-tests/tui-tests`
- `/tests/matrx-local`
- `/tests/matrx-table`
- `/tests/metadata-test`
- `/tests/modals`
- `/tests/modals/modal-test`
- `/tests/modals/table-modal-test`
- `/tests/oauth`
- `/tests/oauth/app_callback/[provider]`
- `/tests/qr-labels`
- `/tests/qr-labels/pdf-generator`
- `/tests/qr-labels/qr-label-generator`
- `/tests/slack`
- `/tests/slack/login`
- `/tests/slack/with-brokers`
- `/tests/sms`
- `/tests/tailwind-test`
- `/tests/tailwind-test/animations`
- `/tests/tailwind-test/color-converter`
- `/tests/tailwind-test/color-converter/color-conversion-tester`
- `/tests/tailwind-test/color-swatches`
- `/tests/tailwind-test/demo-page`
- `/tests/tailwind-test/test-card-colors`
- `/tests/tailwind-test/test-tailwind-utilities`
- `/tests/utility-function-tests`
- `/tests/utility-function-tests/create-table-templates`
- `/tests/utility-function-tests/documentation`
- `/tests/utility-function-tests/function-button-demo`
- `/tests/utility-function-tests/function-registry-demo`
- `/tests/utility-function-tests/smart-executor-demo`
- `/tests/windows`
- `/tests/workflow-source-config`
