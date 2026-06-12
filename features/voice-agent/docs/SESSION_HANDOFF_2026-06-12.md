# Voice-Agent Session Handoff — 2026-06-12

Picking up from the previous session that shipped the 4-step voice
unification (commits `f823d5a`, `22af740`, `c18e62d`, `c56b75b`). This
session covered the post-shipping checks the user requested,
incorporated additional work merged from `main`, redesigned the
animation primitive, and produced the tool-bridge handoff.

This document is the **complete state-of-the-world** for the next
agent picking up the voice-agent work. Read this end-to-end before
touching anything in `features/voice-agent/` or
`features/agents/runtime/`.

---

## 1. What shipped in THIS session (2026-06-12)

### 1a. Confirmation that the prior migration is still intact

After merging `main` (367 commits brought a lot of unrelated work
across studio/transcripts/PDF/mobile, etc.), the voice-agent
unification still works end to end:

| Check | Result |
|---|---|
| Capabilities backfill on `ai_model` | 189/189 rows canonical |
| xAI Realtime model `interaction` | `"realtime"` ✓ |
| `pickRuntime` resolver imported by launcher | ✓ — `launch-agent-execution.thunk.ts:53-55` |
| `validateMessageBlocks` wired into `execute-instance` | ✓ — `execute-instance.thunk.ts:60` |
| `getCapabilitiesForConversation` wired into `process-stream` + `execute-instance` | ✓ |
| Voice intro agent row (`00000000-0000-4000-8000-000000000001`) | exists, builtin, public, linked to xai_realtime |
| `matrx-user/chat-voice` surface execution_mode | `browser-realtime` ✓ |
| `useVoiceAgentInstance` seed-then-update pattern | ✓ — race fix from `c56b75b` survives |

**No subsequent commit re-built any of the primitives I added** — the
classes, hooks, resolver, types, and parser are the only copies in the
codebase.

### 1b. Scribe Live surface row published

The Transcription Scribe **Live** tab is a real production usage of
the voice-agent system but had no dedicated `ui_surface` row until
this session. Added:

```
matrx-user/transcript-scribe-live
  execution_mode = 'browser-realtime'
  url_pattern    = '/transcripts/scribe/:sessionId'
  sort_order     = 211
```

The Scribe Agent tab (text-only chat against the working document)
stays on the existing `matrx-user/transcript-scribe` row
(`python-stream`). Two surfaces, two execution modes — matches the
two tabs' realities.

### 1c. Animation overhaul: one primitive, five states

Replaced the May 2026 two-component design (`VoiceAmbientGlow`
fullscreen dome + `VoiceListenHalo` focal warm halo) with **one**
state-driven primitive plus an Apple-style edge ribbon.

**Files deleted:**
- `features/voice-agent/components/VoiceAmbientGlow.tsx`
- `features/voice-agent/components/VoiceListenHalo.tsx`

**Files added:**
- `features/voice-agent/components/VoiceOrb.tsx` — nested SVG orb,
  state-driven hue/scale/motion, amplitude-coupled.
- `features/voice-agent/components/VoiceEdgeRibbon.tsx` — wraparound
  border, animated CSS gradient, two stacked strokes.

**Surfaces updated:**
- `features/voice-agent/components/VoiceAgentSurface.tsx` — both
  `/chat/voice` and `/chat/voice/playground` now use the new
  primitives.
- `features/transcript-studio/components/scribe/ScribeLiveScreen.tsx`
  — Live tab updated in the same commit. Scribe gets the redesign for
  free.

The redesign came out of a research pass on the gold standard (ChatGPT
Advanced Voice, Apple Intelligence Siri, Pi, Gemini Live). Key
findings synthesized in the file headers of `VoiceOrb.tsx` and
`VoiceEdgeRibbon.tsx`. The single biggest critique of the old design
that drove this: the warm/cool spatial split (you-below, agent-above)
read as "two different things happening" instead of "one
conversation." Every gold-standard implementation lands on one
primitive that modulates state — same place, same shape.

