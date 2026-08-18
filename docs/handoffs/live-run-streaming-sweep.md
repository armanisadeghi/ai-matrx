---
status: active
updated: 2026-08-18
repos: [matrx-frontend, aidream]
vision: [features/window-panels/FEATURE.md]
---

# THE FLOATING LAW — ranked offender inventory

> **State, 2026-08-18.** Every ranked section (§1–§8) is DONE, and **D170 is
> CLOSED — both halves.** What is left is TWO chipped items and nothing else:
> (a) the flashcard run emits no chunks at all, which needs aidream; (b)
> `useResearchStream` still hand-renders its stream and must move onto
> `adoptForeignStream`. Delete this doc when those two land.

The companion worklist to [`live-stream-everywhere.md`](./live-stream-everywhere.md).
That doc holds the vision, the primitives, and the migration recipe. **This doc is
the verified target list** — every row below was read in the code, not inferred.

## Vision — Arman's words

> "You cannot have a spinning icon while AI works in the background, ever. All
> across the entire code base." (2026-08-10)

> "A user must never watch a spinner while AI works. The run streams, and it
> streams in `LiveRunWindow`." — THE FLOATING LAW,
> `features/window-panels/FEATURE.md` (2026-08-11)

Two halves, both absolute: **never a top-of-page live block** (it shifts the
content the user is editing), and **a run that dies on refresh is the same
defect as a spinner**.

## Classes

🚨 **This table is the ORIGINAL 2026-08-11 inventory, not a live count.** The
counts below were never decremented as work landed — the *sections* are the
delivery record, and every ranked section (§1–§8) is now DONE or chipped. Read a
row here as "what the sweep found", never as "what is left"; do not quote these
numbers as remaining work.

