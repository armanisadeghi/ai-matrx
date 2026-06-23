# Quick Save Families

Cross-feature pattern for **capture content → edit/reconcile → save to a destination** (create new or append/update existing).

Not about browsing workspaces (`QuickDataWindow`, `QuickTasksWindow`, `QuickNotesSheet` — those are list/edit shells, not capture-save flows).

---

## Pattern (canonical)

| Layer | Responsibility | Typical files |
|-------|----------------|---------------|
| **Hook** | Form state, transforms, create vs update, persist | `useQuick*Save.ts`, `use*QuickCreate.ts` |
| **Core** | Presentational UI — editor, picker, save controls, post-save actions | `*Core.tsx` |
| **Shell** | Chrome only — overlay, dialog, drawer, window, popover | `*Overlay.tsx`, `*Dialog.tsx`, `*Window.tsx` |
| **Opener** | `openOverlay({ overlayId, data })` + typed hook | `features/overlays/openers/*.tsx` |
| **Trigger** | Button, menu item, bridge | `ContentActionBar`, message menus, `*Button.tsx` |

**Shared post-save primitive (reuse, not a family):** [`OpenDestinationDialog`](../features/page-extraction/data-review/OpenDestinationDialog.tsx) — Here / new tab / window after create.

**Platform rule:** build a reusable family (Core + Hook + Shell), not a one-off modal. See [PRINCIPLES.md](../PRINCIPLES.md) — *Build the Platform, Not the Artifact*.

---

## Developer resources (read these first)

Curated guides that already exist. Prefer **skills** for step-by-step; use **FEATURE.md** for deep reference.

### Primary — adding a new family

| Resource | Path | Use when |
|----------|------|----------|
| **Overlay system skill** | [`.claude/skills/overlay-system/SKILL.md`](../.claude/skills/overlay-system/SKILL.md) | Register overlay ID, write opener, wire `OverlayController`, debug render. **Start here.** |
| **RichDocument actions skill** | [`.claude/skills/rich-document-actions/SKILL.md`](../.claude/skills/rich-document-actions/SKILL.md) | Add a “Save to X” menu action via `registerAction` + `openOverlay` (or stage Redux bridge like tasks). |
| **Overlays FEATURE** | [`features/overlays/FEATURE.md`](../features/overlays/FEATURE.md) | Deep reference for overlay slice, catalogue, callback groups. |
| **ContentActionBar registry** | [`components/content-actions/contentActionRegistry.ts`](../components/content-actions/contentActionRegistry.ts) | Copy an existing trigger (`save-notes`, `save-to-code`, `add-to-tasks`). |
| **Code-splitting skill** | [`.claude/skills/code-splitting/SKILL.md`](../.claude/skills/code-splitting/SKILL.md) | Lazy-load Core/Shell in `OverlayController` via `lazyOverlay` — never stack `dynamic()` boundaries. |

### Domain-specific (partial families today)

| Resource | Path | Use when |
|----------|------|----------|
| **Data tables FEATURE** | [`features/data-tables/FEATURE.md`](../features/data-tables/FEATURE.md) | UDT table save engine: `reconcile.ts`, `save-to-table.ts`, existing `SaveTableModal` / `AppendToTableDialog`. |
| **RichDocument save handlers** | [`features/rich-document/actions/handlers/save.ts`](../features/rich-document/actions/handlers/save.ts) | How scratch / notes / code / task saves are orchestrated today. |

### Reference implementations (copy structure)

| Family | Best file to copy |
|--------|-------------------|
| Notes | [`QuickNoteSaveCore.tsx`](../features/notes/actions/quick-save/QuickNoteSaveCore.tsx) + [`saveToNotes.tsx`](../features/overlays/openers/saveToNotes.tsx) |
| Code | [`QuickSaveCodeCore.tsx`](../features/code-files/actions/QuickSaveCodeCore.tsx) + [`saveToCode.tsx`](../features/overlays/openers/saveToCode.tsx) |
| Tasks | [`TaskQuickCreateCore.tsx`](../features/tasks/widgets/quick-create/TaskQuickCreateCore.tsx) + [`CreateTaskFromSourceDialog.tsx`](../features/tasks/widgets/CreateTaskFromSourceDialog.tsx) (bridge pattern) |

### Minimal checklist — new family

