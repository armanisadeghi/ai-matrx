---
status: active
updated: 2026-08-11
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
| **A** | Spinner-only, stream handle already available (`requestId` / `conversationId` / ignored `onEvent`) | **31 surfaces** |
| **B** | Spinner-only, no stream handle yet — needs `adoptForeignStream` or a `useRunAgent`→`useLiveAgentRun` migration first | **5** |
| **C** | Page-shifting live-run block (live output above the page's own content) | **3** |
| **D** | Dies on refresh — run held by an in-tab `await`, navigating away aborts it | **12** (11 overlap A) |
| **E** | Needs a content-IR kind before it can stream well — 4 confirmed (2 of the original 6 resolved as text/headless, see below); **title options shipped 2026-08-11** | **3** |

Fix costs below: **S** ≈ 15 min (the two-line recipe), **M** ≈ 1–3 h, **L** ≈ a day+.

## Resources

- Primitives: `useLiveAgentRun`, `<LiveRunDisplay>`, `adoptForeignStream`,
  `useOpenLiveRunWindow()`. Recipe + traps: `live-stream-everywhere.md`.
- Reference for a class-B/E migration done whole:
  `features/podcasts/generator/useEpisodeTitleOptions.ts` (2026-08-11) — open
  the window BEFORE the launch, run the slot through `useLiveAgentRun`, and
  let the kind component carry the action so the window is the primary
  surface rather than a preview of one.
- Reference implementation for class D done right:
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

## Coverage — what this sweep did NOT cover

**Multi-step AI pipelines were not systematically audited.** This sweep searched
for a spinner next to a single agent/pipeline call. Pipelines that show a step
counter, a stage list, a progress bar, or POLL the DB for completion were not
swept — and Arman's rule covers every step of them, not just the last one.
Two confirmed offenders found while checking:
`features/transcription-cleanup/components/CleanupPad.tsx` (7 spinners over
record → auto-clean → refine-with-N-agents) and
`features/pdf/scanner/components/ProcessingView.tsx` (the "AI clean" step is a
DB poll for per-page counts). **A dedicated chip owns finishing that sweep.**

Every section below is chipped to a focused session. The chips are the delivery
mechanism — this doc is only the target list.

## Remaining work — ranked by pain × reach

### 1. Marketing crawler commands — the whole family discards its NDJSON stream — A + D, M each

Every one of these already receives a live NDJSON progress stream and throws it
away, then dies if the user reloads. This is the single largest cluster and it
sits on the highest-traffic marketing routes.

| File:line | Route | Command |
|---|---|---|
| `features/marketing/components/analysis/CatalogueAnalysisPanel.tsx:64` | `/marketing/brands/[brandId]/sites/[siteId]/audit` and `…/capabilities` | `analyzeSite(site.id)` — **no callbacks at all**; spinner at `:115` |
| `features/marketing/components/sitemaps/SitemapsWorkspace.tsx:135` | `…/sites/[siteId]/sitemaps` | `syncSitemaps` |
| `features/marketing/components/inspection/link-graph/ExternalLinksView.tsx:226` | `…/sites/[siteId]` link inspection (via `LinksInspectionTable`) | `checkSiteLinks` |
| `features/marketing/components/integrations/SiteIntegrationsWorkspace.tsx:744` | `…/sites/[siteId]/integrations` | `syncGsc` |
| `features/marketing/components/pages/PagesTable.tsx:636` | `…/sites/[siteId]/pages` | `fetchPageNow` |
| `features/marketing/components/pages/FetchPageButton.tsx:40` | `…/sites/[siteId]/pages` | `fetchPageNow` |

**Fix:** pass `onEvent` and drive `LiveCrawlFeed` (or `LiveRunDisplay` where the
payload is agent output). Then the D half: persist the run the way
`useSiteCrawlActivity` does and reattach on mount, so a reload rejoins instead
of showing a blank panel. `SiteOverview.tsx:143` already passes `onEvent` —
copy that shape.

**Effort:** M each for the A half; the D half is one shared M once
`useSiteCrawlActivity` is generalized past crawls.

### 2. Education fleet — 12 spinner-only agent runs — A, S each

All use `useHeadlessAgentJson` / `runHeadlessAgentJson` and render zero live
output. Each is the two-line `useLiveAgentRun` + `<LiveRunDisplay>` migration.

| File:line | Route |
|---|---|
| `features/education/media/mindmap/components/MindMapNew.tsx:203` | `/education/mind-maps/new` |
| `features/education/study/planner/components/StudyPlanView.tsx:344,400,442` | `/education/admin` (planner host) |
| `features/education/study/analytics/components/StudyAnalyticsDashboard.tsx` | `/education/progress` |
| `features/education/assessment/components/edit/AssessmentEdit.tsx:281` | `/education/quizzes/[id]/edit`, `/education/practice-tests/[id]/edit` |
| `features/education/memory/components/MemoryNew.tsx:198` | `/education/memory/new` |
| `features/education/memory/components/MemoryAidButton.tsx:75` | `/education/admin` |
| `features/education/trust/components/VerifyAgainstSourceButton.tsx:66` | wherever trust chips render |
| `features/education/assessment/components/HandwrittenWorkInput.tsx` | `/education/grade-work` |
| `features/education/spoken-practice/components/PracticeRunner.tsx:79,90,160` | spoken-practice runner |
| `features/education/media/audio/components/AudioReviewSession.tsx:483` | `/education/audio-study/review` |
| `features/education/tutor/lanes/{helpLive,microCoach,reviewSession}.ts` | tutor lanes (host: `StudyDeck`) |
| `features/education/convert/runAgentExtraction.ts` | conversion flows |

**Exemplar already fixed:** `features/education/assessment/components/create/AssessmentCreate.tsx`.

### 3. Transcript Studio — four passes launch in the background, output appears only at the end — A, M

`launchAgentExecution({ displayMode: "background" })` — the `requestId` exists
and is discarded.

- `features/transcript-studio/redux/runCleaningPass.thunk.ts:119` → `features/transcript-studio/components/columns/CleanedTranscriptColumn.tsx:105`
- `features/transcript-studio/redux/runConceptPass.thunk.ts:145` → `.../columns/ConceptsColumn.tsx:129`
- `features/transcript-studio/redux/runModulePass.thunk.ts:156` → `.../columns/ModuleColumn.tsx:103`
- `features/transcript-studio/redux/cleanRecording.thunk.ts:143` → `.../scribe/SessionTranscriptViewer.tsx:65`, `.../scribe/FullTranscriptDrawer.tsx:60`

Routes: `/transcripts/studio/[sessionId]`, `/transcripts/scribe`.

**Fix:** return the `requestId` from each thunk, hold it in the session slice,
and render `<LiveRunDisplay requestId>` in the owning column. These are long
runs on a page the user watches — high pain per occurrence.

### 4. Flashcards — 4 spinner-only runs — A, S–M

- `features/flashcards/data/enhanceCard.ts` → `.../components/set-detail/EnhanceSetDialog.tsx`
- `features/flashcards/fast-fire/agents/gradeCard.thunk.ts`, `.../grading-core.ts` → `FastFireLiveCard.tsx`, `SingleCardVoiceTest.tsx`
- `features/flashcards/data/useGenerateCards.ts` → `.../create/CreateFromSource.tsx` (`CreateFromTopic` already uses the progressive-kind pattern — copy it)

Route family: `/education/flashcards/*`, `/education/fastfire`.

### 5. Research Outputs Studio — slides + SEO cards — A + E, M

`features/research/components/outputs/OutputsStudio.tsx:1058` (`GeneratingNote`)
is the shared spinner for the Slides and SEO-card generators.
Route: `/research/topics/[topicId]/outputs`.

Blog generation on the same page already streams (`:930`), so the contrast is
visible to the user inside one screen. Both payloads are structured JSON → the
`selectKindEnvelope` progressive-kind pattern. **Both are chipped (class E):**
slides binds to the EXISTING `presentation_deck` kind; the SEO package needs a
new kind. See "Class E — resolved" below.

Also on this file: `AnalysisList.tsx:703` truncates its live stream to 200
characters — unfix it while here.

### 6. Podcasts — three generators, silent by design — B (+E for two), S–M each

`useEpisodeArticles.ts:67` and `useEpisodeChapters.ts:49` still use
`useRunAgent`, which **produces no `requestId` at all** — live rendering is
structurally impossible from it, so this is class B: migrate to
`useLiveAgentRun` first.
Hosts: `features/podcasts/studio/components/{EpisodeContentStudio,EpisodeChaptersPanel}.tsx`.

They split three ways once the payloads were actually read:

- **Articles (blog / show notes) — plain markdown.** No kind, no schema. The
  hook already holds the assembled markdown in `drafts`; migrating to
  `useLiveAgentRun` and streaming it is the WHOLE fix. **S.**
- ~~**Title options**~~ — **DONE 2026-08-11.** `episode_title_options` kind
  authored + activated, the agent (`podcast.title_optimizer` v4) emits the
  envelope, `useEpisodeTitleOptions` runs through `useLiveAgentRun` into the
  floating `LiveRunWindow`, and each streamed card applies itself through the
  `episode_title` surface write target. Live-verified: `pc_episodes.title`
  changed on a real run. See `features/podcasts/FEATURE.md`.
- **Chapters** — timestamped segments persisted to `pc_episodes.chapters`,
  used to seek the player. Kind required (check `timeline.ts` for reuse).
  **Chipped.** (A `media_chapters` kind has since appeared in
  `system-kinds.ts` — check whether that chip already landed before starting.)

### 7. Page-shifting live blocks — C, S each

The live block sits above the page's own results and pushes them down the
instant a run starts.

| File:line | Route | Note |
|---|---|---|
| `features/marketing/seo/keyword-research/components/KeywordResearchWorkbench.tsx:510` | `/marketing/keyword-research` | Hosts `KeywordResearchLauncher` in a top bar; the launcher's live feed (`KeywordResearchLauncher.tsx:197`) expands on run and pushes the keyword table down. **The streaming itself is correct** — only the placement violates. |
| `features/marketing/authority/AuthorityRouterWorkspace.tsx:175` | `…/sites/[siteId]/authority` | `LiveRunDisplay` above the KPI band and every result section |
| `features/marketing/components/reputation/ReputationWorkspace.tsx:527` | `…/sites/[siteId]/reputation` | `LiveRunDisplay` above `<KpiBand>` and the brief |

**Fix:** float it — `useOpenLiveRunWindow()` on run start — or move the block
below the results so the page only grows downward. The inline exception has to
be *earned*; none of these three is purpose-built enough to qualify.

**Verified compliant, do not touch:** `CompetitorAutopsyWorkspace.tsx:322`
(gated to `status === "running"`, sits below the launcher card and above only
historical output) and `AiVisibilityWorkspace.tsx:599` (inside the run section,
with a real empty-state). `KeywordResearchTab.tsx:267` renders at the bottom.

### 8. Marketing miscellaneous — A, S–M

- `features/marketing/lib/generate-page-image.ts` — background image run, holds
  a `requestId` (`:113`) and shows no live status.
- `features/agents/agent-sets/orchestrator/thunks.ts:153` — every set member
  launches `displayMode: "background"` with the `requestId` captured at `:162`
  and never surfaced. A set run is long and multi-step: the highest-value
  candidate for `LiveRunWindow` in this list.
- `features/marketing/components/settings/SiteStrategyCard.tsx:106`,
  `features/marketing/components/operations/KeywordDataQualityPanel.tsx:99,211`
  — verify whether these are AI runs or plain saves before spending effort.

### 9. Refresh-fragility only (stage narration is present) — D, M each

These narrate real stages, which the law permits, but the run is an in-tab
`await` — navigate away and it is gone with nothing persisted.

- `features/marketing/components/pages/usePageAnalyzer.ts:92` → `PageWorkspace.tsx`, `cards/PageAnalyzerCard.tsx` (`…/sites/[siteId]/pages`)
- `features/expertise/components/detail/CompileDeskDialog.tsx:86`, `IngestSourceDialog.tsx:79`
- `features/marketing/seo/public-tools/PageAuditTool.tsx:70` (`/seo/page-audit`, **anonymous traffic**), plus `RobotsTesterTool.tsx`, `StructuredDataValidatorTool.tsx`

Lowest priority: runs are short and the stage line means the user is not staring
at nothing.

### 10. Guard

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
| Research slide deck — `OutputsStudio.tsx:1069` | **Kind already exists.** The agent returns `{ title, slides[] }` — exactly `presentation_deck` (`features/content-ir/kinds/presentation-deck.ts` → Slideshow). No new kind; bind it. → chip |
| Research SEO package — `OutputsStudio.tsx:1215` | **New kind.** `{ title, meta_description, slug, primary_keyword, keywords[], schema_org, open_graph, faq[] }` with character-limit validation UI (`SeoView:1391`). `page_brief` does not fit (content-plan specific). → chip |
| Podcast chapters — `useEpisodeChapters.ts:49` | **Kind.** Timestamped segments persisted to `pc_episodes.chapters`, used to seek the player. Check `timeline.ts` for reuse first. → chip |
| Podcast title options — `useEpisodeTitleOptions.ts:70` | **DONE 2026-08-11.** Kind `episode_title_options` shipped end to end (schema + component + dual gate, agent v4, live posture, real-run verification). It went further than the precedent: the apply is a surface WRITE, not an agent launch, and the target is a component constant rather than payload data — see `features/content-ir/FEATURE.md`. |

Three focused sessions remain as chips (slide deck, SEO package, chapters);
**title options shipped 2026-08-11**. Each carries the full end-to-end contract: schema, agent
instruction rewrite via `agent_author`, every usage repinned, kind + component +
dual-gate example, live posture, real end-to-end test. **Do not start one of
these inline in a sweep session** — that is how a half-authored kind ships.
