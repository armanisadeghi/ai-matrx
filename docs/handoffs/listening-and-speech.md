---
status: active
updated: 2026-09-08
repos: [matrx-frontend]
scope: tail
feature: Listening & Speech
vision: []
---

# Listening & Speech — tail

**What this is:** The platform's read-aloud stack — the "Listen" action that turns any
selected text or on-screen content into a spoken summary (optionally speaking it *as it is
being written*), plus the tiered voice/speed/language settings that every speech surface in
the app obeys.
**Scope:** Tail
**Feature:** Listening & Speech — code split across `features/audio/`,
`features/window-panels/windows/listen/`, `features/context-menu-v3/`
**Vision:** VISION MISSING — no vision doc exists. Arman's verbatim words are below, from the
build session (mirrored to AI Matrx conversation `160a64a6-b95d-5087-8f55-c68243d7aef9`).

## Vision — Arman's words (verbatim, unedited)

On making it universal:
> "Could we just build this into just about every site? In fact, couldn't this easily become
> something that is a default part of our context menu since all menus have either some content
> or selected text? … it might be a better idea to just have a single menu with two options so
> it takes only one slot in the menu"

On the settings cascade — **the load-bearing one**:
> "the way we want it to work is to have the configurations be like everything else new that
> we're building in our system where you have a configuration panel, and we get one at the
> system. The organization gets one, and then the user gets one. And So the user always wins,
> but if the user doesn't have an override and the org does, then the org wins. And if the org
> doesn't have one either and the user doesn't have one, then we get the system default. But
> then all of the system defaults should be customizable by me in a centralized place."

On why it matters beyond this feature:
> "can we try to get this feature to that point so that it becomes a model for what we can do?"

## Resources

- **Settings model (read first):** [`features/audio/service/listeningConfig.ts`](../../features/audio/service/listeningConfig.ts)
  — the resolution point. Its header explains the tiering and the "voice keeps reverting" root
  cause. Writes: [`useListeningSettings.ts`](../../features/audio/service/useListeningSettings.ts) (writes MY tier only).
- **Speech entry point:** [`features/audio/service/speak.ts`](../../features/audio/service/speak.ts) — the ONE way to make audio. Never hand-roll.
- **iOS unlock:** [`features/audio/unlock.ts`](../../features/audio/unlock.ts) — call `primeAudioOutput()` in any handler that later starts audio.
- **The panel:** [`features/window-panels/windows/listen/ListenSummaryWindow.tsx`](../../features/window-panels/windows/listen/ListenSummaryWindow.tsx) (overlay `listenSummaryWindow`).
- **Menu entry points:** `features/context-menu-v3/model/menu-model.ts` (`listen` submenu role) ·
  `features/context-menu-v3/hooks/useContextMenuActions.ts` (agent resolution + fallback) ·
  `messageActionRegistry.ts` → `listeningItems` (action-bar ⋯ menu).
- **Skill:** invoke `tts-audio-system` before touching any audio file (updated 2026-09-08 — it is now accurate).
- **FEATURE.md change logs holding this feature's history:** `features/audio/`, `features/window-panels/`, `features/context-menu-v3/`, `features/agents/components/chat/`.
- **DB identifiers (verified live 2026-09-08):** mandate `ambient.spoken_summary` in
  `mandate.definition` (enabled; `default_holder_type='agent'`, holder = "Listening Summary",
  system org) · surface role `spoken_summary` on `matrx-user/assistant-message` carrying that
  `mandate_key` · settings rows in `ui.ui_surface_config` namespace `listening` (1 system-global
  row + 33 user rows; **zero org rows**).
- **Admin editing (system default):** `/administration/ui/surfaces/matrx-user/assistant-message`
  → "Config namespaces" → `listening`. Raw JSON textarea, writes the global tier.
- **Testing:** `pnpm preview:start` (port 3001), sign in via
  `/api/dev-login?token=$DEV_LOGIN_TOKEN&next=/chat`. Right-click any assistant reply → Listen,
  or the ⋯ menu → Actions. Tests: `pnpm jest features/audio features/context-menu-v3/model`.

## Remaining work