1. **Hook + Core** — UI-agnostic save logic; shell does not own form state.
2. **Shell** — Dialog/Drawer (mobile) or `WindowPanel` or `FullScreenOverlay`; all render the same Core.
3. **Register** — `overlay-ids.ts` → component + opener → gated block in `OverlayController.tsx` → `catalogue.ts`.
4. **Trigger** — `contentActionRegistry` item and/or `registerAction` in rich-document handlers.
5. **Post-save** — reuse [`OpenDestinationDialog`](../features/page-extraction/data-review/OpenDestinationDialog.tsx) where navigation choice matters.

### Stale or narrow — use with caution

| Resource | Path | Note |
|----------|------|------|
| Message actions overlay skill | [`.cursor/skills/message-actions-overlay-system/SKILL.md`](../.cursor/skills/message-actions-overlay-system/SKILL.md) | Architecture diagram still useful; **`openSaveToNotes` and old controller paths are outdated** — use `openOverlay({ overlayId: "saveToNotes" })` or typed openers. |
| Notes actions skill | [`.cursor/skills/notes-actions/SKILL.md`](../.cursor/skills/notes-actions/SKILL.md) | Notes-only; same stale `openSaveToNotes` reference. |
| Window panel authoring skill | [`.cursor/skills/window-panel-authoring/SKILL.md`](../.cursor/skills/window-panel-authoring/SKILL.md) | **`WindowPanel` layout patterns OK**; registry-driven rendering steps are legacy — overlay wiring is in **overlay-system** skill. |
| Overlay overhaul doc | [`docs/OVERLAY_WINDOW_OVERHAUL.md`](../docs/OVERLAY_WINDOW_OVERHAUL.md) | Historical *why* (silent-render bug class); not a how-to for new work. |

---

## Canonical families (full Core + Hook + Shell)

### 1. Notes

| Piece | Path |
|-------|------|
| Hook | [`useQuickNoteSave.ts`](../features/notes/actions/quick-save/useQuickNoteSave.ts) |
| Core | [`QuickNoteSaveCore.tsx`](../features/notes/actions/quick-save/QuickNoteSaveCore.tsx) |
| Shells | [`QuickNoteSaveOverlay.tsx`](../features/notes/actions/quick-save/QuickNoteSaveOverlay.tsx) (prod), [`QuickNoteSaveWindow.tsx`](../features/window-panels/windows/notes/QuickNoteSaveWindow.tsx), [`QuickNoteSaveDialog.tsx`](../features/notes/actions/quick-save/QuickNoteSaveDialog.tsx), [`QuickNoteSavePopover.tsx`](../features/notes/actions/quick-save/QuickNoteSavePopover.tsx) |
| Overlay IDs | `saveToNotes`, `saveToNotesFullscreen`, `quickNoteSaveWindow` |
| Opener | [`saveToNotes.tsx`](../features/overlays/openers/saveToNotes.tsx) |
| **Usage example** | [`contentActionRegistry.ts` → `save-notes`](../components/content-actions/contentActionRegistry.ts) (opens `saveToNotes`) |

### 2. Code

| Piece | Path |
|-------|------|
| Hook | [`useQuickSaveCode.ts`](../features/code-files/actions/useQuickSaveCode.ts) |
| Core | [`QuickSaveCodeCore.tsx`](../features/code-files/actions/QuickSaveCodeCore.tsx) |
| Shell | [`QuickSaveCodeDialog.tsx`](../features/code-files/actions/QuickSaveCodeDialog.tsx) |
| Overlay ID | `saveToCode` |
| Opener | [`saveToCode.tsx`](../features/overlays/openers/saveToCode.tsx) |
| Trigger | [`SaveToCodeButton.tsx`](../features/code-files/actions/SaveToCodeButton.tsx) |
| **Usage example** | [`contentActionRegistry.ts` → `save-to-code`](../components/content-actions/contentActionRegistry.ts) |

### 3. Tasks

