---
status: active
updated: 2026-07-28
repos: [matrx-frontend, aidream]
vision: []
---

# Podcast run liveness + real research feed

Scope: the **live run page** (`/podcast/studio/run/[id]`) while a run is generating — showing the
user the real research as it happens, and keeping the false-stall banner from coming back. NOT the
generation pipeline (gates, casts, chapters, languages) → `docs/handoffs/podcast-system.md`; NOT
media/blog/image polish → `docs/handoffs/podcast-media-and-streaming-polish.md`. Living state of the
whole feature: `features/podcasts/FEATURE.md`.

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
- **The load-bearing rule (do not violate):** the synthetic steps are the **floor**, never to be
  removed. *"Synthetic steps are there as the steps that show no matter what happens when there is
  no information coming in. But if you can do a better job and you can get the real steps, then add
  the real steps in."* Real data is **ADDITIVE** — a new surface layered on top. *"No one says that
  the order that things come in has to be absolutely beautiful and perfect… Get the real stuffs and
  add them."* If the real feed can't be made clean, the fallback is easy: *"just render a popover
  that shows a stream coming in."* Never rip out working fallback UI to make room for real data you
  haven't fully delivered. (Standing memory: `feedback-additive-not-replacement`.)
- **The streaming bar (platform-wide):** *"You're creating this thing that just sits there and
  spins for over a minute. That's pathetic. … It has to stream in real time."*

## Resources

- FEATURE doc (source of truth): `features/podcasts/FEATURE.md`
- Live run page + rail: `features/podcasts/studio/components/StudioRunView.tsx`,
  `features/podcasts/generator/useStageDisplay.ts` (the **synthetic floor**),
  `features/podcasts/studio/components/LiveProgressRail.tsx`
- Stream driver (all liveness + event handling): `features/podcasts/studio/runs/useStudioRun.ts`
  — watchdog `STALL_MS = 20_000` (line 61); the `onStreamEvent` switch handles
  `data | chunk | heartbeat | tool_event | error | end` (heartbeat ~line 427, tool_event ~line 444).
- The real feed: `features/podcasts/studio/components/ResearchActivityFeed.tsx` (self-hides when no
  tool events arrive), wired in `StudioRunView.tsx`.
- The banner: `features/podcasts/studio/components/RunRecoveryBanner.tsx`.
- Stream parser + typed callbacks: `lib/api/stream-parser.ts` (`StreamCallbacks`, `onToolEvent`,
  `onHeartbeat`); types `types/python-generated/stream-events.ts`.
- aidream research tool (emits the activity): `packages/matrx-ai/matrx_ai/tools/implementations/web.py`
  — `stream.progress(...)` / `stream.step(...)`; streaming manager
  `packages/matrx-ai/matrx_ai/tools/streaming.py` — `result_preview()` at line 150, **called by
  nothing in the repo** (verified 2026-07-28), and the FE has no `tool_result_preview` handler.
- Login for local testing: `/login`, `admin@admin.com` / `Password1234#`. NOTE: run `e64b4691…`
  is on Arman's **prod** account — a local dev user gets "Run not found". Start a NEW run that
  triggers research to verify.

## Remaining work

1. **Verify the real research feed against a live research run — STILL NEVER VERIFIED.** Start a
   run whose source triggers web research (topic-only / "research the web"), watch
   `/podcast/studio/run/[id]`. Expect a **"Live activity"** panel under the stage rail showing real
   `Searched: {query}` / `Browsing {url}` / `Scraped N pages` lines, with the synthetic rail above
   it unchanged. If the panel never appears, tool events aren't reaching the client — trace
   transport: confirm the research child runs on the parent emitter (no `suppress_stream`) and that
   `consumeStream` / `useStudioRun`'s `tool_event` branch fires (temporary `console.log` there).
2. **Show the actual research REPORT, not just lifecycle lines (the fuller vision).** The feed shows
   tool *lifecycle* only. The synthesized research *content* Arman asked for ("a popover/window
   panel that shows the research report") is not surfaced. Two options, pick per product feel:
   (a) aidream — have `research_web` call `stream.result_preview(<condensed report>)` after the
       condense step (`web.py` ~line 495), then render `tool_result_preview` events in the FE; or
   (b) FE-only — the condenser agent's tokens already arrive as `chunk` events feeding
       `state.liveText` (tail-capped, shown in `ProductionTeaser`); surface that as a "Research"
       popover/panel during the research stage.
   Keep it **additive** — new surface, do not touch `useStageDisplay`.
3. **Cover-art / video cards read as static "Queued" tiles** during the multi-minute image wait.
   Per-card progress exists but the wait is long; make it feel alive.
4. **(Optional) Re-tune `STALL_MS` / banner tone.** With the server starvation fix live and
   heartbeats counted, a 20s blackout should be genuinely rare. Re-read against real runs.

## Done

- Root cause fixed AND deployed — PDF/image OCR offloaded to `asyncio.to_thread` in
  `scrape_url_core` (aidream `3755ac32f`, on `origin/main` with 600+ commits and multiple releases
  since; `mcp_tool_helpers.py` calls the `_async` extractors today).
- Liveness watchdog counts `heartbeat` + `tool_event`, not just `podcast_tick`/chunks; late
  heartbeats logged as backend starvation — `useStudioRun.ts` (`42926d815`).
- False-failure banner copy softened, Resume preserved — `RunRecoveryBanner.tsx`.
- `ResearchActivityFeed` added — real queries / URLs / scrape tallies, self-hiding, strictly
  additive to the synthetic rail.
