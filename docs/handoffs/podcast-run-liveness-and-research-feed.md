---
status: active
updated: 2026-07-23
repos: [matrx-frontend, aidream]
vision: []
---

# Podcast run liveness + real research feed

Scope: the **live run page** (`/podcast/studio/run/[id]`) while a run is generating — the
false-stall bug and showing the user the real research as it happens. This is NOT the generation
pipeline itself (gates, casts, chapters, languages) — that is the sibling handoff
`docs/handoffs/podcast-system.md`. Living state of the whole feature: `features/podcasts/FEATURE.md`
(read its 2026-07-22 top Change Log entry first — it summarizes what shipped this session).

## Vision — Arman's words

The trigger was a run that showed a scary "The connection went quiet — we've stopped waiting on
stalled steps" banner **while the run was working perfectly and went on to finish with audio**
(run `e64b4691-66aa-42d9-88ea-116663f1d5fb`).

- On the banner: *"a horrible and stupidly false message that happens anytime the agent decides to
  trigger research first. It incorrectly tells the user that things are stuck when it's anything
  but!"*
- The real opportunity: *"we can easily be streaming back the research data in a way that lets the
  user know what amazing things we're doing for them!!!"* … *"the agent is streaming a research
  report. So how about I display a window panel component or a popover that shows the research
  report."* … *"Get the basics working and show it in real time as it comes in. It's not that
  complicated."*
- **The load-bearing rule (do not violate — it is why the UI is currently "destroyed" and being
  fixed):** the synthetic steps are the **floor**, never to be removed. *"Synthetic steps are there
  as the steps that show no matter what happens when there is no information coming in. But if you
  can do a better job and you can get the real steps, then add the real steps in."* Real data is
  **ADDITIVE** — a new surface layered on top. *"No one says that the order that things come in has
  to be absolutely beautiful and perfect… Get the real stuffs and add them."* If the real feed
  can't be made clean, the fallback is easy: *"just render a popover that shows a stream coming
  in."* Never rip out working fallback UI to make room for real data you haven't fully delivered.
  (Also captured as a standing memory: `feedback-additive-not-replacement`.)

## Resources

- FEATURE doc (source of truth): `features/podcasts/FEATURE.md`
- Live run page + rail: `features/podcasts/studio/components/StudioRunView.tsx`,
  `features/podcasts/generator/useStageDisplay.ts` (the **synthetic floor** — the sub-steps rail),
  `features/podcasts/studio/components/LiveProgressRail.tsx`
- Stream driver (all liveness + event handling): `features/podcasts/studio/runs/useStudioRun.ts`
  — the watchdog constant `STALL_MS = 20_000`; the `onStreamEvent` switch handles
  `data | chunk | heartbeat | tool_event | error | end`.
- The new real feed: `features/podcasts/studio/components/ResearchActivityFeed.tsx` (self-hides when
  no tool events arrive).
- The banner: `features/podcasts/studio/components/RunRecoveryBanner.tsx` (`streaming && stalled`
  branch).
- Stream parser + typed callbacks: `lib/api/stream-parser.ts` (`StreamCallbacks`, `onToolEvent`,
  `onHeartbeat`); event/payload types `types/python-generated/stream-events.ts` (`ToolEventPayload`
  event enum, `HeartbeatPayload.late_by_seconds`).
- aidream research tool (emits the activity): `packages/matrx-ai/matrx_ai/tools/implementations/web.py`
  — `stream.progress(...)` / `stream.step(...)`; streaming manager
  `packages/matrx-ai/matrx_ai/tools/streaming.py` (note `result_preview()` at line ~148, **not yet
  called** by `research_web`).
- aidream scrape path (the fixed starvation site):
  `packages/matrx-scraper/matrx_scraper/features/mcp_tool_helpers.py` (`scrape_url_core`).
- Login for local testing: open `/login`, `admin@admin.com` / `Password1234#`. NOTE: run
  `e64b4691…` belongs to Arman's **prod** account — a local dev user gets "Run not found". To verify
  you must start a NEW run that triggers research.

## Remaining work

1. **Deploy aidream to prod — GATES EVERYTHING.** The root-cause fix (commit `3755ac32f`,
   `mcp_tool_helpers.py`: PDF/image OCR moved to `asyncio.to_thread`) is committed to `main` but
   **deploy status is unverified**. Until it's live on `server.app.matrxserver.com`, the event loop
   still starves during PDF/image research results and the false stall can still fire. Verify it is
   deployed; if not, deploy it. This is the actual bug — everything else is symptom management.
2. **Verify the real research feed against a live research run — NEVER VERIFIED.** Start a run whose
   source triggers web research (a topic-only / "research the web" run), watch
   `/podcast/studio/run/[id]`. Expect a **"Live activity"** panel under the stage rail showing real
   `Searched: {query}` / `Browsing {url}` / `Scraped N pages` lines. The synthetic rail above it
   must look and behave exactly as before. If the panel never appears, tool events aren't reaching
   the client — trace transport: confirm the research child runs on the parent emitter (it should —
   no `suppress_stream`) and that `consumeStream`/`useStudioRun`'s `tool_event` branch fires
   (add a temporary `console.log` in the `tool_event` case of `useStudioRun.ts`).
3. **Show the actual research REPORT, not just lifecycle lines (the fuller vision).** Today the feed
   shows tool *lifecycle* (queries, URLs, tallies). The synthesized research *content* Arman wants
   ("a popover/window panel that shows the research report") is NOT surfaced: `research_web` never
   calls `stream.result_preview(...)`. Two options, pick per product feel:
   (a) aidream — have `research_web` call `stream.result_preview(<condensed report>)` after the
       condense step (`web.py` ~line 495), then render `tool_result_preview` events in the FE feed /
       a dedicated panel; or
   (b) FE-only — the condenser agent's tokens already arrive as `chunk` events and currently feed
       `state.liveText` (tail-capped, shown in `ProductionTeaser`). Surface that live text as a
       "Research" popover/panel during the research stage.
   Keep it **additive** — this is a NEW surface; do not touch `useStageDisplay`.
4. **(Optional) Tune the stall threshold / banner tone once starvation is truly gone.** With the
   server fix live and heartbeat now counted, a 20s blackout should be genuinely rare. Re-read
   whether `STALL_MS` and the softened banner copy still feel right against real runs.

## Done

- Root cause fixed — PDF/image OCR no longer blocks the event loop (aidream `3755ac32f`,
  `mcp_tool_helpers.py`). This is what caused the ticker + heartbeat to go dark simultaneously.
- Liveness watchdog now also counts `heartbeat` + `tool_event`, not just `podcast_tick`/chunks;
  late heartbeats are logged as backend starvation (matrx-frontend `42926d815`, `useStudioRun.ts`).
- False-failure banner copy softened, Resume preserved (`RunRecoveryBanner.tsx`).
- `ResearchActivityFeed` added — real search queries / URLs / scrape tallies, self-hiding, strictly
  additive to the synthetic rail (`ResearchActivityFeed.tsx`, wired in `StudioRunView.tsx`).
