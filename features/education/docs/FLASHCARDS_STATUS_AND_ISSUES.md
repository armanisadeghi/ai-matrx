# Flashcards + FastFire — Status & Issues

> **Single source of truth for the current state + the corrected path forward.** Written 2026-06-30
> after owner review. Context is filling across long sessions; THIS doc is what a fresh context reads
> to pick up. Read it before touching flashcards/FastFire. The build plan is
> `~/.claude/plans/okay-so-if-i-declarative-jellyfish.md`; the agents are in `LIVE_AGENTS.md` +
> `AGENT_SPECS.md`; the original spec is `app/(transitional)/flash-cards/fast-fire/REQUIREMENTS.md`.

## The core reframe (owner feedback, 2026-06-30)
**We over-invested in the AI integrations — the part the platform makes EASY — and under-built the
part that genuinely needs careful engineering: the audio capture + timing CORE.** Features were layered
on a core that is not functional. **Reprioritize: get the core technical basics (audio recording, timing,
routing) absolutely solid and PROVABLE in isolation FIRST. Only then wire the AI (which is then easy).**
And: **stop running ahead** — describe the goal and get guidance BEFORE implementing anything non-obvious.

---

## PART 1 — Completed (committed, working)

| Wave / piece | Commit | State |
|---|---|---|
| **0 — Canonical DB** | `fc0cbc05d` | 7 `education` tables (fc_set/fc_card/fc_detail + study_session/study_attempt/item_mastery/study_goal); all pass `iam.verify_canonical_ok`. Platform `assoc_*` RPC repaired + role/position. **Solid.** |
| **1 — Data layer** | `a4693a21c` | `fcService`, `studyService`, `study_record_attempt` RPC (atomic ledger+mastery; D28 null-result fixed), `lib/srs/fsrs.ts`, `lib/audio/narrate.ts`. **Solid.** |
| **2 — Render-block repoint** | `160890166` | chat flashcards → canonical `fc_set`. **Owner-verified live** (50-card set). **Solid.** |
| **3 — Flashcard surfaces** | `764e200d0` | `/education/flashcards` list + detail + classic study (flip→FSRS). Works, but UI + routing need rework (see Issues C, D). |
| **4 — FastFire harness** | `9c1e719fd`, `115e344e3` | State machine, deadline timer, capture-lock — the *control* layer is solid. **BUT the AUDIO CAPTURE is broken (Issue A — top priority).** |
| **Create-from-topic** | `b9bab8309` | Topic → `fc_generate_cards` → real `fc_set`. Works, but uses agent anti-patterns indirectly (Issue B); UI/routing rework pending. |
| **Agent specs + registry** | `b230eb305` | `AGENT_SPECS.md` (contracts) + `FC_AGENTS` registry. 10 agents live (gemini-3.5-flash), owner-tuned (count/topic confirmed good via `agent_run`). |

