# Transcription Cleanup (page route)

**Status:** Active · new starting point (2026-06-08)
**Route:** `/transcription/cleanup` → [`app/(core)/transcription/cleanup/page.tsx`](../../app/(core)/transcription/cleanup/page.tsx)
**Entry component:** [`components/CleanupPad.tsx`](./components/CleanupPad.tsx)

## What this is

A standalone, full-page version of the **Transcription Cleanup** tool — record →
auto-clean with an AI agent → edit → copy/save. It is a **deliberate,
user-requested duplicate** of the floating window-panel version that lives at
`components/official-candidate/transcription-cleanup/`. The window panel is the
reliable tool the user keeps returning to; this page is the place to evolve it
into a modern, professional, mobile + desktop experience without risking the
original. The `transcript-studio` feature was the previous attempt at a "better"
version; this page restarts from the proven cleanup behaviour instead.

The two cleanup surfaces are intentionally independent. Do **not** try to merge
them or re-point one at the other unless the user asks.

## Files (all duplicated from the overlay version)

- `ai-agents.ts` — the system cleaner agents + custom-agent shape.
- `hooks/useAiPostProcess.ts` — launches the agent and exposes streaming state.
- `components/CleanupContextPanel.tsx` — multi-block context editor (notes-backed).
- `components/CleanupPad.tsx` — the page shell + transcript/response panes.

## What is NOT duplicated (shared platform primitives — keep using these)

- Voice-pad + agent-execution Redux (`lib/redux/slices/voicePadSlice`,
  `features/agents/redux/execution-system/*`).
- `MicrophoneIconButton`, `ContentActionBar`, `FilesTapButton`.
- `NotesAPI` (context blocks save into the "Transcription Contexts" folder).
- `stripThinkingStreaming`, `useSetting`, `useIsMobile`.

## Key differences from the overlay version

- **Chrome:** the draggable `WindowPanel` is replaced by a responsive page shell.
  - Desktop / tablet (≥768px): collapsible inline sidebar + split body.
  - Mobile (<768px): sidebar becomes a slide-over drawer, opens closed by default.
- **State key:** voice-pad state is keyed under `overlayId="transcriptionCleanupPage"`,
  `instanceId="main"` so it never collides with the floating overlay's state.
- **Dock clearance:** the page reserves bottom space for the app shell's floating
  dock below 1024px (`--shell-dock-h`), so the Clean Up button never hides behind it.
- iOS-zoom guard: the two main textareas use `text-base md:text-sm` (≥16px on mobile).

## Invariant (carried over from the original)

What is sent to the AI **must** equal what the user sees in the transcript
textarea. `baseTextRef` holds the latest visible text so async flows
(auto-process on transcription complete, mic callback) never drift from the
textarea on a stale closure.

## Change Log

- 2026-06-08 — Created. Faithful page-route duplicate of the cleanup window panel;
  responsive shell (desktop sidebar / mobile drawer), dock clearance, iOS-zoom guard.
  Verified on desktop + mobile via preview.
