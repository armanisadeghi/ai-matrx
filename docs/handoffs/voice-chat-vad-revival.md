---
status: blocked-on-decision
updated: 2026-08-15
repos: [matrx-frontend]
vision: []
---

# Hands-free VAD voice chat — 1,106 stranded lines, one decision to unblock

**Blocked on ONE question for Arman: do we still want hands-free, VAD-driven voice chat —
speak with no button, the assistant answers aloud, the mic goes to sleep when you walk away?**

Nothing here can proceed until that is answered, and the code may not be deleted until it is
answered "no" in writing (`common-docs/policies/unfinished-work-alarm.md`). Filed as
[FOUND_DEFECTS D198](../../FOUND_DEFECTS.md).

## What exists, and why none of it runs

Three near-identical hooks plus a complete UI, none reachable, all driven by one engine that
was deliberately retired:

| File | Lines | State |
|---|---|---|
| `hooks/tts/useVoiceChat.ts` | 356 | imported only by `components/voice/voice-assistant-ui/*`, which nothing mounts |
| `hooks/tts/useVoiceChatCdn.ts` | 352 | **byte-identical to `useVoiceChat`** but for the export name; the "Cdn" name is stale — both load VAD wasm from jsDelivr today |
| `hooks/tts/useVoiceChatWithAutoSleep.ts` | 398 | `useVoiceChat` + the only unique asset in the tree: a 60s idle timer that pauses VAD, and `wakeUp()` |
| `components/voice/voice-assistant-ui/**` | — | header, Sidebar, Footer, VoiceInputBar, VoiceSelect, AssistantSelect, CollapsibleSidebar, icons |

All three call `processAiRequest` from `actions/ai-actions/assistant-modular.ts`, which is now a
stub that throws unconditionally: *"Provider SDK calls no longer belong in Next server actions.
Active speech and transcription use the authenticated, catalog-routed aidream audio API."* That
one function was transcription **and** the LLM turn **and** the returned `voiceStream`. Retiring
it emptied the tree without deleting it. **Mounting any of these hooks today ships a page that
throws on the user's first utterance** — which is why this handoff wires nothing.

## Auth — clean, and it must stay clean

None of this code touches Cartesia, a provider key, or the token broker. It is free of the
second-auth-path hazard precisely *because* its provider seam was the server action that got
retired. Any revival goes through the canonical path and nothing else:
`lib/cartesia/accessToken.ts` → `connectCartesiaTts` (`lib/cartesia/FEATURE.md` neighbours),
and any brokered credential through `lib/api/broker/`. Do not reintroduce a server action that
calls a provider SDK.

## What the platform already gives a revival (THE INVENTORY LAW)

Scribe / Agent+ already runs voice-in → agent → voice-out on the canonical stack. A revival
consumes these; it does not rebuild them:

- **Capture + transcription** — `features/audio/hooks/useChunkedRecordAndTranscribe.ts`,
  `features/audio/service/transcribe.ts`, `features/audio/recordingCommands.ts`.
- **The agent turn** — `launchAgentExecution` (execution system). Never a server action.
- **Streaming read-aloud** — `requestVoicePlayback(...)` on `voicePlaybackBus`; the app's single
  speaker is `useAutoVoiceResponse` + `useCartesiaStreamingSpeaker`, mounted once by
  `providers/AudioOutputHostImpl.tsx`. There is exactly one legal importer of the streaming
  speaker — do not add a second.
- **Lazy mount + activation latch** — `providers/AudioSystemHost.tsx` / `features/audio/activation.ts`.

What the platform does **not** have, and this tree does:

1. **Hands-free turn boundaries** — `useMicVAD` (`@ricky0123/vad-react`) detecting speech
   start/end with no button. The three dead hooks are the only `useMicVAD` consumers in the repo.
2. **Idle auto-sleep** — the timer + `wakeUp()` in `useVoiceChatWithAutoSleep.ts:56-135`. Worth
   lifting close to verbatim; it is the one piece here with no equivalent anywhere else.

## The work, if the answer is yes

1. **One hook on the live stack** — `useMicVAD` for boundaries → `useChunkedRecordAndTranscribe`
   for the transcript → `launchAgentExecution` for the turn → `requestVoicePlayback` for the
   reply. Not a fourth fork of `useVoiceChat`.
2. **Lift the auto-sleep timer** into that hook (or a small `useIdleSleep` primitive if a second
   consumer appears — not before).
3. **Give it a surface.** `/voice/playground` (`features/audio/voice/AiVoicePage.tsx`) is the
   natural home; decide whether it is a mode there or its own route. The
   `components/voice/voice-assistant-ui/*` UI is a candidate donor for the sidebar/conversation
   chrome, but it stores conversations in `localStorage` under `voice-conversations` and knows
   nothing of `chat.*` — that persistence is the part to drop, not port.
4. **Collapse the forks.** Whatever survives, exactly one `useVoiceChat*` remains.
   `useVoiceChatCdn` is a literal copy and can go in the same change once the decision exists.
5. **Delete the retirement stubs** (`assistant-modular.ts`, `voice-assistant.ts`) once nothing
   imports them.

## If the answer is no

Arman says so in writing; then the whole tree goes in one commit — the three hooks,
`components/voice/voice-assistant-ui/**`, the two retirement stubs, `hooks/tts/usePlayer.ts` /
`usePlayerSafe.ts` if their last consumers go with it (`usePlayer` is also used by
`app/(dev)/demos/general/voice/debate-assistant/`), and `@ricky0123/vad-react` from
`package.json`. Until then it stays, and D198 stays open.
