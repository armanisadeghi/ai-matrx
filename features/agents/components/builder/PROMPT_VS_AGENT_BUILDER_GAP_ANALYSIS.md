# Prompt builder vs Agent builder — gap analysis

Working document comparing [`features/prompts/components/builder`](../../prompts/components/builder) (prompt builder) with [`features/agents/components/builder`](../builder) and related agent message/system UI. Use this to prioritize parity work; not an official feature README.

## Effort legend

| Tag | Meaning |
|-----|---------|
| **S** | Small: localized UI wiring, reuse existing components, little state. |
| **M** | Medium: new state or Redux touch points, one subsystem, moderate testing. |
| **L** | Large: architectural alignment, content-model bridging, or UX overhaul. |

---

## 1. Message toolbar — Templates — **COMPLETE**

**Done (parity with prompt builder browse / save-as-template UX):**

- **System:** [`SystemMessageButtons.tsx`](../system-instructions/SystemMessageButtons.tsx) uses [`TemplateSelector`](../../content-templates/components/TemplateSelector.tsx) in a `render` slot (Tooltip wrapper), `role="system"`, `messageIndex={-1}`, `currentContent={developerMessage}`. [`SystemMessage.tsx`](../system-instructions/SystemMessage.tsx) passes `templateCurrentContent`, `onTemplateContentSelected={handleTextChange}`, `onSaveTemplate={() => {}}` (same no-op callback pattern as prompts after `createTemplate` in the modal).
- **Priming rows:** [`MessageItemButtons.tsx`](../messages/MessageItemButtons.tsx) adds the same **Templates** control after **Insert variable**; [`MessageItem.tsx`](../messages/MessageItem.tsx) passes `templateRole={message.role}`, `templateCurrentContent={currentText}`, `onTemplateContentSelected={handleTextChange}`, `templateMessageIndex={messageIndex}`, `onSaveTemplate={() => {}}`.

**Agent nuance:** Applying a template replaces **only the primary text block** via existing `handleTextChange`; non-text blocks on that message stay as implemented today.

---

## 2. Message toolbar — Full-screen editor

- **Prompt:** [`PromptBuilder.tsx`](../../prompts/components/builder/PromptBuilder.tsx) owns `isFullScreenEditorOpen`, `fullScreenEditorInitialSelection`, and `onOpenFullScreenEditor(messageIndex)` (−1 for system). Desktop/mobile pass this into left panel → system + [`PromptMessages`](../../prompts/components/builder/PromptMessages.tsx).
- **Agent:** [`SystemMessage.tsx`](../system-instructions/SystemMessage.tsx) and [`Messages.tsx`](../messages/Messages.tsx) accept optional `onOpenFullScreenEditor`, and buttons use `hasFullScreenEditor={!!onOpenFullScreenEditor}`. **[`AgentBuilderLeftPanel.tsx`](../builder/AgentBuilderLeftPanel.tsx) never passes it**, so **maximize is always hidden** for system and priming messages.
- **Work:** Lift state similar to prompts: use existing [`FullScreenEditor`](../../prompts/components/FullScreenEditor.tsx) (or agent-specific wrapper) at `AgentBuilderDesktop` / `AgentBuilderMobile` level; implement save callbacks that dispatch `setAgentMessages` / update system text block for index `−1` vs conversation indices (adjust for system row being index 0 in Redux — align with how [`MessageItem`](../../agents/components/messages/MessageItem.tsx) maps `messageIndex`). **Effort: M** (routing layer + index conventions + dirty state).

---

## 3. Model & tools configuration surface

- **Prompt:** [`ModelConfiguration`](../../prompts/components/configuration/ModelConfiguration.tsx) + optional inline [`ToolsManager`](../../prompts/components/configuration/ToolsManager.tsx) when `showSettingsOnMainPage`; conflict UI via `hasPendingConflict` / `onOpenSettingsConflictModal` ([`ModelChangeConflictModal`](../../prompts/components/builder/ModelChangeConflictModal.tsx)).
- **Agent:** [`AgentModelConfiguration.tsx`](../builder/AgentModelConfiguration.tsx) — compact row: `SmartModelSelect` + icon opens for Settings / Variables / Tools **modals**; no “show tools on main page” toggle; **no model-change conflict modal** surfaced in builder.
- **Work (parity):** Decide if agents need conflict detection when switching models (settings invalidation). If yes, port or share conflict modal + pending state from prompts into agent model change path. **Effort: M–L** depending on how `SmartModelSelect` / agent settings interact.
- **Note:** Agent variables appear both in header modals **and** [`AgentVariablesManager`](../variables-management/AgentVariablesManager.tsx) under the model row — different from prompts’ single [`VariablesManager`](../../prompts/components/configuration/VariablesManager.tsx) in-scroll; may be intentional.

