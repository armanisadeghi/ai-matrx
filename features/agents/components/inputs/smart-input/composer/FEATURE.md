# FEATURE.md — `composer` (the three-mode, three-size chat composer)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-09-27`

> Build map (design control → the existing piece it facelifts):
> `/Users/armanisadeghi/code/common-docs/projects/ai-matrx-composer/MAP.md`.
> Rulings: Arman's `composer-spec.md` + `composer-spec-amendment-1.md` (the amendment wins) and the
> design canvas `https://claude.ai/artifact/Gv24abtRNnxW3X41YTLxAb`.

---

## Purpose

The chat composer from Arman's design — **Chat · Work · Advanced** (each mode shows more) in three
sizes, **splash · page · compact** — as an OPTIONAL `composer` prop on `SmartAgentInput`. It is the same
engine as the classic composer (send, queue/steer/stop, drafts, drop, paste, variables, resources,
context rail); only the chrome is arranged differently.

---

## Entry points

**The prop** — `SmartAgentInput` / `AgentConversationColumn.smartInputProps` → `composer?: ComposerPresentation`
(`composer-types.ts`): `size`, `mode`, `agent.onSelectAgent(agentId, via?)`, `placeholder`, `maxInputHeightPx`.
**Absent = the classic composer, byte-for-byte.** Every host that does not pass it is untouched.

**Where it threads** (each an additive optional prop, nothing else changed):
- `SmartAgentInput` → `SmartAgentInputStacked` (composer branch; never the single-row/ambient path).
- `InputActionButtons.composer` — the same send/stop/mic/+ elements, arranged per size.
- `RunControlsMenu.composer` — desktop `+` opens `ComposerPlusMenu`; phones keep the bottom sheet, tabs filtered by mode.
- `AgentTextarea.placeholder` / `.maxHeightPx` — literal placeholder; unexpanded cap (default 200).
- `ResourcePickerMenu.initialView` + `onExitInitialView` — open straight into one picker (the cascade).

**Components** (this folder)
- `ComposerModeSwitch` — Chat · Work · Advanced; `size="bar"` (top bar) or `"panel"` (chat panel header).
- `ComposerAgentPill` — Chat: ★ presets · Custom (+ its model) · Manage chat agents. Work: agent + Change ·
  Recent · Model. Advanced: + Overrides · Advanced.
- `ComposerPlusMenu` — the 300px cascading + menu; `ComposerEnvironmentPanel` (also the Cloud chip's menu).
- `ComposerMetaRow` / `ComposerPills` — Scope · Output | Agent · Effort · Auto (compact: Agent · Auto only).
- `ComposerChipsRow` — Work+: Cloud chip + this chat's connections.
- `ComposerOutput` — Output pill/panel (Shapes + Let the agent decide).
- `ComposerEffortPill`, `ComposerAutoPill`, `ComposerMenu` (the row primitives), `ComposerSplash`
  (`ComposerGreeting`, `ComposerQuickActions`).

**Hooks**
- `useComposerMode(initialMode)` — the ONE mode reader/writer (tab-wide Redux `chatRoute.composerMode`).
- `useComposerAgent(conversationId)` / `useEffectiveModelId` — agent, effective model, Custom, presets.
- `useRecentWorkAgents(enabled, excludeIds)` — last three agents from `chat.conversation`.

**Server** — `readComposerModeCookie()` (`composer-mode.server.ts`): the "last mode used" cookie for first paint.

**Demo** — `/demos/composer` (`app/(dev)/demos/composer/`): a real conversation, mode + size switches.

**Settings** — `platform.feature_knob`, feature `agents.chat_composer`, org + user overridable
(`migrations/chat_composer_knobs_2026_09_27.sql`): `default_mode`, `remember_last_mode`,
`compact_input_max_height_pct`, `quick_actions`, `floating_panel_size`. Read via `COMPOSER_KNOBS` + `useSessionKnob`.

---

## Key flows

**Mode resolution.** First paint = the server-read cookie, else Chat. When the knobs answer (once per
TAB), `modeAfterKnobs` decides: remembering + cookie → keep; remembering + no cookie → `default_mode`;
not remembering → `default_mode` and the cookie is cleared. `setMode` writes Redux + (when remembering)
the cookie. Every composer, the top-bar switch and a floating chat read the same value.

**Agent switch.** The pill never navigates. It calls the host's `onSelectAgent(agentId, via?)`; `via.mandateKey`
is set for Custom (`chat.default_new_chat`) so the host launches THROUGH the job — only that launch applies
the person's `agents.model_prefs.chat_default_model`. No `onSelectAgent` = a fixed agent (no presets/Change/Recent).

**Custom's model.** Picking a model under Custom writes the user rung of
`agents.model_prefs.chat_default_model` (`setKnobOverride`) and, when Custom is the current agent, the
conversation's model override too (the knob only seeds new conversations).

**+ menu cascade.** Each attach row renders `ResourcePickerMenu initialView=<view> onExitInitialView=closeCascade`
in a nested Popover (a child Radix layer — clicks inside never dismiss the parent). Every attach behaviour
(durable file edges, Google's context directive, conversation references as context entries) is that code.

---

## Invariants & gotchas

- **Never fork the composer.** A new arrangement is a branch on the `composer` prop, composed from the
  SAME engine pieces. Classic-path source strings are pinned by `__tests__/textarea-auto-resize`,
  `responsive-run-controls` (exactly 3 send/stop class strings in `InputActionButtons.tsx` — the composer
  reuses the same JSX elements, never new copies) and `composer-controls-are-named`.
- **One drop target per composer**, wrapping the variables AND the textarea (`AgentVariablesInline`
  finds `[data-agent-main-input]` through `[data-agent-input-shell]`); the shell stays `relative` + rounded.
- **The + trigger must stay mounted in every mode** — it owns `useConversationDocumentsBridge`.
- **The context rail renders in every mode** — it owns the agent-lists realtime subscription.
- **A size change remounts the textarea** (`key` includes the size): the paste listener binds to the element.
- **THE ONE TABLE** (`composer-mode-visibility.ts`) decides what a mode shows; no control carries its own
  mode check. Hiding is chrome only — switching modes never turns anything off. Pinned by `__tests__/composer-modes.test.ts`.
- **Hidden, never faked** (brief Q5). Not shown because no capability exists yet: Manual (no approval
  gate client or server), per-chat Vault, team sandbox, Files/Media/Artifacts/The Matrx output families,
  Meta Ads accounts, a server token count on Preview context.
- **Memory is a global one-shot signal** (`requestMemoryToggle` rides the NEXT send of any conversation);
  the row shows the pending state ("Turns on with your next message"). Conversation-keying it is open work.
- Every composer `PopoverContent` with a width class carries the `/* sizing: fixed — … */` comment
  (`pnpm check:popover-sizing`).

---

## Change Log

- **2026-09-27** — Built: modes + knobs + cookie, three sizes, agent pill (presets/Custom/panel/Recent),
  cascading + menu, meta row, chips row, Output (Shapes), Effort, Auto, splash greeting + quick actions,
  phone tab filtering, `/demos/composer`; `chat-agent` seeded on three quick-start agents.