| Piece | Path |
|-------|------|
| Core | [`TaskQuickCreateCore.tsx`](../features/tasks/widgets/quick-create/TaskQuickCreateCore.tsx) |
| Panel | [`TaskCreatePanel.tsx`](../features/tasks/widgets/quick-create/TaskCreatePanel.tsx) |
| Shell | [`TaskQuickCreateWindow.tsx`](../features/window-panels/windows/tasks/TaskQuickCreateWindow.tsx) |
| Bridge | [`CreateTaskFromSourceDialog.tsx`](../features/tasks/widgets/CreateTaskFromSourceDialog.tsx) (stages `setPendingSource` → opens window) |
| Overlay ID | `taskQuickCreateWindow` |
| Opener | [`taskQuickCreateWindow.tsx`](../features/overlays/openers/taskQuickCreateWindow.tsx) |
| **Usage example** | [`contentActionRegistry.ts` → `add-to-tasks`](../components/content-actions/contentActionRegistry.ts) |

---

## Partial / fragmented (same intent, not unified yet)

| Domain | What exists today | Key paths |
|--------|-------------------|-----------|
| **UDT Tables** | Save engine + bespoke dialogs; no shared Core/Hook | [`save-to-table.ts`](../features/data-tables/save-to-table.ts), [`SaveTableModal.tsx`](../components/mardown-display/tables/SaveTableModal.tsx), [`AppendToTableDialog.tsx`](../components/mardown-display/blocks/json/AppendToTableDialog.tsx) |
| **Workbooks** | One-shot push button + destination chooser | [`SendToWorkbookButton.tsx`](../components/mardown-display/tables/SendToWorkbookButton.tsx), [`workbook-service.ts`](../features/data-tables/workbook-service.ts) |
| **Documents** | Full editor routes; no capture-save overlay | [`DocumentEditor.tsx`](../features/data-tables/components/DocumentEditor.tsx), [`document-service.ts`](../features/data-tables/document-service.ts) |
| **Picklists / Lists** | Manager windows + server actions; no content capture flow | [`PicklistManagerV2Window.tsx`](../features/window-panels/windows/PicklistManagerV2Window.tsx), [`list-actions.ts`](../features/user-lists/actions/list-actions.ts) |
| **Projects** | Peek + task project picker only; no quick-save family | [`ProjectPeek.tsx`](../features/organizations/peek/kinds/ProjectPeek.tsx) |
| **Agent shortcuts** | Hook + window; create-in-place, not content capture | [`useShortcutQuickCreate.ts`](../features/agent-shortcuts/hooks/useShortcutQuickCreate.ts), [`AgentShortcutQuickCreateWindow.tsx`](../features/window-panels/windows/agents/AgentShortcutQuickCreateWindow.tsx) |

**One-click shortcuts (no modal):** Notes [`SaveToScratchButton`](../features/notes/actions/SaveToScratchButton.tsx), Code scratch in [`contentActionRegistry.ts`](../components/content-actions/contentActionRegistry.ts).

**Generic save orchestration:** [`rich-document/actions/handlers/save.ts`](../features/rich-document/actions/handlers/save.ts) dispatches to notes/code/task scratch flows.

---

## Confirmed — add these families

- [ ] **UDT Data Table** — `QuickSaveTableCore` + append/replace/create column reconcile (lift from `SaveTableModal` / `save-to-table.ts`)
- [ ] **UDT Picklist (List)** — capture rows/items → create list or append to existing
- [ ] **Document** — capture markdown/text → create doc or append section
- [ ] **Workbook** — capture tabular data → new sheet or target workbook (unify `SendToWorkbookButton`)
- [ ] **Project** — capture content → create project or attach to existing (title, description, scope)

---

## Could add (not confirmed)

- [ ] **Transcript** — save segment / full transcript to library
- [ ] **Artifact / Canvas** — capture block or canvas state to artifact store
- [ ] **Research document** — save synthesis / source bundle to research pipeline
- [ ] **PDF derivative** — save extraction/redaction result as new PDF doc
- [ ] **Generic file** — extend `save-file` in ContentActionBar to full Core+Hook (name, folder, format)
- [ ] **Scope / context item** — capture value into a scope dimension
- [ ] **Dictionary term** — quick-add term + pronunciation from selection
- [ ] **Podcast episode** — capture script/notes into episode draft
- [ ] **Workflow** — stage content as workflow input / node payload
- [ ] **Image / media** — save generated or pasted media via file handler
- [ ] **Email draft** — capture content into compose overlay
- [ ] **Feedback** — quick-file bug/feature from selection (partial: [`FeedbackWindow`](../features/window-panels/windows/FeedbackWindow.tsx))