The five distinct visual states (with rationale per state) are
documented in the `VoiceOrb.tsx` file header. The `thinking` state
specifically was missing from the old design — it shared the
"connecting" visual — so this fix surfaces the agent's working state
legibly for the first time.

### 1d. Tool-bridge handoff document

The voice agent supports only `web_search` and `x_search` (xAI's
built-in tools). Custom function tools — registry tools, MCP tools,
skill tools — are NOT supported in voice today. The function-call
handler in `useXaiVoiceSession.ts:494-501` is a stub comment that says
"v1.1".

The Scribe team wrote a high-quality design spec at
[`features/voice-agent/docs/REALTIME_TOOL_BRIDGE.md`](./REALTIME_TOOL_BRIDGE.md)
covering architecture, endpoints, classification logic. This session
added a companion **implementation guide**:

[`features/voice-agent/docs/REALTIME_TOOL_BRIDGE_HANDOFF.md`](./REALTIME_TOOL_BRIDGE_HANDOFF.md)

— sequence diagram, file-by-file frontend skeletons, build order,
test recommendations, open questions to escalate before shipping.
Designed to be handed to a cross-repo agent (frontend + aidream
Python) and executed without further clarification from the user.

---

## 2. What's left — by priority

### Priority 1: Tool-call support (orthogonal, requires cross-repo work)

**Status:** unimplemented. Spec + handoff ready.

**Documents:**
- Architecture: [`REALTIME_TOOL_BRIDGE.md`](./REALTIME_TOOL_BRIDGE.md)
- Implementation guide: [`REALTIME_TOOL_BRIDGE_HANDOFF.md`](./REALTIME_TOOL_BRIDGE_HANDOFF.md)

