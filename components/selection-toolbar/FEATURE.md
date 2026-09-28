# Selection toolbar — the ONE popup over selected text

**Ruling (Arman, 2026-09-26):** one selection toolbar primitive, the Notion / Google Docs model — one look, one position rule, a mode-aware action set. Editing shows formatting + AI + comment; reading shows highlight, comment, suggest, AI, link and report. AI shows in both.

## How it works

| Piece | Job |
|---|---|
| `SelectionToolbarRoot.tsx` | Mounted once in `components/agent-copy/AlchemyHost.tsx`. Watches the one document selection (settles after pointer-up on desktop, after the selection stops moving on touch), finds every **zone** holding it, builds ONE composite Alchemy `ClickTarget`, owns Esc (closes, focus returns) and the Ctrl/Cmd+Alt+M chord (opens with focus on the first control). Registers every declared selection provider into the app's one registry. |
| `SelectionToolbarFrame.tsx` | Loaded on first open (`next/dynamic`, gated on `open`). Renders the Alchemy package layout `@ai-matrx/alchemy/react/selection` (strip, then More) or a zone's panel, in a portal. Desktop: above the selection, flipped below, clamped, follows scroll. Phone (`useIsMobile`): docked at the bottom edge above the home indicator — never beside the selection, so the native selection menu keeps its place (Google Docs mobile). It floats; it never adds rows or pushes content. |
| `selection-zones.ts` | `useSelectionZone(element, contribution)` — a surface registers the element its text lives in plus its contribution: its half of the click target (`host`), `editable`, `suppress`, panels it draws (`renderPanel`), a panel to open immediately (`initialPanel`). |
| `selection-actions.ts` | **The mode table** `SELECTION_ACTION_MODES` (which action shows while editing vs reading — registry data, one place), `shownInSelectionMode()`, the toolbar's own host half (`mode`, knobs, `ui`), the passage-actions provider (a surface's own actions, e.g. the study guide's tutor), and `declareSelectionProvider()`. |

**Host kinds (what a person gets, by where the text is — `SELECTION_HOST_KINDS` in selection-actions.ts):** annotated reading (study guide, document Annotate, and every SAVED RECORD through `features/rich-document/annotations/RecordAnnotations` — a note's preview, a chat answer, the studio previewing an unedited saved document): highlight ×5, comment, suggest, link, report, AI and more (+ the study guide's tutor pair); Highlight and Link are absent on a kind with no association pair (chat answers until the chair applies `migrations/annotation_pairs_on_chat_messages.sql`). Rich editor: formatting + AI and more (+ Copy / Save to notes); the caret or a selection in a TABLE adds the table actions (align and delete under More); a selected CODE BLOCK opens the toolbar on its source. Plain reading and text fields (unsaved content — a stream in flight, typed text, an edited studio copy, studio source, every window): Copy, Save to notes, AI and more — never a one-button bar. Comment in the Visual editor appears only when the buffer is a saved record (a saved document or note); for an unsaved buffer it is simply absent (chair ruling 2026-09-26). Formatting in notes' own editor modes is pending the notes migration onto the one editor (RC-A4).

**Caret mode:** a zone's `caretAnchor()` keeps the toolbar up with no selected text (a table caret, a selected code block); `caretText()` supplies the text it acts on.

**Every window** is a selection surface: `features/window-panels/WindowSelectionSurface.tsx` wraps every desktop and mobile body path of `WindowPanel` (its own `display:contents` element — a body component that does not forward refs would otherwise leave the menu nothing to hold).

**Providers (all ordinary Alchemy actions in the one registry):** rich-editor formatting `components/rich-editor/visual/format-actions.ts`; annotations `features/rich-document/annotations/annotation-actions.tsx` (highlight ×5, comment, suggest, link — they write through the sidecar API exactly as before); the context menu's "AI and more" `features/context-menu-v3/selection-provider.ts` (opens the same Alchemy menu over the selection); the study guide's "I don't get this", "Ask a question", "Report an issue" as `passageActions` on `AnnotatedContent`.

