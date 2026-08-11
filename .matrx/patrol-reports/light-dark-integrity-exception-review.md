# P4 Human Exception Review

- **Prepared:** 2026-08-11 (America/Los_Angeles)
- **Status:** EXCEPTION APPROVAL REQUIRED
- **Approved exceptions:** 0
- **Pending proposals:** 52 files / 109 raw-token lines
- **Reviewable now:** 51
- **Blocked on a review harness:** 1

These are proposals, not exclusions. Every item stays an open P4 finding until
Arman reviews the stated UI and explicitly approves or rejects it. Approval is
then recorded in the typed exception ledger and beside the exact source token;
rejection routes the item to a normal P4 repair.

## Pending proposals

1. **P4-PENDING-001** — [Open review surface](https://manage.aimatrx.com/administration/users/feedback)

   - Source: `app/(admin)/administration/users/feedback/components/FeedbackTable.tsx:937`
   - Exact raw tokens by line: `937: bg-white/25`
   - Why it may be legitimate: The translucent white count badge appears only on a selected stage whose established background is an opaque status color.
   - Review state: Activate a feedback-stage filter whose count is nonzero or untrusted; inspect the active count badge in both themes.
   - Normal-fix effect: A normal theme-token fix would remove the fixed white overlay and could weaken contrast on the colored selected tab.
   - Decision: **PENDING — Arman must approve or reject.**

2. **P4-PENDING-002** — [Open review surface](https://aimatrx.com/podcast/studio/run-a)

   - Source: `app/(core)/podcast/studio/run-a/_components/AssetGallery.tsx:102`
   - Exact raw tokens by line: `102: bg-white/90, text-black`
   - Why it may be legitimate: The fixed white play disc and black icon are chrome over generated video artwork.
   - Review state: Let the mock run reach a rendered video asset, then inspect the white play control over the media.
   - Normal-fix effect: A normal theme-token fix would make the play disc follow the app theme instead of retaining constant contrast over arbitrary artwork.
   - Decision: **PENDING — Arman must approve or reject.**

3. **P4-PENDING-003** — [Open review surface](https://aimatrx.com/podcast/studio/run-f)

   - Source: `app/(core)/podcast/studio/run-f/_components/AssetGallery.tsx:54`
   - Exact raw tokens by line: `54: bg-white/90, text-black`
   - Why it may be legitimate: The fixed white play disc and black icon are chrome over generated video artwork.
   - Review state: Let the mock run reach a rendered video asset, then inspect the white play control over the media.
   - Normal-fix effect: A normal theme-token fix would make the play disc follow the app theme instead of retaining constant contrast over arbitrary artwork.
   - Decision: **PENDING — Arman must approve or reject.**

4. **P4-PENDING-004** — [Open review surface](https://aimatrx.com/podcast/studio/create-refine)

   - Source: `app/(core)/podcast/studio/run-refine/[id]/_components/ProductionStage.tsx:105,106`
   - Exact raw tokens by line: `105: bg-white`; `106: bg-white/50`
   - Why it may be legitimate: The white active and translucent inactive carousel dots overlay generated cover artwork.
   - Review state: Create or open a durable run, continue to /podcast/studio/run-refine/{runId}, and inspect active versus inactive stage marks.
   - Normal-fix effect: A normal theme-token fix would theme the dots, making their contrast depend on the app theme rather than the artwork beneath them.
   - Decision: **PENDING — Arman must approve or reject.**

5. **P4-PENDING-005** — [Open review surface](https://aimatrx.com/podcast/studio/create-reimagine)

   - Source: `app/(core)/podcast/studio/run-reimagine/[id]/_components/StageCanvas.tsx:169,170,185,186`
   - Exact raw tokens by line: `169: bg-white/70`; `170: bg-white`; `185: bg-white`; `186: bg-white/50`
   - Why it may be legitimate: The white live-status pulse and carousel dots overlay generated cover artwork with local black contrast chrome.
   - Review state: Create or open a durable run, continue to /podcast/studio/run-reimagine/{runId}, and inspect live-status dots and active stage marks.
   - Normal-fix effect: A normal theme-token fix would theme these markers, making their contrast depend on the app theme rather than the artwork.
   - Decision: **PENDING — Arman must approve or reject.**

6. **P4-PENDING-006** — [Open review surface](https://demos.aimatrx.com/demos/tests/google-apis/pagespeed)

   - Source: `app/(dev)/demos/tests/google-apis/pagespeed/components/PageSpeedResults.tsx:76`
   - Exact raw tokens by line: `76: bg-white/20`
   - Why it may be legitimate: The white-alpha issue-count badge sits inside an opaque purple-to-pink action button.
   - Review state: Submit a URL and inspect the small result badge over the gradient header in both themes.
   - Normal-fix effect: A normal theme-token fix would replace the local translucent overlay and could reduce contrast inside the colored action.
   - Decision: **PENDING — Arman must approve or reject.**

7. **P4-PENDING-007** — [Open review surface](https://demos.aimatrx.com/demos/tool-viz/in-action)

   - Source: `app/(dev)/demos/tool-viz/in-action/page.dev.tsx:1279`
   - Exact raw tokens by line: `1279: bg-white/20`
   - Why it may be legitimate: The white-alpha count badge occurs only on the selected primary-colored tool row.
   - Review state: Choose a tool that has result data and inspect its count badge while the row is active.
   - Normal-fix effect: A normal theme-token fix would replace the translucent on-primary badge and may reduce its selected-state distinction.
   - Decision: **PENDING — Arman must approve or reject.**

8. **P4-PENDING-008** — [Open review surface](https://aimatrx.com/free/games/tic-tac-toe)

   - Source: `app/(public)/free/games/tic-tac-toe/page.tsx:280`
   - Exact raw tokens by line: `280: hover:bg-white/10`
   - Why it may be legitimate: The hover overlay belongs to an always-dark gradient and glass game-board palette that does not currently follow the app theme.
   - Review state: Hover empty cells and inspect the translucent white hover and border over the authored game board in both app themes.
   - Normal-fix effect: A normal fix would make the board and cell chrome theme-responsive, visibly changing the immersive fixed-dark design in light mode.
   - Decision: **PENDING — Arman must approve or reject.**

9. **P4-PENDING-009** — [Open review surface](https://aimatrx.com/chat/new)

   - Source: `components/debug/PromptExecutionDebugPanel.tsx:223`
   - Exact raw tokens by line: `223: hover:bg-white/20`
   - Why it may be legitimate: The white-alpha close hover sits on an opaque blue gradient debug-panel header.
   - Review state: Enable the global debug indicator, execute a prompt, open the prompt execution debug panel, and hover its dark-surface action.
   - Normal-fix effect: A normal theme-token fix would replace the local on-blue hover overlay and could reduce hover contrast.
   - Decision: **PENDING — Arman must approve or reject.**

10. **P4-PENDING-010** — [Open review surface](https://aimatrx.com/agents)

   - Source: `components/errors/ErrorBoundaryView.tsx:129`
   - Exact raw tokens by line: `129: hover:bg-white/10`
   - Why it may be legitimate: The explicit dark-surface variant supplies white hover chrome for a black stack-trace block while the default branch uses semantic theme tokens.
   - Review state: Deliberately trigger a render error in a safe test session and inspect both the theme-surface actions and dark stack-trace actions.
   - Normal-fix effect: A normal fix would remove the dark-surface variant, causing the copy control to inherit app-theme chrome on an always-black code block.
   - Decision: **PENDING — Arman must approve or reject.**

11. **P4-PENDING-011** — [Open review surface](https://demos.aimatrx.com/demos/model-activity-indicators)

   - Source: `components/loaders/MatxLoader.tsx:70,71`
   - Exact raw tokens by line: `70: bg-white`; `71: bg-white`
   - Why it may be legitimate: The white pulse and core dots belong to an always-dark cyan and blue immersive loader design.
   - Review state: Select MatxLoader and inspect the fixed dark loader with white pulse dots in both app themes.
   - Normal-fix effect: A normal fix would make the loader core theme-responsive and visibly change the fixed-dark design in light mode.
   - Decision: **PENDING — Arman must approve or reject.**

12. **P4-PENDING-012** — [Open review surface](https://aimatrx.com/markdown-studio)

   - Source: `components/mardown-display/blocks/decision-tree/DecisionTreeBlock.tsx:340`
   - Exact raw tokens by line: `340: hover:bg-white/20`
   - Why it may be legitimate: The white-alpha hover is reachable only on the active blue decision node, which already uses fixed white foreground.
   - Review state: Render a valid decision-tree kind payload and hover the matched action on its local surface.
   - Normal-fix effect: A normal theme-token fix would theme the hover against the app instead of the active blue node.
   - Decision: **PENDING — Arman must approve or reject.**

13. **P4-PENDING-013** — [Open review surface](https://aimatrx.com/markdown-studio)

   - Source: `components/mardown-display/blocks/flashcards/FlashcardMobileView.tsx:138,140,142,143,151,624,929,930,935,995,1094,1103`
   - Exact raw tokens by line: `138: bg-white/10`; `140: bg-white/10`; `142: bg-white/5`; `143: bg-white/5`; `151: bg-white/80`; `624: bg-white/10, hover:bg-white/20`; `929: bg-white`; `930: bg-white/25`; `935: bg-white/25`; `995: bg-white/10, hover:bg-white/20`; `1094: bg-white/10`; `1103: bg-white/5`
   - Why it may be legitimate: These classes form a fixed dark full-screen flashcard experience: white markdown, controls, progress dots, drawer chrome, and overlays on zinc or gradient card faces.
   - Review state: Render a valid flashcards payload, switch to a mobile viewport, and exercise reveal, navigation, hint, and progress states.
   - Normal-fix effect: A normal fix would make the full-screen study experience theme-responsive, substantially changing its current fixed-dark appearance in light mode.
   - Decision: **PENDING — Arman must approve or reject.**

14. **P4-PENDING-014** — [Open review surface](https://aimatrx.com/markdown-studio)

   - Source: `components/mardown-display/blocks/flashcards/FlashcardsBlock.tsx:392`
   - Exact raw tokens by line: `392: bg-white/10, hover:bg-white/20`
   - Why it may be legitimate: The white-alpha Not now button is inside the fixed blue-to-indigo Flash Mode prompt.
   - Review state: Render a valid flashcards payload and inspect the local dark/on-color control in both themes.
   - Normal-fix effect: A normal theme-token fix would replace the prompt-local translucent button and could weaken its contrast on the blue gradient.
   - Decision: **PENDING — Arman must approve or reject.**

15. **P4-PENDING-015** — [Open review surface](https://aimatrx.com/markdown-studio)

   - Source: `components/mardown-display/blocks/images/ImageBlock.tsx:337,369`
   - Exact raw tokens by line: `337: bg-white/10, hover:bg-white/20`; `369: bg-white/20`
   - Why it may be legitimate: The white-alpha close control and separator are inside a deliberately black full-screen image viewer.
   - Review state: Render an image kind payload, open fullscreen, and hover the fixed overlay actions and divider.
   - Normal-fix effect: A normal fix would theme viewer chrome against the app rather than preserving constant contrast on the black image stage.
   - Decision: **PENDING — Arman must approve or reject.**

16. **P4-PENDING-016** — [Open review surface](https://aimatrx.com/markdown-studio)

   - Source: `components/mardown-display/blocks/timeline/TimelineBlock.tsx:363`
   - Exact raw tokens by line: `363: bg-white/20`
   - Why it may be legitimate: The white-alpha Complete badge sits on opaque green or indigo timeline-period buttons.
   - Review state: Render a valid timeline kind payload with item/status data and inspect the matched badge.
   - Normal-fix effect: A normal theme-token fix would replace the on-color translucent badge and could reduce contrast on the colored button.
   - Decision: **PENDING — Arman must approve or reject.**

17. **P4-PENDING-017** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/markdown-split-screen)

   - Source: `components/mardown-display/markdown-classification/custom-views/common/DefaultLoadingComponent.tsx:299,334,398,442,480`
   - Exact raw tokens by line: `299: bg-white/30`; `334: bg-white/30`; `398: bg-white/30`; `442: bg-white/30`; `480: bg-white/30`
   - Why it may be legitimate: The white-alpha progress and shimmer placeholders sit on configured opaque slate, gray, or blue gradients or on colored accent buttons.
   - Review state: Choose a legacy classified view that uses FlexibleLoadingComponent and force its loading state.
   - Normal-fix effect: A normal fix would make these loading accents theme-responsive instead of maintaining local contrast on configured colored surfaces.
   - Decision: **PENDING — Arman must approve or reject.**

18. **P4-PENDING-018** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/markdown-split-screen)

   - Source: `components/mardown-display/markdown-classification/custom-views/view-components/DynamicView.tsx:96`
   - Exact raw tokens by line: `96: bg-white/20`
   - Why it may be legitimate: The white-alpha skeleton bar sits on an opaque slate-500-to-600 header with an explicitly darker header in dark mode.
   - Review state: Choose Dynamic View and inspect its loading state over the authored local background.
   - Normal-fix effect: A normal fix would theme the placeholder rather than retaining fixed local contrast on the slate header.
   - Decision: **PENDING — Arman must approve or reject.**

19. **P4-PENDING-019** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/markdown-split-screen)

   - Source: `components/mardown-display/markdown-classification/custom-views/view-components/IntroOutroListView.tsx:49,159,162,165,168`
   - Exact raw tokens by line: `49: bg-white/10`; `159: bg-white/10`; `162: bg-white/20`; `165: bg-white/20`; `168: bg-white/30`
   - Why it may be legitimate: The white icon panel, shimmer, skeleton bars, and progress track sit on an opaque blue-to-indigo-to-violet header.
   - Review state: Choose Intro/Outro List view and inspect both loaded icon tiles and loading skeletons.
   - Normal-fix effect: A normal fix would theme header accents instead of preserving constant local contrast on the gradient.
   - Decision: **PENDING — Arman must approve or reject.**

20. **P4-PENDING-020** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/markdown-split-screen)

   - Source: `components/mardown-display/markdown-classification/custom-views/view-components/KeyPointsNestedListView.tsx:240`
   - Exact raw tokens by line: `240: bg-white/30`
   - Why it may be legitimate: The white progress track sits on an opaque blue-to-indigo-to-violet loading header.
   - Review state: Choose Key Points Nested List view and inspect its progress/loading bar.
   - Normal-fix effect: A normal fix would theme the progress track instead of retaining fixed local contrast on the gradient.
   - Decision: **PENDING — Arman must approve or reject.**

21. **P4-PENDING-021** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/markdown-split-screen)

   - Source: `components/mardown-display/markdown-classification/custom-views/view-components/KeyPointsView.tsx:46,144,148,149,150`
   - Exact raw tokens by line: `46: bg-white/20`; `144: bg-white/20`; `148: bg-white/30`; `149: bg-white/20`; `150: bg-white/20`
   - Why it may be legitimate: The white icon backing and loading skeletons sit on an opaque blue-to-indigo header.
   - Review state: Choose Key Points view and inspect both loaded icon tile and loading skeleton states.
   - Normal-fix effect: A normal fix would theme these accents instead of retaining fixed local contrast on the gradient.
   - Decision: **PENDING — Arman must approve or reject.**

22. **P4-PENDING-022** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/markdown-split-screen)

   - Source: `components/mardown-display/markdown-classification/custom-views/view-components/LsiKeywordView.tsx:570`
   - Exact raw tokens by line: `570: bg-white/20`
   - Why it may be legitimate: The white-alpha primary-keyword skeleton sits on an opaque blue-to-purple-to-indigo header.
   - Review state: Choose Keyword Hierarchy/LSI view and inspect its loading title state.
   - Normal-fix effect: A normal fix would theme the skeleton instead of retaining fixed local contrast on the gradient.
   - Decision: **PENDING — Arman must approve or reject.**

23. **P4-PENDING-023** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/markdown-split-screen)

   - Source: `components/mardown-display/markdown-classification/custom-views/view-components/ModernKeywordAnalyzerView.tsx:184,198`
   - Exact raw tokens by line: `184: bg-white/20`; `198: bg-white/20, hover:bg-white/30`
   - Why it may be legitimate: The white-alpha editor input and edit control sit on an opaque blue-to-purple-to-indigo header.
   - Review state: Choose Modern Keyword Analyzer and inspect the translucent input and action over its authored local surface.
   - Normal-fix effect: A normal fix would theme the editor chrome instead of retaining fixed local contrast on the gradient.
   - Decision: **PENDING — Arman must approve or reject.**

24. **P4-PENDING-024** — [Open review surface](https://aimatrx.com/scraper)

   - Source: `components/official/PageTemplate.tsx:106`
   - Exact raw tokens by line: `106: bg-white/10`
   - Why it may be legitimate: The white-alpha statistics tiles sit on the template's opaque blue-to-indigo hero.
   - Review state: Run a scrape/analysis and open Keyword Analysis or Fact Checker output; inspect translucent white elements over the authored header surface.
   - Normal-fix effect: A normal fix would theme the statistic tiles instead of retaining fixed local contrast on the blue hero.
   - Decision: **PENDING — Arman must approve or reject.**

25. **P4-PENDING-025** — [Open review surface](https://manage.aimatrx.com/administration/ui/official-components/image-upload-field)

   - Source: `components/ui/file-upload/ImageUploadField.tsx:115`
   - Exact raw tokens by line: `115: bg-white`
   - Why it may be legitimate: A fixed white circular remove control is overlaid on an uploaded image so it is independent of the application theme.
   - Review state: Upload an image, hover it, and inspect the fixed white overlay action against varied imagery.
   - Normal-fix effect: A semantic theme background would make the remove control follow the app theme and could reduce contrast against arbitrary image pixels.
   - Decision: **PENDING — Arman must approve or reject.**

26. **P4-PENDING-026** — [Open review surface](https://aimatrx.com/context-items)

   - Source: `features/agents/components/context-items/bodies/MediaBody.tsx:65`
   - Exact raw tokens by line: `65: bg-white`
   - Why it may be legitimate: Document and file_output items render inside an iframe with a fixed white document matte.
   - Review state: Select or open a real context item of media kind and inspect its media body background in both themes.
   - Normal-fix effect: A semantic background would follow the app theme but could expose transparent document regions as dark.
   - Decision: **PENDING — Arman must approve or reject.**

27. **P4-PENDING-027** — [Open review surface](https://aimatrx.com/context-items)

   - Source: `features/agents/components/context-items/bodies/WebpageBody.tsx:49`
   - Exact raw tokens by line: `49: bg-white`
   - Why it may be legitimate: External webpages render in an iframe with a fixed white fallback matte.
   - Review state: Select or open a real webpage context item and inspect the iframe/document matte in both themes.
   - Normal-fix effect: A semantic background would make iframe loading and transparent areas follow the app theme instead of staying page-like white.
   - Decision: **PENDING — Arman must approve or reject.**

28. **P4-PENDING-028** — [Open review surface](https://aimatrx.com/agent-apps/templates)

   - Source: `features/applet/builder/parts/Stepper.tsx:44,105`
   - Exact raw tokens by line: `44: bg-white`; `105: bg-white`
   - Why it may be legitimate: The current-step indicator is a white dot placed on the fixed rose status circle in desktop and compact branches.
   - Review state: Open or create an applet/agent-app flow that uses the stepper and inspect active/completed step dots. A configured record is required.
   - Normal-fix effect: A semantic foreground could change with the app theme and weaken contrast against the fixed rose circle.
   - Decision: **PENDING — Arman must approve or reject.**

29. **P4-PENDING-029** — **NO REVIEW URL — approval blocked**

   - Source: `features/applet/home/app-display/ModernGlass.tsx:93,94`
   - Exact raw tokens by line: `93: bg-white/10`; `94: bg-white/5`
   - Why it may be legitimate: Two translucent white blurred circles are decorative light blooms inside a deliberately dark glass composition.
   - Review state: No importer or stable harness was found. A dedicated review harness is required.
   - Normal-fix effect: Semantic fills would recolor or remove the intended glass-light highlights when the app theme changes.
   - Decision: **PENDING — Arman must approve or reject.**

30. **P4-PENDING-030** — [Open review surface](https://aimatrx.com/agent-apps/templates)

   - Source: `features/applet/runner/layouts/options/concepts/ContextualSearchLayout.tsx:45`
   - Exact raw tokens by line: `45: hover:bg-white`
   - Why it may be legitimate: The inactive selector uses a translucent white hover over a fixed black pill placed on an authored contextual background.
   - Review state: Open/run an applet configured to the Contextual Search layout and select an inactive context option to inspect its hover state.
   - Normal-fix effect: A semantic hover would follow the app theme and may not remain visible over the fixed black selector.
   - Decision: **PENDING — Arman must approve or reject.**

31. **P4-PENDING-031** — [Open review surface](https://aimatrx.com/agent-apps/templates)

   - Source: `features/applet/runner/layouts/options/concepts/MapBasedSearchLayout.tsx:65`
   - Exact raw tokens by line: `65: bg-white`
   - Why it may be legitimate: The field count is displayed as a fixed white pill inside the rose Filters button.
   - Review state: Open/run an applet configured to the Map Based Search layout and inspect the numbered white marker on its authored surface.
   - Normal-fix effect: A semantic surface would follow the app theme and alter the fixed rose-on-white badge design.
   - Decision: **PENDING — Arman must approve or reject.**

32. **P4-PENDING-032** — [Open review surface](https://aimatrx.com/cms)

   - Source: `features/cms/components/PageEditor.tsx:743`
   - Exact raw tokens by line: `743: bg-white`
   - Why it may be legitimate: The authored page preview tab gives its iframe a fixed white output canvas.
   - Review state: Open a site, then create or edit a page at /cms/{siteId}/pages/new or /cms/{siteId}/pages/{pageId}; inspect the white editor/document canvas.
   - Normal-fix effect: A semantic background would expose iframe loading and transparent regions using the current app theme.
   - Decision: **PENDING — Arman must approve or reject.**

33. **P4-PENDING-033** — [Open review surface](https://aimatrx.com/education/notes)

   - Source: `features/education/notes/LiveCaptureButton.tsx:96,97`
   - Exact raw tokens by line: `96: bg-white/70`; `97: bg-white`
   - Why it may be legitimate: The animated recording pulse and center dot are fixed white indicators on a destructive red button.
   - Review state: Open a note at /education/notes/{noteId}/edit and activate live capture to inspect the white live-status dots.
   - Normal-fix effect: A semantic foreground could shift with the theme and reduce the strong recording-state contrast on red.
   - Decision: **PENDING — Arman must approve or reject.**

34. **P4-PENDING-034** — [Open review surface](https://aimatrx.com/education/progress/learning-gain)

   - Source: `features/education/study/learning-gain/components/LearningGainReportView.tsx:59`
   - Exact raw tokens by line: `59: print:bg-white`
   - Why it may be legitimate: The report explicitly forces a white page background only for print and PDF output.
   - Review state: Open browser print preview; the matched class is print:bg-white and is not exercised by normal screen rendering.
   - Normal-fix effect: Removing the fixed print color would let the browser print the current application theme, potentially producing a dark PDF.
   - Decision: **PENDING — Arman must approve or reject.**

35. **P4-PENDING-035** — [Open review surface](https://aimatrx.com/files)

   - Source: `features/file-analysis/components/BboxPreview.tsx:43`
   - Exact raw tokens by line: `43: bg-white`
   - Why it may be legitimate: Extracted transparent PNG region previews are placed on a fixed white image matte.
   - Review state: Open a file-analysis labeling flow with an uploaded image and bounding-box candidate, then inspect the image matte.
   - Normal-fix effect: A semantic background would make transparent pixels inherit the application theme and change how the extracted image is perceived.
   - Decision: **PENDING — Arman must approve or reject.**

36. **P4-PENDING-036** — [Open review surface](https://aimatrx.com/files)

   - Source: `features/files/blocks/image/UnifiedImageBlockRenderer.tsx:528,952`
   - Exact raw tokens by line: `528: hover:bg-white/10`; `952: hover:bg-white/10`
   - Why it may be legitimate: The image toolbar uses translucent white hover chrome over the media substrate, independent of app theme.
   - Review state: Select an image file, open fullscreen, and hover fixed overlay actions in both app themes.
   - Normal-fix effect: A semantic hover would follow the app theme and could disappear against arbitrary image content.
   - Decision: **PENDING — Arman must approve or reject.**

37. **P4-PENDING-037** — [Open review surface](https://aimatrx.com/files)

   - Source: `features/files/blocks/video/UnifiedVideoBlockRenderer.tsx:356,636`
   - Exact raw tokens by line: `356: hover:bg-white/10`; `636: hover:bg-white/10`
   - Why it may be legitimate: The video toolbar uses translucent white hover chrome over the video substrate, independent of app theme.
   - Review state: Select a video file, open/fullscreen the player, and hover fixed overlay actions in both app themes.
   - Normal-fix effect: A semantic hover would follow the app theme and could disappear against video frames.
   - Decision: **PENDING — Arman must approve or reject.**

38. **P4-PENDING-038** — [Open review surface](https://aimatrx.com/files)

   - Source: `features/files/components/core/FilePreview/previewers/HtmlPreview.tsx:183`
   - Exact raw tokens by line: `183: bg-white`
   - Why it may be legitimate: Saved HTML files render inside an iframe with a fixed white page matte.
   - Review state: Select an HTML file and inspect the iframe/document matte in both app themes.
   - Normal-fix effect: A semantic background would make empty or transparent HTML regions follow the app theme.
   - Decision: **PENDING — Arman must approve or reject.**

39. **P4-PENDING-039** — [Open review surface](https://manage.aimatrx.com/administration/ui/official-components/content-editor)

   - Source: `features/html-pages/components/HtmlInlinePreview.tsx:317`
   - Exact raw tokens by line: `317: bg-white`
   - Why it may be legitimate: Rendered HTML in chat/canvas uses a fixed white iframe surface.
   - Review state: Open an inline HTML preview example and inspect the document matte in both app themes.
   - Normal-fix effect: A semantic background would make transparent generated HTML inherit the app theme.
   - Decision: **PENDING — Arman must approve or reject.**

40. **P4-PENDING-040** — [Open review surface](https://manage.aimatrx.com/administration/ui/official-components/content-editor)

   - Source: `features/html-pages/components/HtmlPreviewModal.tsx:1168`
   - Exact raw tokens by line: `1168: bg-white`
   - Why it may be legitimate: The modal deliberately surrounds the iframe with white and sets the iframe color scheme to light.
   - Review state: Open the full HTML preview modal and inspect its document matte in both app themes.
   - Normal-fix effect: A semantic substitution plus removal of light colorScheme would allow the preview substrate and native controls to follow the app theme.
   - Decision: **PENDING — Arman must approve or reject.**

41. **P4-PENDING-041** — [Open review surface](https://demos.aimatrx.com/demos/tests/markdown-tests/tui-tests)

   - Source: `features/html-pages/components/tabs/SavePageTab.tsx:444`
   - Exact raw tokens by line: `444: bg-white`
   - Why it may be legitimate: The Publish tab presents the generated page inside a fixed white preview canvas.
   - Review state: Open the Save Page tab and inspect its HTML preview/document matte in both themes.
   - Normal-fix effect: A semantic background would make transparent/loading areas follow the application theme.
   - Decision: **PENDING — Arman must approve or reject.**

42. **P4-PENDING-042** — [Open review surface](https://aimatrx.com/images/convert)

   - Source: `features/image-studio/components/CropPreview.tsx:342,350`
   - Exact raw tokens by line: `342: bg-white/20`; `350: bg-white`
   - Why it may be legitimate: The crop focal-point ring and center dot are white controls placed directly over source imagery.
   - Review state: Upload an image, enter crop mode, and inspect inactive/active crop marks over varied imagery.
   - Normal-fix effect: Semantic colors would follow the app theme rather than maximizing contrast against the image substrate.
   - Decision: **PENDING — Arman must approve or reject.**

43. **P4-PENDING-043** — [Open review surface](https://aimatrx.com/images/studio-light)

   - Source: `features/image-studio/components/InitialCropPanel.tsx:742,749,756,763,772,779,786,793`
   - Exact raw tokens by line: `742: bg-white`; `749: bg-white`; `756: bg-white`; `763: bg-white`; `772: bg-white`; `779: bg-white`; `786: bg-white`; `793: bg-white`
   - Why it may be legitimate: Eight edge and corner resize handles are fixed white with dark borders over arbitrary image pixels.
   - Review state: Upload an image and activate initial crop; inspect all white edge and corner handles over light and dark image regions.
   - Normal-fix effect: Semantic handles would change with the app theme and could lose contrast against the source image.
   - Decision: **PENDING — Arman must approve or reject.**

44. **P4-PENDING-044** — [Open review surface](https://aimatrx.com/marketing/content-plan)

   - Source: `features/marketing/content-plan/setup/components/SetupBridgeSection.tsx:995`
   - Exact raw tokens by line: `995: bg-white`
   - Why it may be legitimate: The authored marketing-page iframe preview uses a fixed white output matte.
   - Review state: Open a site at /marketing/content-plan/{siteId} in setup/bridge state and inspect the embedded white surface.
   - Normal-fix effect: A semantic background would make transparent authored-page regions follow the app theme.
   - Decision: **PENDING — Arman must approve or reject.**

45. **P4-PENDING-045** — [Open review surface](https://aimatrx.com/tools/scanner)

   - Source: `features/pdf/scanner/components/CaptureView.tsx:195,251,269`
   - Exact raw tokens by line: `195: bg-white/70`; `251: hover:bg-white/10`; `269: bg-white`
   - Why it may be legitimate: The flash overlay, camera-switch hover, and shutter are fixed white camera chrome on a black/video capture surface.
   - Review state: Enter live camera/capture mode and inspect the white shutter, translucent flash, and camera-chrome hover controls.
   - Normal-fix effect: Semantic controls would follow the app theme and could lose the familiar high-contrast camera appearance over live video.
   - Decision: **PENDING — Arman must approve or reject.**

46. **P4-PENDING-046** — [Open review surface](https://aimatrx.com/podcast)

   - Source: `features/podcasts/components/player/PodcastAudioPlayer.tsx:423,425,431,468,570,573`
   - Exact raw tokens by line: `423: hover:bg-white/10`; `425: bg-white/10`; `431: [&>span:first-of-type]:bg-white/25, [&_[role=slider]]:bg-white`; `468: bg-white/10`; `570: bg-white/15`; `573: hover:bg-white/10`
   - Why it may be legitimate: The explicit dark surface variant uses white transport, waveform, slider, cover, and speed-control treatments while the normal branch uses semantic theme tokens.
   - Review state: Open a published episode/show at /podcast/{slug}, or a studio run at /podcast/studio/run/{runId}, and inspect the dark player variant and waveform controls.
   - Normal-fix effect: Removing the dark variant would make controls follow the app theme and may reduce contrast against the fixed black video/player panel.
   - Decision: **PENDING — Arman must approve or reject.**

47. **P4-PENDING-047** — [Open review surface](https://aimatrx.com/podcast)

   - Source: `features/podcasts/components/player/PodcastEpisodePage.tsx:54`
   - Exact raw tokens by line: `54: bg-white/15, hover:bg-white/25`
   - Why it may be legitimate: The episode share button uses translucent white chrome over full-bleed video and is separate from the semantic light-surface share button.
   - Review state: Open a published episode at /podcast/{episodeSlug} and inspect the translucent white action over its authored hero surface.
   - Normal-fix effect: A semantic share button would follow the app theme rather than the video substrate and could lose contrast.
   - Decision: **PENDING — Arman must approve or reject.**

48. **P4-PENDING-048** — [Open review surface](https://aimatrx.com/podcast)

   - Source: `features/podcasts/components/player/PodcastShowPage.tsx:136`
   - Exact raw tokens by line: `136: bg-white/15, hover:bg-white/25`
   - Why it may be legitimate: The share button is translucent white chrome over the fixed cover-art hero and its dark legibility scrim.
   - Review state: Open a published show at /podcast/{showSlug} and inspect the translucent white action over its authored hero surface.
   - Normal-fix effect: A semantic button would follow the app theme and could conflict with the cover-art hero substrate.
   - Decision: **PENDING — Arman must approve or reject.**

49. **P4-PENDING-049** — [Open review surface](https://aimatrx.com/podcast/studio)

   - Source: `features/podcasts/generator/components/AssetCard.tsx:234`
   - Exact raw tokens by line: `234: bg-white/90, hover:bg-white`
   - Why it may be legitimate: The unselected Use as cover button is nearly white with dark text over an image and black gradient.
   - Review state: Open a durable run at /podcast/studio/run/{runId} or a design variant, wait for ready media, and hover the white overlay action.
   - Normal-fix effect: A semantic button would follow the app theme and alter the fixed image-overlay call to action.
   - Decision: **PENDING — Arman must approve or reject.**

50. **P4-PENDING-050** — [Open review surface](https://aimatrx.com/podcast/studio)

   - Source: `features/podcasts/generator/components/ProductionTeaser.tsx:108,109`
   - Exact raw tokens by line: `108: bg-white`; `109: bg-white/50`
   - Why it may be legitimate: Active and inactive carousel indicators are fixed white overlays on generated cover artwork.
   - Review state: Open a durable run in active staged progress and inspect active/inactive teaser marks.
   - Normal-fix effect: Semantic indicators would follow the app theme instead of maintaining a stable media-overlay language.
   - Decision: **PENDING — Arman must approve or reject.**

51. **P4-PENDING-051** — [Open review surface](https://aimatrx.com/scraper)

   - Source: `features/scraper/parts/HeaderAnalysis.tsx:118,126,134,142,319`
   - Exact raw tokens by line: `118: bg-white/10`; `126: bg-white/10`; `134: bg-white/10`; `142: bg-white/10`; `319: bg-white/20`
   - Why it may be legitimate: Four metric cards and a header-count badge use translucent white fills over fixed blue, indigo, or per-level colored headers.
   - Review state: Run a scrape and open Header Analysis; inspect the translucent white metric cards and badge over the authored header surface.
   - Normal-fix effect: Semantic fills would track the app theme and alter contrast against the fixed colored header backgrounds.
   - Decision: **PENDING — Arman must approve or reject.**

52. **P4-PENDING-052** — [Open review surface](https://aimatrx.com/_apps/app-builder/apps/create)

   - Source: `features/applet/styles/StyledComponents.tsx:234,242,243`
   - Exact raw tokens by line: `234: text-black`; `242: text-black`; `243: text-black`
   - Why it may be legitimate: Yellow, amber, and lime action-button variants keep black text across both theme-specific colored backgrounds for contrast.
   - Review state: Choose yellow, amber, and lime action-button colors and inspect their black labels in both themes.
   - Normal-fix effect: A normal semantic foreground token would flip the label with the app theme and could make it unreadable on these bright fixed status colors.
   - Decision: **PENDING — Arman must approve or reject.**

## Non-proposals from the same full pass

- 38 lines were classified compliant because they have a real property-specific
  theme branch, are overridden by a consumer, are commented/non-rendered, or
  have no current consumer. They are not allowlisted and will be scanned again
  if code changes make them live.
- 3 lines were confirmed defects in two files:
  `CandidateProfileView.tsx` (2 skeleton lines) and `RoomHeader.tsx` (1
  mobile sheet row). Their attempted Tier-M batch was rejected and fully
  reverted; both findings remain open in the sighting ledger.
- 16 candidate files have no stable/current render path. Fifteen are currently
  compliant/non-rendered; the one pending proposal is
  `features/applet/home/app-display/ModernGlass.tsx`, which cannot be approved
  until a Tier-C review harness exists.

ARMAN, WE NEED YOU: approve or reject every listed P4 exception.

