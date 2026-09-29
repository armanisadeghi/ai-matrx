# FEATURE.md — `composer` (the three-mode, three-size chat composer)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-09-29`

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
(`composer-types.ts`): `size`, `mode`, `agent.onSelectAgent(agentId, via?)`, `placeholder`, `maxInputHeightPx`,
`textMenu` (the host's right-click agent menu over the draft — v3 `EditableContextMenu` props + a click-time
`getApplicationScope(textarea)`). **Absent = the classic composer, byte-for-byte.** Every host that does not pass it is untouched.

**Hosts today:** every `/chat` route (`ChatRoomClient` — `/chat/new` splash, conversations at page size; its
`textMenu` is `chat/agent-context/chatComposerTextMenu.ts`), the canvas workspace's docked/floating chat
(compact, `features/canvas/workspace/`) — including modules hosted in it (education, for signed-in people);
Quick Chat (compact, agent switch = its header picker's fresh conversation, Custom launches through the job);
the Chat window `AgentRunWindow` (compact, agent switch = its title-bar picker, Custom through the job); the
Utilities Hub "AI Results" tab (`ChatHistoryWorkspace enableInput`, compact, fixed agent); `/agents/[id]/run`
(`AgentRunnerPage`, page, fixed agent); the agent builder's test panel (compact, fixed agent); a record's chat
(`RecordScopedChat`, compact, fixed — a switch would leave the record binding); the AI tutor (page on
`/education/tutor/*`, compact in AskTutor, fixed agent). Compact hosts cap the input with `useCompactInputMaxHeight`.

**Where it threads** (each an additive optional prop, nothing else changed):
- `SmartAgentInput` → `SmartAgentInputStacked` (composer branch; never the single-row/ambient path).
- `InputActionButtons.composer` — the same send/stop/mic/+ elements, arranged per size.
- `RunControlsMenu.composer` — desktop `+` opens `ComposerPlusMenu`; phones keep the bottom sheet, tabs filtered by mode.
- `AgentTextarea.placeholder` / `.maxHeightPx` / `.textMenu` — literal placeholder; unexpanded cap (default 200);
  the menu wraps the ONE textarea (`ComposerTextMenuFrame`), never a second one.
- `ResourcePickerMenu.initialView` + `onExitInitialView` — open straight into one picker (the cascade).

**Components** (this folder)
- `ComposerModeSwitch` — Chat · Work · Advanced; `size="bar"` (top bar; below `sm` ONE button naming the mode
  that opens the three, because the phone top bar has no room for three segments) or `"panel"` (chat panel header).
- `ComposerAgentPill` — **agents first** (Arman, 2026-09-28). Chat (only Chat) reads `agent · model`; its menu is
  the ★ chat agents + Custom, **All agents** (the ONE picker), and the **model for this chat** (change the model,
  keep the chat agent; under Custom it also saves your default). Work / Advanced: the pill names the agent and IS
  the agent picker (`AgentListDropdown` with the pill as its trigger) — one click, no half-way panel. A fixed
  agent (no `onSelectAgent`) is a plain label.
- `ComposerPlusMenu` — the 300px cascading + menu, IDENTICAL in every mode: attach rows, Search your knowledge
  (the classic ⌘K list), Tools, Skills, Connectors, Environment, Preview context, templates, Memory, Enter sends,
  Working doc, Scratchpad, Auto-clear, **Model and overrides** (model picker + the per-run overrides — the model
  is secondary to the agent, so it lives here in every mode), and **All options** (always present — opens the Chat Options window until
  every setting has a home in the new UI).
- `ComposerConnectorsPanel` — the + menu's Connectors: search, "Active in this chat" / "Connected · off in this
  chat" rows (per-chat switch = `addedMcpServers`; Reconnect; `Choose ›` = the ONE attach picker; an agent's own
  connector is on and fixed), "Browse all connectors" = the live integrations window (connect anything new).
- `ComposerEnvironmentPanel` — the Cloud chip's menu and the + menu's Environment: ONE flat list, one click chooses
  (Cloud · your computers · sandboxes, via `useComputeTargetActions.applyBinding`), plus Persistent browser and
  "Add a sandbox or computer". No nested pickers.
