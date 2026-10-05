# FEATURE.md — `composer` (the Smart Agent Input)

**Status:** `active`
**Tier:** `1`
**Last updated:** `2026-10-04`

> Build map (design control → the existing piece it facelifts):
> `/Users/armanisadeghi/code/common-docs/systems/chat/conversations/projects/ai-matrx-composer/MAP.md`.
> Rulings: Arman's `composer-spec.md` + `composer-spec-amendment-1.md` (the amendment wins) and the
> design canvas `https://claude.ai/artifact/Gv24abtRNnxW3X41YTLxAb`.

---

## Purpose

**The Smart Agent Input** — the one chat input of the app. Its styles are **Full** (sizes **splash** ·
**page**), **Compact** and **Launcher**; its modes are **Chat · Work · Advanced** (each mode shows more).
Presentation comes from the REQUIRED `composer` prop on `SmartAgentInput`. One engine: send,
queue/steer/stop, drafts, drop, paste, variables, resources, context rail.

---

## Entry points

**The prop** — `SmartAgentInput` / `AgentConversationColumn.smartInputProps` → `composer: ComposerPresentation` (required)
(`composer-types.ts`): `size`, `mode`, `agent.onSelectAgent(agentId, via?)`, `placeholder`, `maxInputHeightPx`,
`textMenu` (the host's right-click agent menu over the draft — v3 `EditableContextMenu` props + a click-time
`getApplicationScope(textarea)`). `composer` is required: there is no other layout.