---

## 4. Left panel layout & polish

- **Prompt:** [`PromptBuilderLeftPanel.tsx`](../../prompts/components/builder/PromptBuilderLeftPanel.tsx) — `bg-textured`, `scrollbar-thin`, `scrollbarGutter: "stable"`, `overflowAnchor: "none"`, single scroll region for model + variables + tools + system + messages; **fixed** bottom “Add message”.
- **Agent:** [`AgentBuilderLeftPanel.tsx`](../builder/AgentBuilderLeftPanel.tsx) — **split**: non-scrolling top stack (model, variables, context policies) vs scrolling messages; no `bg-textured`; bottom **User** / **Assistant** add buttons.
- **Work:** Optional parity: shared scroll behavior, textured background, stable scrollbar for long system prompts. **Effort: S–M** (mostly CSS/layout).

---

## 5. Add message UX

- **Prompt:** Single **“Add message”** ([`PromptBuilder.tsx`](../../prompts/components/builder/PromptBuilder.tsx) alternates user/assistant).
- **Agent:** Explicit **User** and **Assistant** buttons.
- **Work:** Product choice — not necessarily a gap; document only. **Effort: S** if you add a combined control for parity.

---

## 6. Message role selector (conversation rows)

- **Prompt:** [`PromptMessages`](../../prompts/components/builder/PromptMessages.tsx) allows **User / Assistant / System** on any row.
- **Agent:** [`MessageItem`](../../agents/components/messages/MessageItem.tsx) only **User / Assistant**; system is a separate [`SystemMessage`](../../agents/components/system-instructions/SystemMessage.tsx) card — matches [`AgentDefinitionMessage`](../../agents/types/agent-message-types.ts) conventions (system is separate).
- **Work:** Parity **not recommended** unless product wants inline system turns; would fight agent API shape. **Effort: L** if attempted.

---

## 7 Content model: plain string vs blocks

- **Prompt:** Each message is a **string** `content`; no media blocks in builder rows.
- **Agent:** [`AgentDefinitionMessage`](../../agents/types/agent-message-types.ts) uses **`content[]` blocks** (text, image, …), [`AddBlockTrigger`](../../agents/components/messages/AddBlockButton.tsx), [`BlockList`](../../agents/components/messages/AddBlockButton.tsx), [`MessageContentItemRenderer`](../../agents/components/builder/MessageContentItemRenderer.tsx).
- **Work:** Full-screen editor / templates / AI context menu must respect **text block vs full JSON** if extended. Any “paste prompt JSON” or import from prompts needs normalization. **Effort: L** for deep parity; already partially handled in agent-specific code.

---

## 8. Variables (reference)

- **Status:** Variable insertion via braces + [`VariableSelector`](../../agents/components/variables-management/VariableSelector.tsx) is implemented for system + [`MessageItem`](../../agents/components/messages/MessageItem.tsx) (see recent changes to [`MessageItemButtons`](../../agents/components/messages/MessageItemButtons.tsx) / [`SystemMessageButtons`](../../agents/components/system-instructions/SystemMessageButtons.tsx)).
- **Prompt-specific:** Controlled `variablePopoverOpen` / `editingMessageIndex` / shared `textareaRefs` in parent — agent uses more local state; behavior is aligned for the common case.

---

## 9. Context menu / AI actions

- Both use [`UnifiedContextMenu`](../../context-menu) with similar `contextData` shapes (messages, variables, settings). **No major gap** called out beyond ensuring `modelConfig` / agent settings JSON stays useful for server-side tools.

---

## 10. System message — other controls

- **Optimize with AI:** Present in both ([`SystemPromptOptimizer`](../../prompts/components/actions/prompt-optimizers/SystemPromptOptimizer.tsx) in agent [`SystemMessage`](../../agents/components/system-instructions/SystemMessage.tsx)).
- **Clear:** Prompt uses `onDeveloperMessageClear`; agent uses `handleTextChange("")` — equivalent.
- **Add block:** Agent system row supports **add non-text blocks**; prompt system is string-only — **agent-only capability**.

---

## 11. Right panel — test / preview