- `ComposerMetaRow` / `ComposerPills` — Scope · Output | Agent · Effort (compact: Agent only). One line always:
  the row (and the chips row) scrolls sideways on a phone, never wraps (`COMPOSER_ROW_CLASS`).
- `composer-chip.ts` — THE chip: 24px, `text-xs`, `rounded-md`, for every chip and pill around the input (Cloud,
  connections, working context, the page chip, the context rail's pills, agent / effort / output).
- `ComposerChipsRow` — Work+: Cloud chip + this chat's connections (`ChatConnectionsStrip variant="chips"`, the
  same data and doors as the + menu's rail at the composer's 28px chip size, `composer-chip.ts`). **Advanced**
  (`chips.repos`) adds a chip per resource chosen from an attachable connection (`name · default branch`) and a
  `+ Choose …` chip when none is chosen; Work shows only a count on the connection. Chosen items are spoken only
  after the attachments read succeeded — a failed read is its own retry chip, never "nothing chosen".
- `ComposerOutput` — Output pill/panel, two multi-select levels, sticky per chat (× resets to Text only).
  **Types** (Text on by default · Image · Audio · Video · Voice · Music · Document · Spreadsheet · Presentation ·
  PDF · Code · Data) live in `builderAdvancedSettings.outputTypes` and are NOT sent (no request field exists; the
  agent picker cannot filter by them yet) — the panel says so. **Shapes** = the whole kind catalog (System ·
  Organization · Mine tabs with counts) read through the canonical `fetchShapePage` → `shx_list_scoped`
  (`useOutputShapeCatalog`), searchable, paged 50 at a time, selected pinned on top. A kind with a render_block
  skill (curated chip skill or `kind_<kind>`) toggles it in `addedSkills` (sent as `skill_config.included`, same
  write as the Quickset chips); a kind with none is kept in `outputKinds` and marked "no skill". Pure logic:
  `output-selection.ts` (test `__tests__/composer-output-selection.test.ts`).
- `ComposerEffortPill` — **Auto = no override** (the agent's own setting runs, named in the Auto row); any other
  choice is sent as exactly that `reasoning_effort` override; the literal "auto" is never sent. `ComposerMenu` (the row primitives), `ComposerSplash`
  (`ComposerGreeting`, `ComposerQuickActions` with a `trailing(mandateKeys)` slot for the host's intelligence
  icon, `ComposerQuickActionsSkeleton`). The quick-action row is absent with no active organization.

**Hooks**
- `useComposerMode(initialMode)` — the ONE mode reader/writer (tab-wide Redux `chatRoute.composerMode`).
- `useCompactInputMaxHeight()` — THE compact input cap: `measureRef` on the panel, `maxInputHeightPx` =
  panel height × `compact_input_max_height_pct` (50% until the knob answers; `undefined` until measured).
- `useComposerAgent(conversationId)` / `useEffectiveModelId` — agent, effective model, Custom, presets.

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
the person's `agents.model_prefs.chat_default_model`. No `onSelectAgent` = a fixed agent (a plain label in Work+; Chat shows only the model).

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
- **No mode has less capability** (Arman, 2026-09-27). Chat tucks things into the + menu; it never loses them.
  Every mode gets every `plus.*` row and every phone tab; modes differ only in what sits OUTSIDE the + menu
  (agent panel, chips row, effort, overrides, repo chips).
- **The page is ONE chip** — the context rail (`ConversationContextRail` → `PageContextChip`) folds every value the
  page's SURFACE contributed (`selectSurfaceContextKeys`) into one chip: click = the values listed + the switch;
  off = an eye-off icon in the same spot (`setPageContextEnabled` — on re-reads the page via `refreshSurfaceScope`).
  Hand-attached and other-source context keeps its own chips.
- **No border lines** on headers or between panels — the design has none.
- **Hidden, never faked** (brief Q5). Not shown because no capability exists yet: Manual (no approval
  gate client or server), per-chat Vault, team sandbox, Files/Media/Artifacts/The Matrx output families,
  Meta Ads accounts, a server token count on Preview context.
- **Every mode's + menu says what Enter does** (`plus.enterSends`: the per-conversation `submitOnEnter` switch with
  the rule in force as its description) — the composer hides the classic toolbar toggle, never the rule.