**Hosts today:** every `/chat` route (`ChatRoomClient` — `/chat/new` splash, conversations at page size; its
`textMenu` is `chat/agent-context/chatComposerTextMenu.ts`), the canvas workspace's docked/floating chat
(compact, `packages/chat/src/canvas/workspace/`) — including modules hosted in it (education, for signed-in people);
Quick Chat (compact, agent switch = its header picker's fresh conversation, Custom launches through the job);
the Chat window `AgentRunWindow` (compact, agent switch = its title-bar picker, Custom through the job); the
Utilities Hub "AI Results" tab (`ChatHistoryWorkspace enableInput`, compact, fixed agent); `/agents/[id]/run`
(`AgentRunnerPage`, page, fixed agent); the agent builder's test panel (compact, fixed agent); a record's chat
(`RecordScopedChat`, compact, fixed — a switch would leave the record binding); the AI tutor (page on
`/education/tutor/*`, compact in AskTutor, fixed agent). Compact hosts cap the input with `useCompactInputMaxHeight`.

**Where it threads** ():
- `SmartAgentInput` → `SmartAgentInputStacked` (the one layout, plus the variables-only Run mode).
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
  (the ⌘K list), Tools, Skills, Connections, Environment, Preview context, templates, Memory, Enter sends,
  Working doc, Scratchpad, Auto-clear, **Model and overrides** (model picker + the per-run overrides — the model
  is secondary to the agent, so it lives here in every mode), and **All options** (always present — opens the Chat Options window until
  every setting has a home in the new UI).
- `ComposerConnectorsPanel` — the + menu's Connections: search, "Active in this chat" / "Connections · off in this
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
  PDF · Code · Data) live in `builderAdvancedSettings.outputTypes` and are NOT sent (no request field exists) — the
  panel says so. They DO narrow the agent picker (`agent-output-filter.ts` + `useComposerAgentFilter`): Text→text,
  Image→image, Audio/Voice/Music→audio, Video→video, the file types do not filter; an agent passes when its MODEL's
  output modalities (model registry `capabilities.output`) include ANY asked modality; unknown model = shown; Text
  only (or text-equivalent) = no filter. Every `AgentListDropdown` the pill opens (Work/Advanced pill, folded menu,
  Chat's "All agents") gets `agentFilter` — the picker shows a "Makes: Image" chip with Show all (for this open),
  and the current agent stays pinned. **Shapes** = the whole kind catalog (System ·
  Organization · Mine tabs with counts) read through the canonical `fetchShapePage` → `shx_list_scoped`
  (`useOutputShapeCatalog`), searchable, paged 50 at a time, selected pinned on top, each row with the shape's one-line description (`kind_definition.metadata.description`,
  read per page by `fetchShapeDescriptions`). A pick is recorded in `outputKinds` ONLY and sent as `output_kinds` on EVERY
  request (start, continue, manual; `[]` = explicitly none) — the SERVER resolves shape → skill, so the browser adds no
  skill ids and keeps no resolver (`resolveKindSkillId` is gone; Quickset chips toggle the same `outputKinds`). Picks
  persist at `chat.conversation.metadata.run_configuration.outputKinds` / `.outputTypes` (camelCase — the server reads
  `outputKinds`), restored on load and fork; loading an old chat moves kind skills out of `addedSkills` into
  `outputKinds` (`migrateKindSkills`). **Locked agent** (rule 23, 2026-10-05): when the agent's output schema fixes the root `__kind`
  (`const`/`enum`, read with `fetchAgentOutputSchemas`; mirror of the server's `locked_shapes`) the agent answers in its
  own shape(s) and a different pick is NEVER an error. The Shapes panel stays fully usable (search, tabs, rows) with the
  locked shape(s) listed first as locked rows. A pick outside the lock is allowed and shows an inline warning ("This
  agent answers as Quiz Set only", `lockedPickWarning`, ≤60 chars) on its row and once in the panel — at pick time and
  for an already-saved pick alike. The pill keeps naming the locked shape and shows a small warning mark while
  conflicting picks exist. The server drops conflicting picks for that run (the saved picks are not rewritten, so
  switching back to an unlocked agent keeps them), proceeds, and streams an `output_kind_locked` WARNING
  (`metadata.agent_shapes` / `dropped_shapes`) that renders inline in the turn like `output_kind_without_skill`.
  There is no error path for it (`friendlyStreamError` has no `output_kind_locked` entry). The Output TYPES "not sent" label stays (types are still not sent). Pure logic:
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

**Server** — `readComposerModeCookie()` (`packages/chat/src/next/server/composer-mode.server.ts`, the Next binding): the "last mode used" cookie for first paint.

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

- **The launcher is the one size without +** (Arman, 2026-10-04). It sits at the foot of a page to ask about
  that page: the page is its context, nothing more — no agents, tools or models. Anything fancier is the
  side composer. Long-term it is the seed of an embeddable "instant help" widget for outside websites.
- **Never fork the composer.** A new arrangement is a branch on the `composer` prop, composed from the
  SAME engine pieces. Source strings are pinned by `__tests__/textarea-auto-resize`,
  `responsive-run-controls` and `composer-controls-are-named` (send, queue and stop each carry an accessible name).
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
- **Every value the next turn carries is ONE chip** (2026-09-30) — `ConversationContextChip` in the rail renders
  `selectResolvedContextRows` (page, attached and first-turn system values) as a table — Item | Include | Chars |
  Inline max — with the page's master switch (`setPageContextEnabled`). The rows are the SAME rows the send path turns
  into the request (`context-rules/request-context.ts` → `buildContextWire`), a change saves the person's rule
  (`saveContextRule` → `users.user_surface_state`, read by the server every turn), and the server's
  `context_receipt` is compared with what was shown (amber on any difference). Full view: `ContextRulesPanel`.
- **ONE row above the textarea** (Arman, 2026-10-01): LEFT = attachments (`SmartAgentResourceChips` +
  `AttachedDocumentChips`, `inline`) and the rail's pills, scrolling sideways; RIGHT = the value-group chip, pinned
  (`ml-auto`). Composers pass `withAttachments` to the rail and mount no separate attachment row. The row shows only
  while it holds a `[data-rail-entry]`. **The chip's text is the group's real name or nothing** (`valueGroupName`) —
  never "Context"; the sent-message badge is a `ValueCountPill` ("5 sent"). Guard:
  `__tests__/value-group-chip-never-says-context.test.ts`.
  Contract: common-docs `systems/scopes-context/context-delivery/RULES.md`.
- **No border lines** on headers or between panels — the design has none.
- **Hidden, never faked** (brief Q5). Not shown because no capability exists yet: Manual (no approval
  gate client or server), per-chat Vault, team sandbox, Files/Media/Artifacts/The Matrx output families,
  Meta Ads accounts, a server token count on Preview context.
- **Every mode's + menu says what Enter does** (`plus.enterSends`: the per-conversation `submitOnEnter` switch with
  the rule in force as its description) — the toolbar has no Enter toggle, the + menu names the rule.
- **`useComposerMode(initialMode, { enabled })`** — a host that renders no composer this time (a `ChatRoomClient`
  shared with voice, staff, interview rooms) passes `enabled: false`: no knob read, no seeding, no cookie write.
- **Memory is a per-conversation one-shot signal** (`requestMemoryToggle({conversationId, enabled})` rides
  THAT conversation's next send, then clears); the row shows the pending state ("Turns on with your next message").
- Every composer `PopoverContent` with a width class carries the `/* sizing: fixed — … */` comment
  (`pnpm check:popover-sizing`).

---

## Change Log

- **2026-10-04** — Output types narrow the agent picker: every picker the agent pill opens passes `agentFilter` (`@ai-matrx/agents` 0.44.0) built from the chat's Output types by model output modality; the picker names it in a "Makes: …" chip with Show all, current agent pinned. The Output note now says "Narrows the agent list. Not sent to the model."
- **2026-10-04** — Documented the launcher exception to "no mode has less capability"; page context (the eye chip) is ON by default on every page-hosted chat, Quick Chat included (Arman: a chat on a page is about that page).
- **2026-10-04** — The classic stacked layout, the single-row layout (`SmartAgentInputSingleRow`, `SingleRowActionButtons`) and the ambient layout were deleted; `composer` is now required on `SmartAgentInput`, `SmartAgentInputStacked` and `InputActionButtons`. The inert `singleRowTextarea`, `sendButtonVariant` and `showSubmitOnEnterToggle` props went with them, and the classic-only Auto-clear and Enter-toggle toolbar buttons. Named: the Smart Agent Input, styles Full · Compact · Launcher.

- **2026-10-03** — Arman's layout pass: meta row = Scope · surface values (eye + count, no text) | Agent · Output · Effort, nothing bordered, no chevrons on Output/Effort; in the card the mic and its device chevron are one group, live audio stands alone, and send is a bare return glyph whose tooltip lists the keys; while a run streams the same spot shows a spinner that stops it. Compact: send sits in the card, + · voice · Scope · surface values | Agent · Effort ride the row under it. "Values to send" is now "Surface values".


- **2026-10-03** — The value list shows the canvas before the first send. A page's own conversation (main /chat) received its companion (canvas) values only at submit, so the chip, popover and full view were empty until the first turn left. `previewCompanionScope` (refresh-surface-scope.thunk) writes the same entries ahead of the send — own conversation only, never the page — and `useCompanionValuesPreview` (called from `useConversationContextChipShown`) keeps them current on registry changes and the canvas host's `announceSurfaceScopeChange`. Guard: `surfaces/runtime/__tests__/companion-values-show-before-the-first-send.test.tsx`.

- **2026-10-03** — The chip's hydration frame is gone: the class is fixed at `<ChatProvider>`, which now hands its react-redux `<Provider>` the host store's `serverState` (StoreProvider's pre-restore snapshot), so every package `useAppSelector` hydrates against the server HTML wherever a boundary hydrates. Guard: `host/__tests__/chat-provider-hydrates-what-the-server-rendered.test.tsx` (red before).

- **2026-10-03** — The meta row fits a narrow column: at a ~260px chat column (canvas 900 on 1440) the right cluster (`min-w-0` + `justify-end`) spilled its Agent pill out of its LEFT edge over the Output pill ("TexGen…"). The cluster is start-justified now (`ml-auto` keeps it right), so the overflow runs into the row's sideways scroll, and the row is `@container/composer-meta` so the Scope chip folds to its icon under 20rem, as on a phone (`LensChip`).

- **2026-10-03** — The value-group chip renders a numberless frame in the server HTML and during hydration, then the real chip: its rows read the active organization the browser rehydrates from storage before the composer's Suspense boundary hydrates, so `/chat/new` threw a hydration error on every reload ("4 included" server vs "5 included" client).

- **2026-10-01** — Attachments and the value-group chip share one row (attachments left, chip far right); the chip and the sent-message badge never show the word "Context". Needs `@ai-matrx/agents` ≥ 0.29.0 for the compact face.

- **2026-10-01** — Phone sheet: Attach tab content is a render function; a pick (note, file, chat) calls `showIndex` through `RunControlsTabPanel` `onPicked`, returning to Chat options instead of closing the sheet (PB-08). Needs `@ai-matrx/design-system` > 0.50.0. Guard: `smart-input/__tests__/sheet-attach-returns-to-index.test.tsx`.

- **2026-09-30** — Tools owns only the registry/configured tool list; connections and attached repositories/files use the shared Connections panel in the cascading menu, classic attach menu, run-controls window, and mobile sheet. Latest-run MCP failures/counts remain visible there. Tabbed sheet headers stay fixed while their lists scroll.

- **2026-09-30** — Context is ONE system (common-docs `context-delivery/RULES.md`): the context chip lists every value
  the next turn carries (Item | Include | Chars | Inline max) from the same rows the send path builds; per-value rules
  save to the person and the server reads them every turn; the server's `context_receipt` is shown on sent messages
  and compared every turn (amber on a difference). Every composer follows the page it is shown on via the rail
  (`useConversationFollowsPage(id)` — no `startsOn`, Quick Chat's stored "off" and the canvas `followPageSurface` flag
  removed); the page's own conversation is the one exception. The send path re-reads the live page itself.
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
- **2026-10-04** — chat-shape-picks lane C: picks travel as `output_kinds` (every request) and persist on the chat;
  shape "no skill" labels removed; locked-agent state; shape descriptions in picker rows; unknown-shape notice
  promoted inline.
- **2026-10-05** — rule 23 change: a locked agent no longer refuses a different shape pick; the picker stays usable,
  conflicting picks warn in place (row, panel, pill mark), the server drops them for the run and warns
  (`output_kind_locked` is an inline stream warning, not an error).