| Prompt | Agent |
|--------|--------|
| [`PromptBuilderRightPanel`](../../prompts/components/builder/PromptBuilderRightPanel.tsx): conversation + [`PromptInput`](../../prompts/components/PromptInput.tsx), resources, variable chips, **socket/task** streaming, [`PromptStats`](../../prompts/components/builder/PromptStats.tsx), attachment capabilities | [`AgentBuilderRightPanel`](../../agents/components/builder/AgentBuilderRightPanel.tsx): **Redux execution instance**, [`AgentConversationDisplay`](../../agents/components/run/AgentConversationDisplay.tsx), [`CreatorRunPanel`](../../agents/components/run-controls/CreatorRunPanel.tsx), [`SmartAgentInput`](../../agents/components/smart/SmartAgentInput.tsx) |

- **Gap:** Not a 1:1 feature matrix — different runtimes. Compare only if product wants the same **UX affordances** (e.g. resource attachments in builder test, TTS flags, metadata display). **Effort: M–L** per affordance.

---

## 12. Top bar & surrounding product

- **Prompt:** [`PromptBuilderDesktop`](../../prompts/components/builder/PromptBuilderDesktop.tsx) — versioning ([`VersionBadge`](../../versioning) / history), shared-prompt banner, name edit, richer header.
- **Agent:** [`AgentBuilderTopBar`](../../agents/components/builder/AgentBuilderTopBar.tsx) — back, name, dirty, save only.
- **Work:** Version history, sharing banner, duplicate-as-copy flows — **product-dependent**. **Effort: L** if full parity.

---

## 13. Mobile layout pattern

- **Prompt:** [`AdaptiveLayout`](../../components/layout/adaptive-layout/AdaptiveLayout.tsx) + [`PromptBuilderMobile`](../../prompts/components/builder/PromptBuilderMobile.tsx) (often split panels per product).
- **Agent:** [`AgentBuilderMobile`](../../agents/components/builder/AgentBuilderMobile.tsx) — explicit **Build | Test** tabs (`Tabs`-like buttons; note project rule: avoid `Tabs` component on mobile — current pattern is custom buttons, which is fine).
- **Work:** Optional alignment with `AdaptiveLayout` for consistency. **Effort: M**.

---

## 14. Prompt-only builder entry points (no agent equivalent listed here)

- [`TabBasedPromptBuilder.tsx`](../../prompts/components/builder/TabBasedPromptBuilder.tsx)
- [`AICustomizerPromptBuilder.tsx`](../../prompts/components/builder/AICustomizerPromptBuilder.tsx)
- [`CreatorOptionsModal.tsx`](../../prompts/components/builder/CreatorOptionsModal.tsx)
- [`InstantChatAssistant.tsx`](../../prompts/components/builder/InstantChatAssistant.tsx)
- [`PromptBuilderErrorBoundary.tsx`](../../prompts/components/builder/PromptBuilderErrorBoundary.tsx)
- [`SharedPromptWarningModal.tsx`](../../prompts/components/builder/SharedPromptWarningModal.tsx)

**Work:** Only if agents need the same workflows (creator mode, shared asset warnings, etc.). **Effort: variable**.

---

## 15. Agent-only builder capabilities (not in prompt builder)

- [`AgentContextSlotsManager`](../../agents/components/context-slots-management/AgentContextSlotsManager.tsx) — context policies.
- Redux-backed definition + **test instance** lifecycle.
- **Rich blocks** in priming messages and system message.
- **Dual** variables entry (chip manager + header modal).

Document these when explaining differences to users; not “gaps” in the agent → prompt direction.

---

## 16. Documentation / code hygiene

- [`features/agents/docs/MODULE_README.md`](MODULE_README.md) still references old props (`onInsertVariable` on button components). **Effort: S** to update when convenient.
- [`features/agents/components/messages/PromptMessages.tsx`](../messages/PromptMessages.tsx) — parallel to prompts `PromptMessages`; confirm whether still used or dead; avoid double maintenance. **Effort: S** (audit + delete or document).

---

## Suggested priority order (optional)

1. ~~**Templates** — system row wired + priming rows added (**S–M**).~~ **Done** — see §1.
2. **Full-screen editor** — wire from builder shell (**M**).
3. **Left panel polish** — if UX asks for parity with prompt builder chrome (**S–M**).
4. **Model conflict / settings depth** — if support burden justifies it (**M–L**).
5. **Right panel / top bar** parity — product roadmap (**L**).

---

*Generated for internal planning; update this file as gaps close.*