- **`useComposerMode(initialMode, { enabled })`** — a host that renders no composer this time (a `ChatRoomClient`
  shared with voice, staff, interview rooms) passes `enabled: false`: no knob read, no seeding, no cookie write.
- **Memory is a per-conversation one-shot signal** (`requestMemoryToggle({conversationId, enabled})` rides
  THAT conversation's next send, then clears); the row shows the pending state ("Turns on with your next message").
- Every composer `PopoverContent` with a width class carries the `/* sizing: fixed — … */` comment
  (`pnpm check:popover-sizing`).

---

## Change Log

- **2026-09-29** — Review fixes: "auto" effort guarded at the API selector (never sent, whichever panel wrote it); overrides survive a same-id re-create; the touch Enter rule covers every multi-line input (variable inputs, mention composer, AI chat modal, prompt input) while single-line `ProInput` keeps Go-to-submit; Quick Chat's duplicate header agent picker and "Page context" button removed — the pill and the page chip are the one control each (`useConversationFollowsPage(id, startsOn)`: Quick Chat starts off, showing the eye-off chip naming the page).
- **2026-09-29** — Batch 1 of the page-by-page rollout: Quick Chat, the Chat window, the AI Results tab, the agent
  run page, the builder test panel, the record chat and the AI tutor render the composer (sizes and agent
  switching in "Hosts today"). The canvas's inline input-cap code became `useCompactInputMaxHeight`, shared by
  every compact host (test `__tests__/compact-input-max-height.test.tsx`). Skipped as special-purpose inputs:
  execution gates / pre-execution inputs, agent-comparison battle inputs, ambient/scroll/voice launchers, war
  room, masterwork, cx-chat, code editors, transcript studio.
- **2026-09-28** — Agents first: Chat pill = agent · model (chat agents, All agents, model for this chat); Work/Advanced
  pill opens the agent picker directly; Model and overrides moved into + (every mode); the run-approval "Auto" pill
  deleted (Auto is effort, = no override); one 24px `rounded-md` chip everywhere; rows never wrap; tighter spacing;
  Enter never sends on a touch-only device (`enterSendsHere` in `components/official/composer/composerSubmit.ts`,
  every composer) and no "Enter sends" switch is offered there.
- **2026-09-28** — Output rebuilt to Arman's ruling: multi-select output types (Text default; shown, not sent),
  and Shapes over the full kind catalog (search, System/Organization/Mine, paging, pinned selections) replacing
  the five hardcoded chips; kind skills still ride `addedSkills`; `outputTypes`/`outputKinds` added to
  `BuilderAdvancedSettings` and carried across a re-create.
- **2026-09-28** — Every composer control is reachable by Tab (a11y pass): Send, Stop, Attach/Chat options,
  Documents & context, the variable row's choices and expand buttons had `tabIndex={-1}`, so Tab never reached Send.
  A disabled Send is native `disabled` (skipped by the browser). Guard: `inputs/__tests__/composer-controls-are-reachable.test.ts`.
- **2026-09-27** — Round 4: no mode has less capability (identical + menu, all phone tabs); Connectors panel;
  one-click Environment list; Search your knowledge; Auto-clear row; always-present All options; the page as ONE
  context chip (replaces the workspace's page-context row); borders removed.
- **2026-09-27** — Independent review fixes: "Enter sends" row in every mode; `useComposerMode` `enabled`; chips row
  at composer size with Advanced resource chips; "Auto effort"; `/chat` placeholder "How can I help you today?"
  until the conversation has messages.
- **2026-09-27** — Plugged into every `/chat` route (splash on `/chat/new`, page size in conversations, header mode
  switch); `textMenu` added (the retired `/chat/new` hero's right-click menu, now on every chat composer);
  phone top bar = one mode button; `ComposerQuickActions.trailing` + `ComposerQuickActionsSkeleton`.
- **2026-09-27** — Built: modes + knobs + cookie, three sizes, agent pill (presets/Custom/panel/Recent),
  cascading + menu, meta row, chips row, Output (Shapes), Effort, Auto, splash greeting + quick actions,
  phone tab filtering, `/demos/composer`; `chat-agent` seeded on three quick-start agents.
- **2026-09-27** — Memory's pending switch is keyed per conversation (`memoryToggleByConversationId`); it was one
  global flag that rode whichever conversation sent next.
