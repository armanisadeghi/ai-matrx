# HANDOFF — Education Flashcards/FastFire: Core Rebuild Path

> **Resume point if context is cut.** Read this + `FLASHCARDS_STATUS_AND_ISSUES.md` first.
> Owner direction (2026-06-30): **core before AI; connect the pieces; build the REAL pages, not demos;
> surface internal state; stop running ahead.** Agents/data are solid; the work is the AUDIO CORE,
> the CONNECTIONS, the real UI, and sessions CRUD. Build order below is the priority order.

## State
- Committed + solid: Waves 0–4 (canonical DB, data layer, study spine, render-block repoint, FastFire
  control layer) + create-from-topic + 10 live agents (gemini-3.5-flash, owner-tuned). See status doc.
- **Routing: leave AS-IS for now** — owner says it looks good; a separate agent is doing a structural
  analysis + adding placeholder routes; incorporate later. Just keep building; don't fight that agent.
- **DONE (2026-06-30, pending owner gate): Step 0 cleanup + Step 1 audio core + Step 6 audio-debug panel.**
  Anti-patterns removed (schemas.ts deleted, overrides gone). `continuousCapture.ts` rebuilt on Web Audio
  AudioWorklet→PCM→WAV (sample-accurate clips + full-session WAV; beeps synthesized into clips; ±2.5s pad;
  ScriptProcessor fallback). New `lib/audio/{pcm,wav}.ts` primitives. Prove-it surface at
  **`/education/fastfire/capture-test`** (admin) + `AudioCaptureDebugPanel`. Type+lint clean.
  **⏸ AT THE GATE:** owner verifies the core by LISTENING (record + play back full + per-card WAVs) before
  resuming. Execution plan: `~/.claude/plans/handoff-education-jiggly-platypus.md`.
  **Remaining order: Step 3 (connect) → Step 2 (device setup) → Step 4 (set-browse) → Step 5 (sessions
  CRUD) → Step 6 (agent-stream panel) → harden/finalize.**

## Build order (priority)

### Step 0 — Cleanup (do first; clear + safe)
- **Remove the agent anti-patterns.** Delete `features/flashcards/fast-fire/agents/schemas.ts`. Remove
  `llmOverrides: { response_format }` from `gradeCard.thunk.ts:188` + `helpLive.thunk.ts:91` (review
  already commented). Call agents with **variables only**. Fix agent output in the **DB via `agent_author`**,
  never in code. Verify `jsonExtraction` is actually needed; keep only if the FE truly needs it.

### Step 1 — AUDIO CORE rebuild (Web Audio API PCM) — THE priority, owner-approved design
- **Capture:** an `AudioWorklet` taps the warm mic stream (reuse `features/audio`: `acquireMicStream`
  singleton + shared `AudioContext` + `captureLock`) and pushes raw PCM into ONE growing buffer with a
  sample clock. NOT MediaRecorder slicing (codec fragments don't decode — that was the bug).
- **Full session** = the whole PCM buffer → one **WAV** (provable, downloadable). →
  `study_session.session_audio_file_id` (durable `file_id` via `fileHandler`).
- **Per-card clip** = slice the PCM by the card's sample range, **plus ~2–3s before + after**, with an
  **audible beep delineator** (played to speakers → captured) marking the card start/stop so the grader
  has context for over-time/ambiguous answers. → WAV → `study_attempt.response_audio_file_id`.
- **Real-time:** clips are ready the instant a card ends → parallel grading works.
- **Graceful degrade:** if chunking is unreliable on a platform, fall back to grading the **full-session
  WAV at the end** (lose real-time only). Detect + degrade automatically.
- **Cross-platform:** ALL major browsers, desktop + mobile (AudioWorklet w/ documented fallback; WAV is
  universally decodable; test iOS Safari).
- **PROVE IT FIRST:** a visible **"capture test" surface** that plays the full session + each per-card
  segment and shows real durations/waveforms — verify the core BEFORE wiring any AI grading.

### Step 2 — Audio device setup (Zoom/Google-Meet style)
- On session start, **prompt to confirm input/output devices + test audio** before proceeding.
- **Expand** the existing avatar-menu audio window panel into a reusable, more-capable device-check/test
  component (input + output select, level meter, test tone/playback). It's a **window panel → openable
  from anywhere via a dispatch action** — wire that. Build the UI so it COULD host video later (other
  study aids will need video); don't plug video up now unless trivial.

### Step 3 — Connect the pieces (the core flow, end-to-end) — high priority
- **Flashcard set detail = the hub.** From a set, clear paths to: **edit/update**, **practice/study**,
  **Fast Fire**, and **enhance/expand/agentic** options (placeholders OK). The flow + connections must be
  correct now, even where targets are placeholders.
- **Fast Fire as an entry point too:** Current Study Sets → Flashcards/Quizzes/… → a Specific Set → Fast
  Fire Session → **Results**. That route also supports **create a new set** + **view previous results**
  (placeholders fine). The app FLOW must read correctly to a real user from the start.
- Confirm the **view/study vs edit** separation (the admin route may already be the edit surface).

### Step 4 — Real set-browse page (NOT a demo)
- Replace the demo "choose a set" page with the **actual production page** a real user will use — no
  current top-level buttons/dropdowns in their present form. Mobile-first, scales to **hundreds of sets**
  (folders/courses/tags + search per VISION §1). Placeholders OK for incomplete features inside it.

### Step 5 — Sessions CRUD + history (core; architect-grade)
- Sessions must be tracked so users see **progress + how they've done**. Build the **routes to list / view
  / edit / delete** study sessions + results. CRUD for **all** aspects of the system is critical — this is
  the model every other `education` feature copies, so get it right.

### Step 6 — Dev visibility (temporary, admin-gated)
- **Audio debug panel** (real-time): buffer size, card boundaries, per-segment durations, levels, the
  splice/chunk state. Gate on the **admin role from Redux** (`selectIsAdmin` — admin sufficient, NOT
  super-admin). Removable later.
- A **window panel for live agent stream output** — surface internal AI state, don't hide it.

## Operating rules (corrected)
1. Core before AI. Connect before enhance.
2. **Never override our own agents; never hard-code schemas** — change behavior in the agent DB.
3. **Stop running ahead** — describe + get owner guidance for non-obvious decisions; bake this rule into
   every subagent prompt (precise design in, no "figure out a system you don't understand").
4. **Real verification** — prove audio by playing it back, not by type-check.
5. **Surface internal state** (debug panels / live stream) during development.
6. Document as we go (this doc + status doc) so context limits never lose the plan.

## Reusable primitives (don't rebuild)
`features/audio` (mic singleton, captureLock, shared AudioContext) · the window-panels system (dispatch to
open) · `fileHandler` (durable files) · `FC_AGENTS` registry + `launchAgentExecution` (variables-only) ·
`fcService`/`studyService`/`study_record_attempt` RPC · `selectIsAdmin` (Redux).

## Change log
- 2026-06-30 — Created. Path: cleanup → audio core (Web Audio PCM, prove-it surface) → device setup
  (Zoom/Meet) → connect set↔study↔FastFire → real set-browse page → sessions CRUD → admin debug panels.
- 2026-06-30 — **Pre-gate build landed.** Step 0 (anti-patterns removed) + Step 1 (audio core rebuilt on
  Web Audio PCM→WAV; `lib/audio/{pcm,wav}.ts`; capture-test prove-it surface) + Step 6 audio-debug panel.
  Type+lint clean. Paused at the gate for owner playback verification before Steps 3/2/4/5.
