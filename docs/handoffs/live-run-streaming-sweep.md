---
status: active
updated: 2026-08-12
repos: [matrx-frontend]
vision: [features/window-panels/FEATURE.md]
---

# THE FLOATING LAW — ranked offender inventory

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

| Class | Meaning | Count |
|---|---|---|
| **A** | Spinner-only, stream handle already available (`requestId` / `conversationId` / ignored `onEvent`) | **31 surfaces** (Transcript Studio's 4 fixed 2026-08-11) |
| **B** | Spinner-only, no stream handle yet — needs `adoptForeignStream` or a `useRunAgent`→`useLiveAgentRun` migration first | **5** |
| **C** | Page-shifting live-run block (live output above the page's own content) | **0 — all 3 fixed 2026-08-11** |
| **D** | Dies on refresh — run held by an in-tab `await`, navigating away aborts it | **12** (11 overlap A; 6 done — §1) |
| **E** | Needs a content-IR kind before it can stream well — **title options, the SEO package, and the slide deck all shipped 2026-08-11**; only podcast chapters remain | **1** |

Fix costs below: **S** ≈ 15 min (the two-line recipe), **M** ≈ 1–3 h, **L** ≈ a day+.

## Resources

- Primitives: **`useFloatingAgentRun` / `useFloatingRunWindow` (start here —
  they ARE the recipe), `useLiveRunHandle` + `livePosture()` for a
  thunk-launched run**, and underneath them `useLiveAgentRun`,
  `<LiveRunDisplay>`, `adoptForeignStream`, `useOpenLiveRunWindow()`.
  Recipe + traps: `live-stream-everywhere.md`.
- Reference for a class-B/E migration done whole:
  `features/podcasts/generator/useEpisodeTitleOptions.ts` (2026-08-11) — open
  the window BEFORE the launch, run the slot through `useLiveAgentRun`, and
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
| `features/transcription-cleanup/components/CleanupPad.tsx` — `/transcripts/cleanup` | "record → auto-clean → refine with ANY number of agents" fires up to 4 runs at once, but custom slots are tab pills (one visible) and an embedded host can hide Clean entirely. Every hidden pass streamed into a pane nobody could see, behind a 12px tab spinner. | A pass whose pane is not visible floats in `LiveRunWindow` — one per slot, stable `instanceId` so a re-run rebinds instead of stacking. Switching to a pass's own tab closes its window (the pane is the better home when it is on screen). |
| `features/transcript-studio/redux/{runCleaningPass,runConceptPass,runModulePass,cleanRecording}.thunk.ts` — `/transcripts/studio`, `/transcripts/scribe` | All four passes launched `displayMode: "background"` and discarded the run; the column header spun a `RefreshCw` and segments appeared only when the whole pass finished. | Each thunk binds its conversation at `onConversationCreated` (`redux/liveRunWatch.ts`) and floats `liveRunWindow` for user-initiated causes; interval passes bind without stealing the screen and stay one click away via `<WatchRunButton>`. Batch re-clean narrates "Cleaning recording 2 of 7" into ONE window. Live-verified on a real session. |
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
- `features/agents/agent-sets/run/useSetMemberRunStatus.ts` — derived from wire
  events, explicitly never polled.

### Open — found, not fixed

- **`features/education/study/components/SessionDetailView.tsx:158`** — the
  FastFire holistic coach review is launched fire-and-forget when the drill
  completes; this page then polls `studyService.getSession` every 3s for up to
  **2 minutes** waiting for `session_review` to land. A textbook
  poll-the-DB-for-an-AI-result. **Not fixable here:** the launcher discards the
  run's identity, and the learner can arrive after it started, so the fix needs
  a DURABLE handle (persist the conversation/request id on the session row, then
  reattach + float on load) — the `useSiteCrawlActivity` shape, class D. Chip it.
- **The scanner's clean step still cannot truly stream.** The pipeline runs
  detached server-side after `/pdf/from-images` returns and exposes no
  client-reachable stream, so reading its rows as it writes them is the ceiling.
  The real upgrade is an aidream change: emit the docproc clean pipeline as a
  stream (it already has the shape — `rag.stage.progress` / `page_clean`), then
  the scanner adopts it and the poll dies. Cross-repo, own session.
- **Transcript Studio runs are never loaded from the DB.** Nothing dispatches
  `runsLoaded` and there is no `listAgentRuns` — so column run status AND the
  new watch door are in-memory only, and a refresh mid-pass loses both. Class D,
  pre-existing, found while fixing §3. Logged in `FOUND_DEFECTS.md`.
- **A refresh still kills a cleanup pass.** `useAiPostProcess` holds its
  conversationId in local state; reload mid-run and the output is lost (the
  persist happens client-side on completion). Class D, unchanged by this pass.
- **Consolidation candidate:** a parallel session landed
  `features/agents/hooks/useFloatingAgentRun.ts` (`useFloatingRunWindow`) — a
  *launch-time* float primitive. CleanupPad needed a *visibility-gated* float
  (float only while the run's own pane is off screen), which that hook does not
  express, so it carries a local `syncFloatingRun`. Fold one into the other once
  both are committed.

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
`<Slideshow>`. Each runs `useLiveAgentRun({ slotKey })` into
`LiveRunWindowController` and replays its persisted asset through
`KindInstanceRender`. See `features/research/FEATURE.md`.

**D165 is FIXED** (landed with the slide deck): `contextAnchor` +
`organizationId` are top-level `ManagedAgentOptions`, threaded through
`launchAgentExecution` → create-instance → the conversation record →
`assembleRequest`. A class-A migration keeps its durable-entity anchor by passing
the same two values the one-shot runner took — **pass them**, don't silently drop
them.

Still open on this file: `AnalysisList.tsx:703` truncates its live stream to 200
characters.

### 5. Podcasts — DONE 2026-08-11 (all three), one payload question left for Arman

All three generators run through `useLiveAgentRun` into the floating
`LiveRunWindow`. Host: `features/podcasts/studio/components/EpisodeContentStudio.tsx`.

- **Articles (blog / show notes)** — **DONE 2026-08-11.** `useEpisodeArticles` runs on
  `useLiveAgentRun` (ONE hook instance per kind — blog and show notes can run at the
  same time, and a single hook holds a single conversation), floats one window per
  episode+kind, and resolves the slot inside the canonical launcher. Live-verified on a
  real episode: window opens on click, phase moves, the article saves, the output
  survives completion.
  🚨 **The "plain markdown, no kind" verdict recorded here was WRONG at the wire.**
  These agents answer with a JSON envelope (`{title, intro, sections[], resources[]}` /
  `{key_takeaways[], topics[], links[], people[]}`) — `articleMarkdown.ts` exists
  precisely to assemble the markdown client-side. So the window sits EMPTY for the whole
  run and paints raw JSON at the end: no spinner, but nothing to watch. Filed as **D170**
  (which also covers the same symptom on the marketing image-prompt step). Whether these
  two agents earn a kind is **Arman's call** — do not start it inline in a sweep.
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

**Still open here, found while verifying:** `useKeywordResearch`'s unmount
effect calls `removeRequest(adoptedRequestId)`, so a HOST REMOUNT (not just
leaving the page) reaps the adopted row out from under anything still bound to
it. The inline feed hid this behind its saved-artifact fallback; a floating
window shows it as an empty box. Chip it with the class-D durability work.

### 7. Marketing miscellaneous — image runs + agent sets DONE 2026-08-11; 3 server-blocked

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
  multi-member set RUN already streams — `SetRunPanel` embeds the canonical
  `AgentRunnerPage` and `useSetMemberRunStatus` lights each member on the canvas as it
  executes. The real offender was the describer, a multi-minute pass with up to 3 silent
  retries behind the button's spinner. It now runs `direct` into one window per set
  (`agent-set-sync:${orchestratorId}`), each retry re-binding that window under a
  "retry N of 3" label, and the finished description is held so it survives completion.
  Live-verified on a real set: streamed, completed, both members got roles.
- `SiteStrategyCard.tsx:106` and `KeywordDataQualityPanel.tsx:99,211` — **verified: all
  three ARE AI runs, not plain saves.** They POST to `/seo/sites/strategy-interview`,
  `/seo/keywords/classify` and `/seo/keywords/assign-topics`, each of which runs a system
  agent inside the request (the classifier measures ~88s for 40 keywords). **Not
  fixable from here:** these are synchronous JSON endpoints with no stream to adopt, so
  the FE has nothing to bind — the work is server-side in aidream (stream the route, or
  emit phase/info milestones the way content_plan `_progress` does), then adopt with
  `adoptForeignStream`. Do NOT paper over it with invented client-side stages.

### 8. Refresh-fragility only (stage narration is present) — D, M each

These narrate real stages, which the law permits, but the run is an in-tab
`await` — navigate away and it is gone with nothing persisted.

- `features/marketing/components/pages/usePageAnalyzer.ts:92` → `PageWorkspace.tsx`, `cards/PageAnalyzerCard.tsx` (`…/sites/[siteId]/pages`)
- `features/expertise/components/detail/CompileDeskDialog.tsx:86`, `IngestSourceDialog.tsx:79`
- `features/marketing/seo/public-tools/PageAuditTool.tsx:70` (`/seo/page-audit`, **anonymous traffic**), plus `RobotsTesterTool.tsx`, `StructuredDataValidatorTool.tsx`

Lowest priority: runs are short and the stage line means the user is not staring
at nothing.

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
| Research slide deck — `OutputsStudio.tsx` | **DONE 2026-08-11.** The kind already existed, so this was a MIGRATION: agent v3 emits the `presentation_deck` / `presentation_slide` envelope (schema-bounded — `theme.preset`, string-valued `extra`, no `stat` layouts, because `extra` is `record<string>`), the slot declares `output_kind` and is `use_latest` so no repin was needed, and the card runs live into the floating window. Verified on a real run: 12 slides, `Minimal` preset, no page shift. |
| Research SEO package — `OutputsStudio.tsx:1215` | **DONE 2026-08-11.** Kind `seo_package` (+ child `faq_item`) authored, activated through `content_ir.set_kind_activation`, and consumed. The character-limit UX moved onto the kind component and gained a VERDICT (too long / too short / inside the window) instead of a bare count. |
| Podcast chapters — `useEpisodeChapters.ts:49` | **DONE 2026-08-11** — `media_chapters` kind, `timeline` rejected as a near-duplicate. See §5. |
| Podcast title options — `useEpisodeTitleOptions.ts:70` | **DONE 2026-08-11.** Kind `episode_title_options` shipped end to end (schema + component + dual gate, agent v4, live posture, real-run verification). It went further than the precedent: the apply is a surface WRITE, not an agent launch, and the target is a component constant rather than payload data — see `features/content-ir/FEATURE.md`. |

One focused session remains as a chip (podcast chapters); **title options, the
SEO package, and the slide deck all shipped 2026-08-11**. Each carries the full end-to-end contract: schema, agent
instruction rewrite via `agent_author`, every usage repinned, kind + component +
dual-gate example, live posture, real end-to-end test. **Do not start one of
these inline in a sweep session** — that is how a half-authored kind ships.
