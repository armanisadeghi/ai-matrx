# Selection toolbar — the ONE popup over selected text

**Ruling (Arman, 2026-09-26):** one selection toolbar primitive, the Notion / Google Docs model — one look, one position rule, a mode-aware action set. Editing shows formatting + AI + comment; reading shows highlight, comment, suggest, AI, link and report. AI shows in both.

## How it works

| Piece | Job |
|---|---|
| `SelectionToolbarRoot.tsx` | Mounted once in `components/agent-copy/AlchemyHost.tsx`. Watches the one document selection (settles after pointer-up on desktop, after the selection stops moving on touch), finds every **zone** holding it, builds ONE composite Alchemy `ClickTarget`, owns Esc (closes, focus returns) and the Ctrl/Cmd+Alt+M chord (opens with focus on the first control). Registers every declared selection provider into the app's one registry. |
| `SelectionToolbarFrame.tsx` | Loaded on first open (`next/dynamic`, gated on `open`). Renders the Alchemy package layout `@ai-matrx/alchemy/react/selection` (strip, then More) or a zone's panel, in a portal. Desktop: above the selection, flipped below, clamped, follows scroll. Phone (`useIsMobile`): docked at the bottom edge above the home indicator — never beside the selection, so the native selection menu keeps its place (Google Docs mobile). It floats; it never adds rows or pushes content. |
| `selection-zones.ts` | `useSelectionZone(element, contribution)` — a surface registers the element its text lives in plus its contribution: its half of the click target (`host`), `editable`, `suppress`, panels it draws (`renderPanel`), a panel to open immediately (`initialPanel`). |
| `selection-actions.ts` | **The mode table** `SELECTION_ACTION_MODES` (which action shows while editing vs reading — registry data, one place), `shownInSelectionMode()`, the toolbar's own host half (`mode`, knobs, `ui`), the passage-actions provider (a surface's own actions, e.g. the study guide's tutor), and `declareSelectionProvider()`. |

**Providers (all ordinary Alchemy actions in the one registry):** rich-editor formatting `components/rich-editor/visual/format-actions.ts`; annotations `features/rich-document/annotations/annotation-actions.tsx` (highlight ×5, comment, suggest, link — they write through the sidecar API exactly as before); the context menu's "AI and more" `features/context-menu-v3/selection-provider.ts` (opens the same Alchemy menu over the selection); the study guide's "I don't get this", "Ask a question", "Report an issue" as `passageActions` on `AnnotatedContent`.

**Knob:** `selection_toolbar.highlight_while_editing` (platform.feature_knob, org then person, default off; seed `migrations/selection_toolbar_knobs.sql`, applied 2026-09-26).

## Rules

- **Never draw a second selection popup.** A new passage action = a registry action + a row in `SELECTION_ACTION_MODES`. Guard: `components/selection-toolbar/__tests__/one-selection-toolbar.census.test.ts` (fails on a Tiptap BubbleMenu, the package selection layout outside the frame, a component named like a selection popup, or a new `selectionchange` listener; it proves itself red on planted files in a temp dir).
- **Panels render in the toolbar's portal, outside the zone's React tree.** A zone whose panel reads React context re-provides it around the panel (the annotation sidecar wraps its panel in `SidecarContext.Provider`) — a panel that calls a context hook without it crashes the page.
- `enableFloatingIcon={false}` on a context menu (and a `suppressed` menu) means no toolbar over that text: the zone suppresses everything outside it.

## Change Log

- 2026-09-26 — Built. Replaced three popups: the rich editor's Tiptap BubbleMenu, the annotation sidecar's toolbar, and the context menu's floating selection icon (which sat on top of the editor's bubble).