| Class | Meaning | Count |
|---|---|---|
| **A** | Spinner-only, stream handle already available (`requestId` / `conversationId` / ignored `onEvent`) | **31 surfaces** (Transcript Studio's 4 fixed 2026-08-11) |
| **B** | Spinner-only, no stream handle yet — needs `adoptForeignStream` or a `useRunAgent`→`useLiveAgentRun` migration first | **5** |
| **C** | Page-shifting live-run block (live output above the page's own content) | **0 — all 3 fixed 2026-08-11** |
| **D** | Dies on refresh — run held by an in-tab `await`, navigating away aborts it | **0 — all 12 done** (§1, §8; the last two, both expertise, closed 2026-08-17 once `platform.expertise_run` gave them something to rejoin by) |
| **E** | Needs a content-IR kind before it can stream well — **title options, the SEO package, and the slide deck all shipped 2026-08-11**; only podcast chapters remain | **1** |

Fix costs below: **S** ≈ 15 min (the two-line recipe), **M** ≈ 1–3 h, **L** ≈ a day+.

## Resources

- Primitives: **`useFloatingAgentRun` / `useFloatingRunWindow` (start here —
  they ARE the recipe; `useFloatingRunWindow({ track })` covers a run the
  surface only WATCHES, with `track.visible` suppressing the float while the
  run's own pane is on screen), `useLiveRunHandle` + `livePosture()` for a
  thunk-launched run**, and underneath them `useLiveAgentRun`,
  `<LiveRunDisplay>`, `adoptForeignStream`, `useOpenLiveRunWindow()`.
  Recipe + traps: `live-stream-everywhere.md`.
- **The row must outlive the viewer** — before adding any reap/adoption code
  in a migration, read `features/agents/docs/LIVE_RUN_RETENTION.md` (the
  disappearing-run class: retention seam, non-destructive `createRequest`,
  abort-before-reap; guard test `request-viewer-retention.test.ts`). A surface
  with MORE THAN ONE run (or runs beside API data) uses the `runSets` slice +
  `RunSetDisplay` (2026-08-13, keyword research is the exemplar) — never a
  hook-local run list.
- Reference for a class-B/E migration done whole:
  `features/podcasts/generator/useEpisodeTitleOptions.ts` (2026-08-11) — open
  the window BEFORE the launch, run the mandate through `useLiveAgentRun`, and
  let the kind component carry the action so the window is the primary
  surface rather than a preview of one.
- Reference implementation for class D done right (generalized past crawls in
  §1 — `useSiteCommandRun` is now the primitive to copy for any durable,
  server-owned run):
  `features/marketing/data/useSiteCrawlActivity.ts` +
  `features/marketing/components/crawls/LiveCrawlFeed.tsx` (durable server rows
  + reattach on load) — consumed correctly by
  `features/marketing/components/crawls/NewCrawlWorkspace.tsx:225`.
- Reference for class A done right: `KeywordResearchLauncher.tsx:236`
  (`MarkdownStream requestId` over an adopted pipeline stream).
- **Window sizing is already correct — do not set it per migration.**
  `LiveRunWindow` defaults to the `/chat` reading column (760 outer → ~720
  usable) × `80vh`, derived from named constants at the top of the file.
  A migration passes `width`/`height` ONLY after watching that kind render and
  seeing the default be wrong (a three-line kind should not open at 80vh).
  Rule + arithmetic: `features/window-panels/FEATURE.md` § THE FLOATING LAW.
- **The action goes ON the kind component, through the ONE write path.**
  A verb that acts on streamed output ("Use this brief", "Apply") is never a
  button on a bespoke card beside the component. The component calls
  `runAction("apply_surface_write", { target, value, origin: "user" })`, which
  routes to a write target the surface DECLARED in its manifest — so a human
  click and an agent write are literally the same operation, and the agent gets
  write access for free. Exemplar end-to-end: `PageBriefBlock`'s `acceptTarget`
  → `accept_brief_draft` (entity mode) in
  `features/surfaces/manifests/content-plan-node.manifest.ts` → the handler in
  `NodePanel.tsx`. Never add a second mechanism.
- `streamCommand`'s `onEvent` callback: `features/marketing/crawler/direct-client.ts:245`.
  Every command wrapper (`analyzeSite`, `syncSitemaps`, `checkSiteLinks`,
  `fetchPageNow`, `syncGsc`, `rescrapeSite`, `initializeSite`) accepts it; most
  callers pass nothing.

---

Every section below is chipped to a focused session. The chips are the delivery
mechanism — this doc is only the target list.

---

## Multi-step pipelines — swept 2026-08-11

The original sweep looked for a spinner beside a SINGLE agent call. This pass
covered the class it missed: pipelines with a step counter, a stage list, a
progress bar, or a DB poll for completion. **Arman's rule covers every step,
not just the last one** — two seconds is already too long, and the expensive
step is the one that must show output.

**Searched:** every `setInterval` in `features/**` + `app/**` (incl. `(admin)`
and `(dev)`) — 98 files, each classified; `currentStep` / `stepIndex` /
`activeStep` / `stages[`; `status === 'processing'|'queued'|'pending'|'running'`
polls; "N of M" counters and `Math.round(x/y*100)` progress bars. Then the
cross-product: every file calling `useHeadlessAgentJson` / `runHeadlessAgentJson`
/ `launchAgentExecution` / `useRunAgent` / `useLiveAgentRun` (80 files) filtered
for step-or-progress UI — **zero hits**, which is why this class hid from the
first sweep: the offenders poll a pipeline the client never launched, so they
carry no agent-run import at all. That is the signature to search on next time.

### Fixed

| Surface | Was | Now |
|---|---|---|
| `features/pdf/scanner/{processing.ts,useScanSaveFlow.ts,components/ProcessingView.tsx}` — `/tools/scanner` | Step 3 "AI cleanup" = 2s DB poll for per-page cleaned_text COUNTS + a progress bar. The multi-LLM step, the expensive one, showed a percentage while the model's rewrite of the user's own scan stayed invisible. | The poll pulls each page's cleaned TEXT once it lands (`fetchCleanedPageText`, only pages that newly turned cleaned — one small select per page, never the whole doc per tick) and the step renders it in an auto-following pane. Counter + ledger stay, **under** the output. |
| `features/transcription-cleanup/components/CleanupPad.tsx` — `/transcripts/cleanup` | "record → auto-clean → refine with ANY number of agents" fires up to 4 runs at once, but custom mandates are tab pills (one visible) and an embedded host can hide Clean entirely. Every hidden pass streamed into a pane nobody could see, behind a 12px tab spinner. | A pass whose pane is not visible floats in `LiveRunWindow` — one per mandate, stable `instanceId` so a re-run rebinds instead of stacking. Switching to a pass's own tab closes its window (the pane is the better home when it is on screen). |
| `features/transcript-studio/redux/{runCleaningPass,runConceptPass,runModulePass,cleanRecording}.thunk.ts` — `/transcripts/studio`, `/transcripts/scribe` | All four passes launched `displayMode: "background"` and discarded the run; the column header spun a `RefreshCw` and segments appeared only when the whole pass finished. | Each thunk binds its conversation at `onConversationCreated` (`redux/liveRunWatch.ts`) and floats `liveRunWindow` for user-initiated causes; interval passes bind without stealing the screen and stay one click away via `<WatchRunButton>`. Batch re-clean narrates "Cleaning recording 2 of 7" into ONE window. Live-verified on a real session. |
| `features/education/{study/components/SessionDetailView.tsx,study/reviewRun.ts,tutor/lanes/reviewSession.ts}` — `/education/flashcards/sessions/[id]` | The holistic coach review was launched fire-and-forget on drill completion with its identity discarded; the detail page polled `getSession` every 3s for up to 2 minutes waiting for `session_review`. | The lane stamps a DURABLE handle (`metadata.ai.reviewRun` — conversationId + terminal status) the instant the conversation exists, and floats `LiveRunWindow` when the caller owns no window. The page reattaches to a live handle (`reconnectServerOperation`, cold-load), floats it, and reads the row once on terminal. Poll deleted; a pending review with no live run offers "Write my review" instead of an endless spinner. |
| `features/transcript-studio/{service/studioService.ts,redux/{liveRunWatch,reattachStudioRun,thunks}.ts}` + `features/transcription-cleanup/{hooks/useCleanupSession.ts,components/CleanupPad.tsx}` — `/transcripts/studio`, `/transcripts/scribe`, `/transcripts/cleanup` | **Class D, both transcript surfaces.** Run identity lived only in browser memory: nothing ever loaded `studio_runs`, the studio bound its conversation in Redux alone, and the cleanup pad wrote its run row at COMPLETION — so a reload mid-pass lost the column status, the watch door, and (in the pad) the output itself. | One shared primitive, `redux/reattachStudioRun.ts` (the `useSiteCommandRun` shape): the row is opened at LAUNCH and stamped with its conversation the moment one exists (`bindAgentRunConversation`), `listAgentRuns` + `fetchAgentRunsThunk` hydrate on load, and every row still running is rejoined via `reconnectServerOperation` (cold-load) into a floating `LiveRunWindow` that narrates real stages and hands back the finished text. The pad re-applies it to the container the run recorded in `metadata.target`; every row settles from SERVER truth, never a guess. A finished run's door opens its conversation instead of an empty live window. Live-verified end to end on `/transcripts/cleanup` (reload mid-run → rejoin → output restored → row `complete`) and `/transcripts/studio` (doors present on a cold load). |
| `features/marketing/discovery/youtube/{service.ts,YouTubeResearchActions.tsx}` | Minutes of AI work (watch → transcribe → analyze → check claims) narrated real phases and threw the stream body away. | `adoptForeignStream` + floated `LiveRunWindow`. Phase/info events still drive the stage line; content never goes through `onEvent`. |

### Verified compliant — do not re-audit

- **`features/marketing/content-plan/hooks/useRunStage.ts`** and every consumer
  (`SetupBridgeSection`): approximate stages over one-shot request/response
  endpoints — the platform's *sanctioned* fallback, documented in the file.
- **`features/rag/components/library/ProcessingProgressDialog.tsx`** (+
  `ProcessingJobView`, `StageAnimations`): a 4-stage AI pipeline that renders
  each page's **raw vs cleaned text** from its stage stream. This is the
  positive reference for multi-step — copy its shape. Its `setInterval`s are
  elapsed-time tickers, not polls.
- **`features/rag/api/stages.ts`** — `POST /rag/library/{id}/{stage}` streams
  `rag.stage.progress` with `page_clean` previews. The only streaming source
  the docproc clean pipeline exposes today (see the open item below).
- `(admin)`/`(dev)` `setInterval`s: events dashboard, sandbox infra health,
  scanner health, sync/popup/mermaid demos, webhook logs, local-shell polling —
  none awaits an AI result. The `api-tests` demos render their streams.
- `features/ai-runs/hooks/useAiTasks.ts` — a 10s refresh of a task LIST, not a
  run the user is waiting on.
- `features/agents/orchestras/run/useOrchestraMemberRunStatus.ts` — derived from wire
  events, explicitly never polled.

### Open — found, not fixed

- ~~The scanner's clean step cannot truly stream~~ — **DONE 2026-08-17,** both
  halves in one session. aidream's clean stage emits each page's ACTUAL cleaned
  text as it lands (`phase:"page"` + the `page_clean` preview, after persist);
  `createScanPdf` stopped breaking out of the stream at the scan result, so the
  pipeline's own events drive `ProcessingView` and the 2s poll (plus
  `fetchPageAnalysis` / `fetchCleanedPageText`) is deleted. The premise that the
  pipeline "runs detached" was already stale — it moved inline onto the save
  stream earlier; the client was still polling beside a live wire.
  Live-verified with a real scan.
- ~~A Transcript Studio pass that finishes while the page is away cannot be
  APPLIED~~ — **DONE 2026-08-17.** Every pass (cleaning, concept, module, and
  Scribe's recording-aligned clean) now stamps its replace-window onto
  `studio_runs.metadata.apply` at LAUNCH — the shape the cleanup pad already
  used with `metadata.target` — and `redux/studioApplyWindow.ts` replays it
  through the SAME persistence calls the live path makes (`applyCleanupRun` /
  `insertConceptItems` / `insertModuleSegments` + their slice actions). No new
  column (`studio_runs.metadata` is jsonb), no second recovery mechanism. A row
  with no stamped window — a pre-2026-08-17 run, or a module no longer
  registered — still settles `failed` with a sentence rather than inventing a
  segment placed at a guessed time.

## Remaining work — ranked by pain × reach

### 1. Marketing crawler commands — DONE 2026-08-11

All six callers now run through `features/marketing/data/useSiteCommandRun.ts`:
the stream drives the floating `SiteCommandRunWindow`, and a durable
`web.crawl_session` lookup rejoins a live run after a reload. The class-D
primitive was generalized in place (`listActiveCrawlSessions` +
`useSiteCrawlActivity.activeSessions`), not copied. Live-verified against
datadestruction.com across analysis, sitemaps, links, page fetch, and GSC.
See `features/marketing/FEATURE.md` change log (2026-08-11).

### 2. Education fleet — DONE 2026-08-11

All twelve surfaces stream. Default = the floating `LiveRunWindow` (mind map,
memory aids + the per-card memory hint, study planner, progress narrator,
verify-against-source, deepen-a-question, Ask-AI tutor help, end-of-session
review, grade-my-handwritten-work, every converter target). Inline
`LiveRunDisplay` in the two voice surfaces only — spoken practice
(design / grade / review) and audio-review grading — earned, because there the
wait IS the whole screen and a window over an empty voice screen is worse.
`microCoach` stays deliberately headless: nothing waits on it, it has no
loading state, its one-line tip arrives as a toast.

**It produced the primitives the rest of this list should use** — every call
site was writing the same ten lines:

- `useFloatingAgentRun` / `useFloatingRunWindow`
  (`features/agents/hooks/useFloatingAgentRun.ts`) — THE FLOATING LAW as hooks.
- `useLiveRunHandle` (`features/agents/hooks/useLiveRunHandle.ts`) — the
  component owns the instance of a run launched by a thunk.
- `livePosture(cb)` (`.../thunks/run-headless-agent-json.ts`) — the thunk half:
  direct + keepInstance + the callback, and NOTHING when no callback is passed,
  so a genuinely headless lane keeps its automatic teardown.

Live-verified with a real run on `/education/mind-maps/new`: the window opens
pending on click, streams, and the `diagram_spec` renders as its kind component
token-by-token.

### 3. Flashcards — DONE 2026-08-11

- **Generate from a document** (`CreateFromSource`) reads the same
  `flashcard_set` envelope `CreateFromTopic` does (Redux `selectKindEnvelope`
  only — no second parse session) and renders `LiveGenerationPreview`, so
  grounded cards appear card-by-card.
- **Enhance a card** (`enrichCard` / `expandCard` → `EnhanceSetDialog`): the
  thunks take an optional `onConversationCreated` and switch to the live
  posture only when a caller passes it; the dialog mounts `LiveRunDisplay`
  under the card being enhanced and owns the kept instances (released on
  re-run, save, discard, unmount).
- **Single-card voice test** (`runSpokenGrader` / `gradeSpokenAnswer` →
  `SingleCardVoiceTest`): same opt-in handle; the grade streams where the
  "Grading your answer…" pulser sat.

**FastFire's drill lane deliberately still does not stream its grades, and that
is correct** — `gradeCard.thunk` is fire-and-forget by design (REQUIREMENTS §7):
grading happens WHILE the learner speaks the next card, so surfacing the
previous card's grade would both leak the answer and fight the timer. What
`FastFireLiveCard` shows is a live count that decrements plus a live scoreboard,
not a dead spinner. Do not "fix" it.

`features/flashcards/data/quiz/makeQuizItems.ts` stays out of scope (headless
fallback distractor source, never rendered — see Class E below).

**Two things found while verifying live, both chipped, both still open:**

1. 🚨 **The card-by-card live preview does not work on EITHER generation
   surface — including `CreateFromTopic`, which this doc called the working
   exemplar.** Sampling page text every 1.5s across full real runs on
   `/education/flashcards/new` and `…/new/from-source`, the text sat flat at the
   "Generating N cards…" box for the whole ~15s run, then jumped to the finished
   set. `LiveGenerationPreview` never rendered. The runs succeed and persist
   correct cards, so the agents work — the `flashcard_set` envelope simply never
   reaches `selectKindEnvelope`. `CreateFromSource` is now wired identically to
   the exemplar and will light up the moment that path does, but **as of today
   both screens still show a spinner.** Do not re-cite `CreateFromTopic` as
   proof until this is fixed.

   **Diagnosed 2026-08-18 — it was TWO independent defects, and the first is
   FIXED.** Re-measured live on `/education/flashcards/new`, both halves
   proven with instrumentation rather than inference:

   - ✅ **THE WRAPPED-PAYLOAD CLASS (fixed, `abad51c24`).** The generator is a
     structured-output agent whose answer the artifact system wraps —
     `<artifact type="flashcards" …>` + a minified `{"__kind":"flashcard_set",…}`
     body (verified against the persisted `chat.message` row). The accumulator
     opened content-ir regions for **fences and bare JSON only**; an
     attribute-XML region swallowed every body line whole, and the XML-surface
     convergence hook is explicitly gated `!isAttrXml`. So no region, no
     `metadata.__ir`, and `selectKindEnvelope` answered null for the whole run
     AND after it. An attr-XML body that opens as JSON now feeds the kind parser
     exactly like a bare JSON region, fragment path included.
     **This is the same root cause as D170's `<image_prompt>` half** — fixing it
     in the canonical pipeline covers every wrapped payload, not just this one.
     Rendering is deliberately unchanged: `applyIrKindRoute` refuses to re-type
     an `artifact` block, so the artifact system keeps its renderer and its door
     to the Canvas; the envelope is data for selectors, not a route. Pinned with
     real production bytes: `__tests__/artifact-wrapped-payload-live-stream.test.ts`
     (envelope present mid-stream WITH CARDS, complete at the end, block still
     `type: "artifact"`).
   - ❌ **Nothing streams at all — still open, chipped.** With the envelope
     fixed the preview is *still* blank, because the run emits no chunks:
     logging the component's Redux read across a full run showed the request row
     present and `activeRequestId` correct throughout, but
     `renderBlockOrder.length === 0` for the entire ~15s run, jumping to 1 only
     at the end. No `upsertRenderBlock` fires mid-run. That is upstream of the
     envelope — agent/provider config or a post-hoc artifact wrap — and needs
     aidream. **The accumulator test proves the FE half produces mid-stream
     envelopes the moment chunks actually arrive.**
   - Also found: `generateFromSource`'s bound `output_schema` has **no `__kind`
     at all** and still uses the legacy `set_title` key, so `CreateFromSource`
     cannot produce a `flashcard_set` envelope even once streaming works.
     Folded into the same chip.
2. **The enrich / expand / spoken-grader agents emit kind-less JSON**, so their
   (now live) runs render a raw JSON code block — the exact developer artifact
   our non-technical user must never see. `EnhanceSetDialog` binds its display
   only while the run is in flight as an interim measure, so the JSON is
   replaced by its own rendered preview the moment one exists. The real fix is
   three earned kinds (Class E work).

**Not verified in a browser:** `SingleCardVoiceTest`'s grading stream needs a
real microphone recording, which the test harness cannot produce. The wiring is
the same opt-in handle proven live in `EnhanceSetDialog`; treat it as unproven
until someone speaks into it.

### 4. Research Outputs Studio — DONE 2026-08-11

Both cards ship. **SEO package**: new `seo_package` kind + `SeoPackageBlock`.
**Slide deck**: the EXISTING `presentation_deck` kind — no new kind; the agent
was rewritten to emit the envelope (schema-bounded: `theme.preset`,
string-valued `extra`, no `stat` layouts) and the card stopped hand-rendering
`<Slideshow>`. Each runs `useLiveAgentRun({ mandateKey })` into
`LiveRunWindowController` and replays its persisted asset through
`KindInstanceRender`. See `features/research/FEATURE.md`.

**D165 is FIXED** (landed with the slide deck): `contextAnchor` +
`organizationId` are top-level `ManagedAgentOptions`, threaded through
`launchAgentExecution` → create-instance → the conversation record →
`assembleRequest`. A class-A migration keeps its durable-entity anchor by passing
the same two values the one-shot runner took — **pass them**, don't silently drop
them.

`AnalysisList.tsx`'s hand-rendered stream is **GONE — 2026-08-17.** The fix was
not local, and was not made local: `useResearchStream` consumes the pipeline
`Response` itself, so the HOOK is now the thing that adopts
(`adoptForeignStream`, research domain events on `onEvent`, content from
`activeRequests`, `requestId` exposed to consumers). Every research operation —
search, scrape, analyze, synthesize, auto-tag, consolidate — rides the adopted
path; `AnalysisList` floats the run with `useFloatingLiveRun` keyed
`research-analyze-all:${topicId}`. See `features/research/FEATURE.md`.

### 5. Podcasts — DONE 2026-08-11 (all three), one payload question left for Arman

All three generators run through `useLiveAgentRun` into the floating
`LiveRunWindow`. Host: `features/podcasts/studio/components/EpisodeContentStudio.tsx`.

- **Articles (blog / show notes)** — **DONE 2026-08-11.** `useEpisodeArticles` runs on
  `useLiveAgentRun` (ONE hook instance per kind — blog and show notes can run at the
  same time, and a single hook holds a single conversation), floats one window per
  episode+kind, and resolves the mandate inside the canonical launcher. Live-verified on a
  real episode: window opens on click, phase moves, the article saves, the output
  survives completion.
  ✅ **RESOLVED 2026-08-18 — the original "plain markdown, no kind" verdict was wrong
  about the WIRE but right about the DESTINATION.** These agents were answering with a
  JSON envelope that `articleMarkdown.ts` flattened into markdown on arrival, and
  markdown is what `pc_articles` stores — so nothing in the product ever read the
  structure, and the window sat EMPTY for the whole run before painting raw JSON.
  Arman's call was to delete the JSON rather than author a kind (the Class E rule: a
  kind is earned only when the output is consumed STRUCTURALLY). Both agents now WRITE
  markdown, the window renders it as it streams, `articleMarkdown.ts` is deleted, and
  the blog's leading `# ` H1 owns its title and slug. Platform half:
  `runHeadlessAgentJson` gained `expect: "json" | "text"`. **D170 is closed.**
- ~~**Title options**~~ — **DONE 2026-08-11.** `episode_title_options` kind
  authored + activated, the agent (`podcast.title_optimizer` v4) emits the
  envelope, `useEpisodeTitleOptions` runs through `useLiveAgentRun` into the
  floating `LiveRunWindow`, and each streamed card applies itself through the
  `episode_title` surface write target. Live-verified: `pc_episodes.title`
  changed on a real run. See `features/podcasts/FEATURE.md`.
- ~~**Chapters**~~ — **DONE 2026-08-11.** `timeline` was checked for reuse and
  rejected (two-level roadmap with completion status vs a flat playback index),
  so `media_chapters` + `media_chapter` were authored, applied, ledgered, and
  activated through the real dual gate. `MediaChaptersBlock` is the one
  component and the panel's hand-rolled `<ol>` is gone; the agent
  (`podcast.chapter_marker` v6) emits the envelope; `useEpisodeChapters` runs
  through `useLiveAgentRun` into the floating `LiveRunWindow`.
  **Carry this forward to every remaining kind item here:** a real production
  run proved the model emits keys in the schema's **declared property order**,
  so a bound `output_schema` must put `__kind` FIRST — the canonical emitter
  puts it last, and a discriminator that arrives last means the window cannot
  route until the run is over. The prompt asking for it first does not fix it.
  Verified on PRODUCTION (v0.4.460) rather than localhost, which was unusable
  (D168): floating window, no page shift, component render not raw JSON, and
  the persisted list intact through a reload.
  See `features/podcasts/FEATURE.md`.

### 6. Page-shifting live blocks — DONE 2026-08-11

All three floated. `/marketing/keyword-research`, `…/sites/[siteId]/authority`,
and `…/sites/[siteId]/reputation` no longer insert a live block above the
keyword table / KPI band / brief.

The migration is one hook — **`useFloatingLiveRun`**
(`features/overlays/openers/liveRunWindow.tsx`), the canonical replacement for
an inline `LiveRunDisplay` that sits above a host's own content. It opens the
window on the run's false→true edge (pending, before a requestId exists), pushes
the handle in when it lands, and re-binds the SAME window on a remount because
the `instanceId` is stable. `KeywordResearchLauncher` gained
`liveFeed="inline" | "floating"` so its window and bottom-of-page tab hosts keep
their (compliant) inline feed.

**The trap this exposed, verified live on `/marketing/keyword-research`:** the
first version closed the window on unmount, and the window vanished at the exact
moment the content completed — the results refetch remounts the launcher. **A
floating run window must never auto-close**, not on completion and not on
unmount; it is ephemeral, it has a close button, and a long run should keep
streaming while the user works elsewhere.

**Verified compliant, do not touch:** `CompetitorAutopsyWorkspace.tsx:322`
(gated to `status === "running"`, sits below the launcher card and above only
historical output) and `KeywordResearchTab.tsx:267` (renders at the bottom).
AI Visibility was reclassified after live use exposed its page-shifting block and two
stacked spinners: `useAiVisibility` now opens one stable `LiveRunWindow` before launch,
and `AiVisibilityWorkspace` has no inline run block or loading icon.

~~Still open here: `useKeywordResearch`'s unmount reap~~ — **RESOLVED 2026-08-13/14** by the
retention seams (`LIVE_RUN_RETENTION.md`): owner reaps defer while any viewer holds the row,
`createRequest` is non-destructive, every adopter aborts before reaping, and keyword research
runs live in the `runSets` slice with an epoch guard so stale streams cannot stomp the active
run. Guard tests: `request-viewer-retention.test.ts`, `run-sets.test.ts`.

### 7. Marketing miscellaneous — DONE (image runs + agent sets 2026-08-11; the 3 server-blocked 2026-08-17)

- ~~`features/marketing/lib/generate-page-image.ts`~~ — **DONE.** The shared
  `runHeadlessAgent` shell (consumed by the image plan card, the site media desk, and
  `generate-video-metadata.ts`) took a `live: {instanceId, label}` option, so every path
  floats. The two-step pipeline drives ONE window: "Writing the image prompt" →
  "Rendering the image". The instance is held past completion (the next run releases it)
  so the finished image does not vanish the moment it lands, and a launch that dies
  before a stream closes its own window instead of hanging on "pending".
  Live-verified on `…/sites/[siteId]/media`: both steps re-bound one window and the
  generated image rendered inside it. Callers pass a per-subject `liveInstanceId`
  (`page-image:${entry.id}` / `site-media-image:${site.id}`) so two orders give two
  windows. `generate-video-metadata.ts` inherits the capability but has not been opted
  in — one line when someone touches it.
- ~~Agent sets~~ — **DONE.** The sweep's claim that
  `agent-sets/orchestrator/thunks.ts:153` "launches EVERY set member" is **wrong**: that
  line is ONE describer pass over the whole set ("Sync agent listings"), and the actual
  multi-member set RUN already streams — `OrchestraRunPanel` embeds the canonical
  `AgentRunnerPage` and `useOrchestraMemberRunStatus` lights each member on the canvas as it
  executes. The real offender was the describer, a multi-minute pass with up to 3 silent
  retries behind the button's spinner. It now runs `direct` into one window per set
  (`agent-set-sync:${orchestratorId}`), each retry re-binding that window under a
  "retry N of 3" label, and the finished description is held so it survives completion.
  Live-verified on a real set: streamed, completed, both members got roles.
- ~~`SiteStrategyCard.tsx` and `KeywordDataQualityPanel.tsx` — server-blocked~~ —
  **DONE 2026-08-17, both repos in one session.** aidream turned all three routes
  (`/seo/keywords/classify`, `/seo/keywords/assign-topics`,
  `/seo/sites/strategy-interview`) into durable streamed commands on the EXISTING
  `SeoCommandRun` + `run_streamed_command` funnel — real milestones (eligible set,
  batch plan, the phrases in flight, what landed) plus the agent's own tokens
  (`stream_output=True`), result persisted on the run row, rejoin by run id.
  Here, the `live` option was added to the canonical
  `features/marketing/seo/durable-run/useSeoCommandRun.ts` (adopt +
  `useFloatingLiveRun`) and the three surfaces consume it. No invented stages.
  **Read this before copying the pattern:** it also exposed **D209** — an adopted
  stream's output blanks in the window at settle, because the settled renderer
  wants `serverProcessedBlocks` a system run never sends. Live rendering is
  correct; only the finished frame is lost, and every adopted-stream surface has
  it. Chipped, with an exact repro in FOUND_DEFECTS.md.

### 8. Refresh-fragility — CLOSED 2026-08-17 (four SEO surfaces + both expertise dialogs)

**One primitive now serves both domains: `lib/durable-run/useDurableRun.ts`.**
`useSeoCommandRun` and `features/expertise/durable-run/useExpertiseRun.ts` are
thin faces over it that carry only their domain's wire vocabulary. A third
domain adds a `DurableRunWire`, never a third hook — a second copy of this
machinery would be the second durability mechanism the whole design exists to
prevent. Its server twin is the same story: the replay channel moved out of
`services/seo/command_runs.py` into `aidream/services/durable_runs.py`, and both
domains subscribe to it.

**The four SEO surfaces are done.** They consumed a durability that already
existed server-side and was simply never used: every SEO command claims a
`seo.collection_run` row BEFORE its first paid/AI call, announces the id as
`seo.command_run`, and runs under `detach_on_disconnect=True` — so the work
never stopped, only delivery did. The hook remembers that id, rejoins on load,
and settles from server truth. It also KEEPS a finished run's receipt, because
losing the answer to a refresh is the same defect as losing the run.

- `usePageAnalyzer.ts` → `PageWorkspace.tsx` / `cards/PageAnalyzerCard.tsx`
  (the card says a rejoined analysis kept running while the page was away).
- `PageAuditTool.tsx`, `RobotsTesterTool.tsx`, `StructuredDataValidatorTool.tsx`.

🚨 **The anonymous half needed an aidream route and got one.** Measured against
production: a guest CAN create a run (`/seo/public/*` is guest-or-above, and a
guest is an ordinary fingerprint-minted `auth.users` row) but `POST
/seo/collections/{run_id}/rejoin` answered it **401 `token_required`** — its
router is mounted behind `require_authenticated`. Added `POST
/seo/public/runs/{run_id}/rejoin` (aidream `api/routers/seo_public_tools.py`):
the same `rejoin_stream`, the same `collection_run_readable` ownership check,
guest-or-above gate. **Every consumer uses that one path, signed in or not** —
ownership, not the gate, is what keeps a run private.

**Live-verified** on `/seo/page-audit`: run an audit, reload, and the finished
score came back from the durable row. The guest path was re-measured against
production after the route deployed — a fingerprint-only caller creates a run
and then rejoins it by id, **200 where it was 401** (2026-08-17).

Two things are NOT verified and should not be claimed: the page analyzer with a
live run (its card needs a page with an accepted snapshot — it consumes the
identical primitive), and the signed-out flow **through the UI**. The latter is
a local-dev limitation, not a product gap: a guest client resolves the backend
to `http://localhost:8000` (the production target is an admin-only override), so
a signed-out audit cannot reach a real server from the dev harness. The guest
half is proven at the API layer with a real fingerprint identity, and the
reload→restore cycle is proven in the same component signed in.

**The two expertise dialogs are done** (`CompileDeskDialog.tsx`,
`IngestSourceDialog.tsx`). They were blocked because the expertise pipelines
claimed NO durable run row — nothing to remember or rejoin by. That ledger now
exists: **`platform.expertise_run`**, a COMPONENT of its pack (access IS the
pack's access, so no `created_by` in any policy), claimed before the first AI
call, heartbeating, persisting terminal status/error/result;
`aidream/services/expertise_runs.py` owns it and
`POST /expertise-desks/runs/{run_id}/rejoin` serves it. The run id is the first
stream event (`expertise_run`); a rejoin either replays the live channel or
emits one `expertise_run_snapshot`. The interim "don't start it again" copy is
gone from both dialogs — they can genuinely rejoin now, and a dialog whose run
is still going **reopens itself** after a reload rather than rejoining behind a
closed dialog. See `features/expertise/FEATURE.md`.

A pipeline wraps its emitter rather than threading a run object through every
send site — `compile.py` alone emits progress from a dozen helpers, and a
mechanical rewrite of all of them would have been the risky half of this change.

**Live-verified** against a real local aidream + the live DB, not mocks: started
an ingest on `/expertise/[id]`, hard-reloaded mid-run, watched the dialog reopen
itself and report "Picking this back up — it kept reading while you were away",
then settle on the true outcome ("15 suggested rules added as drafts") matching
the durable row. Also verified: a finished run's answer restored after a reload,
a disconnect-then-rejoin over raw HTTP (live replay AND durable snapshot), a
crashed run persisted as `failed` with its error, 401 without auth, 404 for an
unreadable run.

### 9. Guard

Nominate "spinner-while-AI-works" as a pattern patrol (already logged in
`.matrx/PATROL_SIGHTINGS.md`). A static heuristic is plausible: a component that
calls `useHeadlessAgentJson().run` / `launchAgentExecution` and renders no
`LiveRunDisplay` / `MarkdownStream requestId` is a smell. Probably patrol-only —
the false-positive rate on genuinely headless plumbing is high.

---

## Verified compliant — do not re-audit

- `KeywordResearchLauncher` + its three hosts (Workbench, `KeywordResearchWindow`,
  `KeywordResearchTab`) all render the adopted stream. Only the Workbench's
  *placement* is a finding (§7).
- `features/content-ir/react/actions/KindAgentActionButton.tsx:78` — the spinner
  covers launch only; the handler defaults to `displayMode: "modal-full"`
  (`handlers/trigger-agent.ts:47`), so the run opens with visible output.
- `NewCrawlWorkspace.tsx` — the class-D reference implementation.
- Content-plan surfaces, `AssessmentCreate`, `CreateFromTopic`, `ShapeTestTab`.

## Class E — resolved 2026-08-11, no open decision

**Text does not need a kind.** `MarkdownStream` in a window panel renders
anything — plain markdown, and any content-IR envelope it encounters routes to
the registered component or artifact automatically. Unknown text is not ugly; it
is beautiful when rendered through the canonical pipeline. A kind is earned only
when the output is consumed STRUCTURALLY (persisted to typed columns, driving a
player, powering a pick-one interaction) — and then it is a full end-to-end job:
schema, agent instructions updated, every usage moved to the latest version,
kind + component registered, tested live. That is a focused session, never a
note.

Each of the six was read in code. Verdicts:

| Item | Verdict |
|---|---|
| Podcast articles (blog / show notes) — `useEpisodeArticles.ts` | **Text — no kind.** The agent returns markdown, already held in `drafts`. Fix is the §6 class-B migration plus `MarkdownStream`, nothing more. |
| Flashcard quiz items — `makeQuizItems.ts` | **Not applicable — removed from the sweep.** It is the optional FALLBACK distractor source for sets too small to have sibling cards; the result feeds `buildQuizQuestions` and is never rendered. Genuinely headless plumbing. |
| Research slide deck — `OutputsStudio.tsx` | **DONE 2026-08-11.** The kind already existed, so this was a MIGRATION: agent v3 emits the `presentation_deck` / `presentation_slide` envelope (schema-bounded — `theme.preset`, string-valued `extra`, no `stat` layouts, because `extra` is `record<string>`), the mandate declares `output_kind` and is `use_latest` so no rebind was needed, and the card runs live into the floating window. Verified on a real run: 12 slides, `Minimal` preset, no page shift. |
| Research SEO package — `OutputsStudio.tsx:1215` | **DONE 2026-08-11.** Kind `seo_package` (+ child `faq_item`) authored, activated through `content_ir.set_kind_activation`, and consumed. The character-limit UX moved onto the kind component and gained a VERDICT (too long / too short / inside the window) instead of a bare count. |
| Podcast chapters — `useEpisodeChapters.ts:49` | **DONE 2026-08-11** — `media_chapters` kind, `timeline` rejected as a near-duplicate. See §5. |
| Podcast title options — `useEpisodeTitleOptions.ts:70` | **DONE 2026-08-11.** Kind `episode_title_options` shipped end to end (schema + component + dual gate, agent v4, live posture, real-run verification). It went further than the precedent: the apply is a surface WRITE, not an agent launch, and the target is a component constant rather than payload data — see `features/content-ir/FEATURE.md`. |

One focused session remains as a chip (podcast chapters); **title options, the
SEO package, and the slide deck all shipped 2026-08-11**. Each carries the full end-to-end contract: schema, agent
instruction rewrite via `agent_author`, every usage rebound, kind + component +
dual-gate example, live posture, real end-to-end test. **Do not start one of
these inline in a sweep session** — that is how a half-authored kind ships.
