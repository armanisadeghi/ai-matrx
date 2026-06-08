# Transcription Cleanup (page route)

**Status:** Active · new starting point (2026-06-08)
**Route:** `/transcripts/cleanup` → [`app/(core)/transcripts/cleanup/page.tsx`](<../../app/(core)/transcripts/cleanup/page.tsx>) (legacy `/transcription/cleanup` 308-redirects via `next.config.js`)
**Entry component:** [`components/CleanupPad.tsx`](./components/CleanupPad.tsx)

> Route note: the `transcription/*` route group was renamed to `transcripts/*`
> on 2026-06-08 (next.config redirect `/transcription/:path* → /transcripts/:path*`).
> The page lives under `transcripts/`; the old `transcription/cleanup` folder was
> deleted (the redirect makes it unreachable).

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

- **Header:** lives in the app shell header via `<PageHeader>` (portal into
  `#shell-header-center`) — no in-body header bar, no wasted vertical space.
  The page wrapper is `h-full overflow-hidden`; content sits behind the
  transparent shell header and each panel clears it with `pt-[var(--shell-header-h)]`.
- **Resizable splits:** the `WindowPanel` chrome is replaced by two
  react-resizable-panels v4 groups using the themed
  [`ResizableHandle`](../../components/ui/resizable.tsx):
  - horizontal `id="cleanup-h"`: sidebar │ main
  - vertical `id="cleanup-v"` (nested in main): transcript ─ response
  Layouts persist via cookies (`panels:cleanup-h`, `panels:cleanup-v`) — the
  server (`page.tsx`) reads them and passes `defaultLayout` so the split paints
  at saved sizes on first frame; the client writes on `onLayoutChanged`.
- **Mobile (<768px):** resizable panels collapse poorly, so the layout switches
  to a stacked transcript/response with the options in a slide-over drawer
  (toggled from the header). The drawer is `fixed`, so it carries its own dock
  clearance padding.
- **Agent picker:** the shadcn `RadioGroup`/`RadioGroupItem` (theme-aware,
  correct in dark mode) — replaced the raw `<input type="radio">` that rendered
  white-on-white in dark mode.
- **Mic:** a central, prominent "Tap to record" control (size `lg`) at the top of
  the main column — not a corner icon.
- **State key:** voice-pad state is keyed under `overlayId="transcriptionCleanupPage"`,
  `instanceId="main"` so it never collides with the floating overlay's state.
- iOS-zoom guard: the main textareas use `text-base md:text-sm` (≥16px on mobile).

## Invariant (carried over from the original)

What is sent to the AI **must** equal what the user sees in the transcript
textarea. `baseTextRef` holds the latest visible text so async flows
(auto-process on transcription complete, mic callback) never drift from the
textarea on a stale closure.

## Change Log

- 2026-06-08 — Created. Faithful page-route duplicate of the cleanup window panel;
  responsive shell (desktop sidebar / mobile drawer), dock clearance, iOS-zoom guard.
  Verified on desktop + mobile via preview.
- 2026-06-08 — Moved to `/transcripts/cleanup` (route-group rename); deleted the old
  `transcription/cleanup`. Header moved into the shell header via `<PageHeader>`;
  both dividers made resizable (react-resizable-panels v4 + themed handle, cookie
  persistence); agent picker switched to shadcn `RadioGroup` (fixes dark-mode
  dials); solid `border-border` throughout; agent/context spacing widened; mic
  relocated to a central, larger "Tap to record" control. Verified desktop +
  tablet + mobile, light + dark.