**Live DB (2026-06-30):** 5 sets · 104 cards · 104 member edges (relationship layer intact) · 18 study
sessions (**12 leaked `active`** — Issue A/H1) · 14 attempts · 9 mastery rows. Repo type errors ~52
(down from ~200 via owner's pass; **0 in flashcards/education/study/fast-fire**).

---

## PART 2 — Pending (not built)
Mobile-first design (owner priority — almost all usage is mobile/kids on phones) · sharing/versioning
(duplicate-to-edit) · adaptive next-batch over `item_mastery` · delete the legacy flashcard app
(`components/flashcard-app/**`, `(transitional)/flashcard/**`) · enrich + pre-generated "confused" audio ·
Learn/Test/Match/Quiz modes · the metadata/visuals agent (not yet in `LIVE_AGENTS.md`).

---

## PART 3 — ISSUES (must fix; CORE-FIRST order)

### 🔴 A. AUDIO CORE — not functional (TOP PRIORITY, blocks everything FastFire)
**Symptoms (owner-observed):** per-card "segments" are each ~the full length with parts muted; ALL
segments are the same duration regardless of the actual answer; they are mostly silence. There is **no
single full-session file** proving the whole session was captured. Multiple processing errors.
**Diagnosis:** the audio capture + slicing was never made correct. The committed per-card-recorder
"fix" does not produce correct segments. AI grading was wired on top of a broken capture core.
**Correct approach (CORE-FIRST):** rebuild audio capture as a **standalone, provable module** before any
AI:
1. Capture the **full session** as ONE durable, downloadable/playable file (prove it contains the whole
   session's real audio).
2. Produce **per-card segments** that are actually correct — real start/stop aligned to each card, real
   speech (not silence), real (variable) durations.
3. A **visible test/verification surface** to PLAY the full file + each segment and confirm correctness
   BEFORE wiring the grader.
**OPEN — needs owner guidance:** which capture technique — (a) per-card `MediaRecorder` start/stop on a
warm stream, (b) one continuous recording + slice by timestamp (server-side or via Web Audio decode),
or (c) Web Audio API `AudioWorklet`/PCM buffering with exact sample cuts. I will propose + get sign-off
before implementing. **This is the thing that actually needs careful engineering — do it right.**
**Cleanup owed:** the 12 leaked `active` study_sessions (abandon/End not closing the session — H1).

### 🟠 B. AGENT USAGE — anti-patterns (owner: "stop doing this")
- **B1 — LLM overrides on OUR agents.** Overrides exist to modify *someone else's* agent at call time.
  For our OWN agents, change behavior by **updating the agent's DB definition** (`agent_author` MCP), never
  a call-time override. Remove `llmOverrides: { response_format }` at `gradeCard.thunk.ts:188`,
  `helpLive.thunk.ts:91` (reviewSession already commented). Call the agent with **variables only**.
- **B2 — hard-coded schemas in code.** `features/flashcards/fast-fire/agents/schemas.ts` — the server runs
  the schema in the **agent's DB definition**, NOT the code; a code copy is stale-prone and divergent and
  changes nothing the server does. **Delete `schemas.ts` + all imports.**
- **B3 — production cache destruction.** A call-time override makes prod pull the cached agent, build a
  modified copy for that one run, cache it briefly, discard it — repeated every call. At thousands of
  calls/min this destroys cache efficiency. Overrides are categorically wrong for our high-volume agents.
- **Note:** `jsonExtraction: { enabled: true }` (FE-side structured-output extraction) is NOT an override
  of the agent — but verify it's actually needed once overrides are removed (the agent's DB schema should
  drive structured output).
- **Correct pattern:** `launchAgentExecution({ agentId, runtime: { variables }, config: { autoRun, displayMode } })`
  — no `response_format`, no hard-coded schema. If the output shape is wrong, fix the AGENT (DB), not the code.

### 🟠 C. ROUTING — not following the education convention; single-page experience
- The study/drill experience runs as **single-page client state with one URL** → refresh + shareable
  links break. We must use real Next.js routing so each meaningful view is its own refresh-safe,
  shareable URL.
- I hand-created `/education/flashcards/[setId]`, `/[setId]/study`, `/new`, `/admin` which **may not match
  the established education routing convention** (every other tool is a single registry-driven
  `page.tsx`; flashcards is the first to graduate).
- **OPEN — needs owner guidance:** what is the established education routing structure/convention I should
  follow (registry-driven? a `[tool]` pattern? specific server-shell + nested segments)? What should be
  its own route vs in-page state? I'll restructure to the convention rather than guess. Can be done now or
  after the audio core — owner's call.

### 🟡 D. UI — set list won't scale; design not agreed
- The current "choose a set" screen (large cards/blocks per set) is a demo; it fails at hundreds of sets.
- The vision (`VISION-education-hub.md` §1) implies folders/courses/classes/tags + community library +
  search — a dense, scalable, **mobile-first** browse, not big tiles.
- **OPEN — needs owner discussion:** the intended set-browse design at scale + the overall mobile-first
  direction, BEFORE building more UI. I'll build to spec.

---

## PART 4 — Corrected operating rules (going forward)
1. **Core before AI.** Audio capture + timing + routing must be rock-solid and PROVABLE in isolation
   before any AI is wired. The AI is the easy part once the core is right.
2. **Never override our own agents; never hard-code schemas.** Change agent behavior in the DB. The code
   passes variables and reads structured output.
3. **Stop running ahead.** For anything non-obvious, describe the goal and get owner guidance BEFORE
   implementing — applies to me AND any subagent I spawn (put the same rule in their prompts).
4. **Verification is real.** Prove audio with a play-it-back surface; don't claim "fixed" from type-check.
5. **Document as we go** (this file) so context limits never lose the state.

## Change log
- **2026-06-30** — Created after owner review. Logged the core reframe (audio/timing core under-built,
  AI over-built), the agent anti-patterns (overrides + hard-coded schemas), the routing convention gap +
  single-page issue, and the set-list-at-scale UI concern. No code changed this entry — documenting +
  aligning before implementing, per the new operating rules.