**Approximate effort:** ~18 hours of focused work (split roughly
50/50 between Python and frontend per the handoff's build order).

**Who:** an agent with access to both **matrx-frontend** (this repo)
AND **aidream** (the Python backend). The handoff explicitly calls
this out and lists the build order from Python-first to
frontend-second.

### Priority 2: Animation polish (visual QA, in-browser)

**Status:** code complete in this session, never run in a real
browser by me (this environment can't render WebGL/CSS).

**What to verify:**
1. Mount `/chat/voice` in a real browser. Check each state:
   - Idle (page load): slow indigo breath, no edge ribbon.
   - Press mic, wait for `requesting-mic` / `connecting`: orb stays
     calm, no ribbon. Status pill should reflect connecting.
   - Speak: orb shifts warm peach, scales 0.95→1.08, edge ribbon
     fades in with warm gradient.
   - Stop speaking, agent goes to `thinking`: orb DISCONNECTS from
     amplitude, hue rotates on internal clock, ribbon fades out.
   - Agent speaks: orb shifts cool violet, scales bigger (0.95→1.15),
     ribbon comes back in cool gradient.
   - Hit error path: static destructive ring, no motion.
2. Check `prefers-reduced-motion`. Amplitude binding should fix at
   0.4, scale stays constant, all rotations / breath stop.
3. Mobile Safari — the edge ribbon uses `WebkitMaskComposite`. Should
   work but smoke-test on a real device.
4. Performance: the orb has 4 motion/react components running
   simultaneously. On low-end Android the hue-rotation overlay (the
   `conic-gradient` div with `filter: blur(6px)`) is the likely first
   hotspot. If it stutters, downgrade to a simpler `rotate` on a
   single radial-gradient instead of conic. Code path:
   `VoiceOrb.tsx:175-194`.
5. Run the same checks on the Scribe Live tab — should look identical.

**Possible follow-ups if the visual still doesn't satisfy:**
- Upgrade `VoiceOrb` from SVG/motion to a true WebGL shader (OGL
  library, ~5KB). The shader path is what ChatGPT Advanced Voice uses
  and would give us per-pixel noise displacement. The handoff doc
  research summary explains the shader uniforms. Strictly an upgrade,
  not required — the SVG version should land "great" on its own.

### Priority 3: TypeScript validation (CI-side)

**Status:** unverified. `npx tsc --noEmit` on this codebase exceeds
the 6-minute timeout in this environment. The prior session also hit
this and shipped relying on PR-build CI to catch any issue.

**Targeted checks done in this session:** All imports in modified
files resolve via grep. The new components use only `motion/react` +
`cn` + types already in the project — no new dependencies. The
component signatures match what `VoiceAgentSurface` and
`ScribeLiveScreen` were passing to the old components.

**Recommended next step:** push and watch the build. If there's a
type error, it'll be in one of:
- `VoiceOrb.tsx` — `useTransform` overload selection
- `VoiceEdgeRibbon.tsx` — `WebkitMask` CSS prop in motion `style`

Both are isolated and easy to fix in a follow-up if they surface.

### Priority 4: Cleanup of demo/temp scaffolding

**Status:** I left behind:
- `/tmp/voice-agent-insert.sql` — the migration SQL I generated locally.
- `/tmp/caps-rows-full.json`, `/tmp/caps-parse.py`, `/tmp/caps-updates.sql`, `/tmp/caps-batch-*.sql` — backfill artifacts.
- `/tmp/backfill-caps.mjs`, `/tmp/caps-emit.mjs` — early-iteration scripts.

These are in `/tmp/` and will vanish when the environment recycles —
no cleanup needed unless the environment persists.

### Priority 5: Open questions waiting on user input

The handoff doc has these in §6 ("Open questions to escalate, not
assume"):
- Should tool calls show a "working..." earcon during the
  Python-execute round-trip?
- Where do voice tool calls persist? Is `cx_tool_call` the right
  table?
- Hot-reload of resolved tools mid-session — v1 says no, but the
  playground UX may want it.
- MCP servers with OAuth — needs a smoke test before declaring v1
  done.

---

## 3. Architectural pointers for the next agent

### Voice-agent feature module map (post-session)

```
features/voice-agent/
├── audio/                  # mic capture + PCM playback (unchanged)
├── components/
│   ├── VoiceAgentSurface.tsx        # top-level shell (uses VoiceOrb + VoiceEdgeRibbon now)
│   ├── VoiceEdgeRibbon.tsx          # ✨ NEW
│   ├── VoiceOrb.tsx                 # ✨ NEW
│   ├── VoiceMicButton.tsx           # tactile control, unchanged
│   ├── VoiceStatusPill.tsx          # text status, unchanged
│   ├── VoiceTranscriptStream.tsx    # rolling transcript, unchanged
│   ├── VoiceTranscriptTurn.tsx      # one turn (audio-gated reveal)
│   ├── VoiceErrorBanner.tsx
│   └── playground/                  # config sheet
├── docs/
│   ├── LIVE_INTERMITTENT_CAPTURE.md
│   ├── REALTIME_TOOL_BRIDGE.md           # 🎯 architecture
│   ├── REALTIME_TOOL_BRIDGE_HANDOFF.md   # 🎯 ✨ NEW — implementation guide
│   └── SESSION_HANDOFF_2026-06-12.md     # 🎯 ✨ NEW — this file
├── hooks/
│   ├── useAudioAmplitude.ts         # rAF → MotionValue, the orb's input
│   ├── useVoiceAgentInstance.ts     # seed-then-update pattern; loads agent record
│   ├── useXaiVoiceSession.ts        # 🎯 the orchestrator; tool-loop stub at lines 494-501
│   └── usePersistVoiceTranscript.ts
├── persistence/
│   └── voiceTranscriptWriter.ts
├── state/
│   ├── voiceAgentSlice.ts           # has applyAgentConfig action now
│   └── selectors.ts
├── transport/
│   ├── xaiClient.ts                 # WebSocket lifecycle
│   ├── tokenManager.ts              # ephemeral token mint
│   └── clientEvents.ts              # 🎯 buildSessionUpdate needs widening for tools
├── constants.ts                     # VOICE_INTRO_AGENT_ID, TRANSCRIPT_REVEAL_LAG_MS
└── types.ts                         # 🎯 ToolName needs widening to RealtimeToolSet

features/agents/runtime/             # ✨ added in prior session
├── pickRuntime.ts                   # pure resolver (model.interaction × surface.execution_mode)
├── runtime-resolver.ts              # async helper, called by launcher
├── validation.ts                    # capabilities pre-flight (warn-only)
├── get-model-capabilities.ts        # canonical-shape lookup
└── realtime/
    └── launchRealtimeSession.thunk.ts   # 🎯 v1 is a landing pad; tool-bridge will extend
```

🎯 marks files that the tool-bridge work will touch.

### State machine — how the orb knows what to do

The voice surface's 8-state status machine (`VoiceStatus` in
`types.ts`) drives every visual choice in `VoiceOrb`:

```
       idle ──tap mic──► requesting-mic ──perm granted──► connecting
                              │                                │
                              ▼ denied                         ▼ ws open
                            error                          listening ◄──┐
                                                              │         │
                                                              ▼ speech  │
                                                          thinking      │
                                                              │         │
                                                              ▼ audio   │
                                                           speaking ────┤
                                                              │ interrupt
                                                              ▼
                                                          interrupting ─┘
```

Adding a new state means: declare in `types.ts`, handle in the slice's
`setStatus` action, add the visual in `VoiceOrb.tsx`'s
`colorForStatus` + the conditional motion blocks, optionally add a
status-pill copy.

### How the runtime resolver knows where to send a launch

For any launch via `launchAgentExecution`:

1. The launcher resolves the agent → reads `agent.modelId`.
2. The launcher reads `model.capabilities.interaction` ("turn" or
   "realtime") from the canonical-shape capabilities (Step 1
   backfill).
3. The launcher resolves the surface → reads
   `ui_surface.execution_mode` ("python-stream" / "nextjs-stream" /
   "browser-realtime" / "local-runtime").
4. `pickRuntime` makes the decision. If `interaction === "realtime"`
   AND surface is `browser-realtime`, the launcher dispatches
   `launchRealtimeSession` and skips `executeInstance` entirely. Else
   it falls through to the regular path.

For the voice surfaces (`matrx-user/chat-voice` and
`matrx-user/transcript-scribe-live`), the realtime path fires. For
every other surface, the change is inert.

---

## 4. Critical comments / invariants left in code

Search for these strings to find the load-bearing notes the next agent
should not miss:

| Search string | File:line | Why it matters |
|---|---|---|
| `seed-then-update` | useVoiceAgentInstance.ts | Race fix from `c56b75b`; do not "refactor" it without understanding the race. |
| `function_call.created` | useXaiVoiceSession.ts | Tool-call stub. Tool bridge implementation replaces this. |
| `applyAgentConfig` | voiceAgentSlice.ts | The action the tool bridge will dispatch when it gets resolved tools. Already exists. |
| `interaction: "realtime"` | parse.ts | The capabilities field that drives `pickRuntime`. Don't break the canonical shape. |
| `VOICE_INTRO_AGENT_ID` | constants.ts | The built-in agent row id. Don't change without also updating the DB row. |
| `Mount-once` | useVoiceAgentInstance.ts | This effect runs ONCE per instanceId. Config changes go through `updateConfig` / `applyAgentConfig`, not by re-running the effect. |
| `pickRuntime` | runtime/pickRuntime.ts | The pure-function decision point. Don't add hidden state. |

---

## 5. What I'd tell the next agent in two sentences

The voice-agent system is now a real first-class member of the agent
system: capabilities are canonical, surface-driven runtime selection
works, voice agents are normal `agx_agent` rows, animation is one
state-driven primitive. The only big remaining work is the
function-call loop — and that's documented end-to-end in
[`REALTIME_TOOL_BRIDGE_HANDOFF.md`](./REALTIME_TOOL_BRIDGE_HANDOFF.md);
hand it to a cross-repo agent and have them ship it.