1. **Org tier has no editor — the middle rung of Arman's cascade is unreachable.**
   Resolution already merges org rows correctly and `setNamespaceConfig` accepts an org scope;
   what is missing is any UI that writes one, so zero org rows exist. **Do not build this
   blind** — it is entangled with the settings campaign's open ruling Q4 ("Who may write at
   each scope?") in
   `/Users/armanisadeghi/code/common-docs/projects/unified-settings-platform/DECISIONS.md`.
   Read that first; if Q4 is still open, this stays blocked and belongs in Decisions below.

2. **Decide where this feature's `FEATURE.md` lives, then write it.** Today the feature has no
   owning doc — it exists only as change-log entries in four unrelated FEATURE.md files, which
   is why a fresh agent cannot find it. Recommended: a "Listening & Speech" section in
   `features/audio/FEATURE.md` (it already owns `speak()`, the queue, the unlock primitive and
   the tiered config) with pointers from the other three. There is no `features/tts/FEATURE.md`
   and `features/tts/` contains no markdown at all.

3. **Close out the agent-review row.** `agent.review_queue` id
   `b464b22c-04f5-4fc2-83cc-602a901fec6b` has sat at `submitted` since 2026-08-31 and was never
   picked up. Arman has since confirmed mobile audio works ("The audio tests passed",
   2026-09-08), which was the row's last open question — so this is a review-and-archive, not a
   repair. Invoke the `agent-review-queue` skill.

4. **Consider a real form for the system default.** The admin editor is a raw JSON textarea.
   Arman's words were "all of the system defaults should be customizable by me in a centralized
   place" — a JSON box technically satisfies it, a voice/speed/language form actually does.
   Small, and it is the same three controls the Listen panel already renders.

## Done

- Listen actions universal via one context-menu submenu + the action-bar ⋯ menu — see `features/context-menu-v3/model/menu-model.ts` (`listen` role) and `messageActionRegistry.listeningItems`.
- Listen panel with streaming summary + audio transport + in-place settings pane — see `features/window-panels/windows/listen/ListenSummaryWindow.tsx`.
- Stream-to-stream speech (speaks while the summary is still being written) — see `voicePlaybackBus` `includeActive` + `useAutoVoiceResponse`.
- Mandate-backed default agent so it works for every user on every surface with no personal binding — `ambient.spoken_summary`; no agent UUID in code.
- Tiered voice/speed/language settings (system → org → user) + backfill — see `features/audio/service/listeningConfig.ts`.
- iOS/WebKit silent-audio class fixed (gesture unlock, shared context, silent-switch session, loud block errors) — see `features/audio/unlock.ts`. **Confirmed working on device by Arman 2026-09-08.**
- Docs/skill drift repaired 2026-09-08 — `tts-audio-system` skill rewritten to current reality; superseded window-panels entry corrected.

## Decisions needed

**Org-level speech settings — who may set them, and does this feature wait?**

*Situation.* Speech settings (voice, speed, language) resolve system → org → user today, and the
user and system rungs both have working editors. The org rung resolves correctly but nothing in
the product can write one, so no organization has ever set a default voice. Building that editor
means deciding who is allowed to set settings for a whole organization — the same question the
Unified Settings Platform campaign has parked as its open ruling Q4, which is currently blocking
that entire campaign's build.

*Decide.* Either (a) answer Q4 once for the whole platform and let this feature follow it, or
(b) ship a narrow org editor for speech settings only, gated to org admins, accepting that a
later platform-wide ruling may change it. (a) keeps one rule; (b) completes Arman's stated
cascade for this feature now.

**Does the listening config migrate onto `platform.feature_knob`?**

*Situation.* This feature stores its settings in `ui.ui_surface_config` (the surface-config
namespace system). The settings campaign has separately ruled (USD-1) that the canonical
settings system for the platform is `platform.feature_knob`. Arman asked for this feature to
become "a model for what we can do", so the two need to agree — right now the model and the
canon are different tables.

*Decide.* Either the listening config migrates onto `platform.feature_knob` when that campaign
builds, or surface-scoped settings stay a deliberate, documented exception because they hang off
a surface identity rather than a feature knob.