**Fitting a phone:** the docked bar never scrolls. The root computes how many buttons fit (`slots`, 44px touch targets on coarse pointers); `SELECTION_PRIORITY` (selection-actions.ts) decides which actions keep a button, and every selection provider returns its actions through `placeSelectionActions`, which moves the rest to `placement: "overflow"` — the package layout's More. At 320 the reading bar is yellow highlight, comment, suggest, "I don't get this", "AI and more", More.

**Knob:** `selection_toolbar.highlight_while_editing` (platform.feature_knob, org then person, default off; seed `migrations/selection_toolbar_knobs.sql`, applied 2026-09-26).

## Rules

- **Never draw a second selection popup.** A new passage action = a registry action + a row in `SELECTION_ACTION_MODES`. Guard: `components/selection-toolbar/__tests__/one-selection-toolbar.census.test.ts` (fails on a Tiptap BubbleMenu, the package selection layout outside the frame, a component named like a selection popup, or a new `selectionchange` listener; it proves itself red on planted files in a temp dir).
- **Panels render in the toolbar's portal, outside the zone's React tree.** A zone whose panel reads React context re-provides it around the panel (the annotation sidecar wraps its panel in `SidecarContext.Provider`) — a panel that calls a context hook without it crashes the page.
- Only a `suppressed` context menu (the text is streaming) keeps the toolbar away. `enableFloatingIcon` is retired (the floating icon is gone).
- Position is measured against the nearest scroll container: flipped inside the pane, never over its header, hidden while the selection is scrolled out of view. Keyboard: one tab stop (roving tabindex), arrows within, Ctrl/Cmd+Alt+M focuses the first control on every press.
- The census (`one-selection-toolbar.census.test.ts`) also catches selection-driven floating UI BY BEHAVIOUR (reads the selection + a gesture-end listener + measures + renders something positioned), whatever it is named. The Red Pen dialog's marking and the agent builder's drag-to-edit are recorded there as non-popup behaviours.

## Known gaps

- ~~A soft-deleted passage comment has no restore path~~ — fixed 2026-09-26: comments are on /trash and every panel removal has Undo (see `features/rich-document/FEATURE.md`). A detached passage link is still not on /trash (toast Undo only).

## Change Log

- 2026-09-27 — The reading set on every saved record (chair ruling 2026-09-26): notes, chat answers and the studio's saved-document preview carry the study guide's sidecar through ONE mount, `features/rich-document/annotations/RecordAnnotations` (mounted by RichDocument and the chat answer), with a Notes & comments dock — a floating right panel on desktop (content width unchanged: 736px transcript open and closed, measured), the bottom sheet on a phone — opened by the person's own comment/highlight, a tap on a painted passage, or the ⋯ "Notes & comments (N)" row. Highlight and Link follow the association vocabulary (absent where no pair exists). Host-kind table updated for the Visual editor's Comment and notes' pending formatting.

- 2026-09-26 — Verify round 1 fixes: table tools are toolbar actions (the Tiptap table bubble is deleted); scroll-container positioning; every window gets the toolbar; the common pair (Copy, Save to notes) where nothing richer owns the passage; Report is every annotated passage's; code blocks; roving tabindex; quotes render as inline rich text; census by behaviour; `enableFloatingIcon` retired from 37 callers.

- 2026-09-26 — Phone fit: the docked bar no longer scrolls sideways; lower-priority actions move to the registry overflow (More). Annotation cards carry `data-annotation-key` / `data-annotation-kind` so tests and cleanup act on a card by its own id, never by position.

- 2026-09-26 — Built. Replaced three popups: the rich editor's Tiptap BubbleMenu, the annotation sidecar's toolbar, and the context menu's floating selection icon (which sat on top of the editor's bubble).
