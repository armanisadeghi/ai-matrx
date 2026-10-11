# Handoff — Render Blocks page + the Finder-standard tree

State verified 2026-10-10 against `main` (`f44ef19530f`) and on localhost as `admin@admin.com`.
Page: `https://www.aimatrx.com/agent-connections/render-blocks` (locally `/agent-connections/render-blocks`).

---

## 1. Vision

### Original ask (Arman)
"Fix this UI — take a look and see what the problem is." The Render Blocks tab of Agent Connections
was a half-built stub: a bare folder tree, a read-only detail screen that showed a developer note to users, and
buttons that did nothing.

### Additions and refinements (in order)
1. **Trees must be indented properly — a core principle "we keep getting wrong."** His reference is the
   macOS Finder list view: every level steps in by the same amount, and a file sits at exactly the same
   left edge as a folder at the same depth (the disclosure arrow keeps its slot even when empty).
2. **Different kinds of things must look different.** Folders vs. files must be obvious at a glance
   (Finder: solid blue folder vs. document icon).
3. **Sizing and fonts must be clean.** One text size, uniform row height, no mixed small tags crowding names.
4. **Copy the best platform outright; don't patch the ugly thing.** "Pick a great one and make this a
   duplicate of it." We picked **Finder list view** (VS Code's explorer uses the same geometry).

### The why behind the decisions
- **Built on the shared tree, not a new one.** `components/official/topic-tree/TopicTree.tsx` is declared
  "THE hierarchical list of this app" (platform law 5: build in the shared layer). Its geometry already matched
  Finder (16px per level, reserved chevron slot, depth guides, keyboard, virtualisation over 200 rows).
  What it lacked — a type icon and a right-hand column — was added **to the primitive** so every tree gets it.
- **Rows moved from 12px to 13px in the primitive.** 13px is the design system's body size and the size Finder
  and VS Code use. A tree is primary content, not secondary text.
- **List + preview pane, not a page swap.** Finder's preview pane lets arrow keys walk the list and preview
  each item. With nothing open, the list owns the pane and shows a Description column instead of an empty half.
- **Dead buttons were hidden, not left in.** "Nothing fails silently" (law 4): a button with no handler is a
  dead end, so `SectionToolbar` renders Generate/Browse/Add only when a handler is wired.

---

## 2. Current state (gap analysis)

### Done — verified on localhost 2026-10-10
| Area | What | Where |
|---|---|---|
| Tree geometry | 16px per level; files align with sibling folders (measured: level 1 labels at x=706, level 2 at x=722, every row) | `TopicTreeRow.tsx` (unchanged geometry), `RenderBlocksSection.tsx` `flattenTree()` |
| Type distinction | Solid blue folder; Markdown = gray `FileText`, XML = orange `FileCode2`, Component (`render_kind`) = violet `Component`; folders listed above blocks | `RenderBlocksSection.tsx` `BLOCK_KIND`, `folderIcon` |
| Type size | All rows and columns 13px (`type-body`), 28px rows, gray secondary columns | `TopicTreeRow.tsx` row class; meta slot inherits size |
| Columns | Name / Description / Kind header. Description shows only while no block is open; folders show "N items" in Kind | `KIND_COLUMN`, `DESCRIPTION_COLUMN`, `metaCells()` |
| Preview pane | Opening a block splits 40% list / 60% detail with Preview (rendered via `RichContent`) and Template tabs; X closes; narrow screens show one pane with Back | `RenderBlockDetail` |
| Keyboard | Up/Down walk and preview blocks; Left/Right/Home/End from the primitive; Enter on a folder toggles; arrowing onto a folder does **not** toggle it | `pointerInput` ref + `onSelect`/`onActivate` |
| Search | Opens every folder holding a match, hides folders with none, folder counts reflect matches | `branchHasMatch`, `countBlocks`, `isExpanded` |
| Cross-tab leak | An open render block no longer opens Skills as "We couldn't find this skill" — re-verified | `AgentConnectionsRouteShell.tsx` effect dispatching `setActiveSection(routeSection)` |
| Dead controls (whole hub) | Generate/Browse/Add render only with a handler; `#` "Learn more" links never render | `SectionToolbar.tsx`, `SectionFooter.tsx` |
| Primitive slots | `TopicTreeRow` gained optional `icon` and `meta`; existing TopicTree tests pass (13/13) | `components/official/topic-tree/types.ts`, `TopicTreeRow.tsx` |

Commits: `43da9e65b9` (first fix), `57c8bc5658` (Finder rebuild). Change-log lines are in
`features/agent-connections/FEATURE.md`. Since then other lanes only touched import paths in these files — no regressions found.

### Partial
- **"Core principle" is fixed on one page, not the app.** Eight trees still hand-roll their own rows and
  indentation and do not use `TopicTree`: `features/spaces/sidebar/SpacesSidebar.tsx`,
  `features/code/views/explorer/FileTree.tsx`, `features/code/views/library/LibraryTree.tsx`,
  `features/files/components/core/FileTree/FileTree.tsx`, `features/marketing/content-plan/components/PlanTree.tsx`,
  `features/scopes/components/active-context/context-tree/ContextTree.tsx`,
  `components/official/content-editor/ContentEditorTree.tsx`, and the Skills category editor
  (`features/skills/components/SkillCategoryTreeEditor.tsx`). Arman's complaint was app-wide; only Render Blocks
  is proven to Finder standard.
- **Finder parity is not complete:** column headers are not sortable or resizable; the selection is a light
  primary wash with a left rail, not Finder's solid full-row highlight; no type-ahead (type a letter to jump).
- **Published state left the list.** "Not published" now shows only in the detail header
  (`ClassificationBadges`). Consider a Finder-style column or tag if people need it at list level.

### Not started
- **Editing and creating render blocks on this page.** Read-only. The full editor exists only in admin
  (`components/admin/ContentBlocksManager.tsx`, 2,600+ lines, routes `/administration/agents/system-agents/content-blocks`
  and `/administration/utilities/content-blocks`). The old "Generate Block" button was never wired to anything.
- **Other Agent Connections tabs** were never reviewed for layout; seven still pass `generateLabel` with no handler
  (Commands, Agents, Prompts, Hooks, Instructions, Registries, Sub-agents) — now hidden, but the intended action was never built.
- **A guard test** (law 3) for: `flattenTree` alignment/ordering, and the route-section sync clearing the selection.
- **Independent review** of both commits has not been done.

### Known issues / risks
- **13px change hits every TopicTree consumer:** topical-map outline (`features/marketing/seo/topical-map/views/OutlineView.tsx`,
  `outline/useOutlineRows.tsx`, `outline/topicPageRows.tsx`), `proposals/MapTopicProposalView.tsx`, and
  `features/chat-tool-renderers/renderers/topical-map/TopicalMapInline.tsx`. Not visually checked after the change.
- **Section footer prose breaks the in-app text rule** on every Agent Connections tab except Render Blocks
  (descriptions over the 60-char budget). `pnpm check:interface-text --changed` flags them when touched.
- **Selection is shared Redux** (`agentConnectionsUi.selectedItemId`) between the route page and the
  Agent Connections window (`features/window-panels/windows/agents/AgentConnectionsWindow.tsx`). The route
  sync dispatches `setActiveSection`, which also clears the window's selection if both are open.
- **Kind column squeezes long names** in the 40% list pane at ~1440px with the app's left chat panel open.

---

## 3. Orientation

```
app/(core)/agent-connections/render-blocks/page.tsx      → <RenderBlocksSection/>
features/agent-connections/
  components/AgentConnectionsRouteShell.tsx              two-pane shell; syncs URL section → Redux (clears selection)
  components/AgentConnectionsSidebar.tsx                 section links (route mode uses <Link>, not Redux)
  components/SectionToolbar.tsx / SectionFooter.tsx      shared per-tab toolbar + footer (dead-control guards)
  components/sections/RenderBlocksSection.tsx            the page: flattenTree → TopicTree; RenderBlockDetail
  hooks/useRenderBlocks.ts                               loads definitions + categories (skl Redux slice)
  redux/skl/selectors.ts                                 CategoryTreeNode, selectRenderBlockCategoryTree
  redux/ui/slice.ts                                      activeSection, selectedItemId, viewScope
components/official/topic-tree/                          THE tree primitive (store-free; host owns rows/expansion)
  TopicTree.tsx  TopicTreeRow.tsx  types.ts  useTopicTreeKeyboard.ts  useTopicTreeDnd.ts  TopicTree.test.tsx
```

How a host uses the tree: build a **flat array of visible rows** (`id, parentId, depth, label, hasChildren,
expanded, selected`, plus optional `icon`, `meta`, `trailing`, `actions`); keep expansion in host state; pass
`onToggleExpand`, `onSelect`, `onActivate`. The tree never filters, sorts or expands by itself.
Render Blocks prefixes folder ids with `folder:` so they never collide with block ids.

---

## 4. Next steps (in order)

1. **Get an independent review** of `43da9e65b9` and `57c8bc5658` (live page first, then the diff).
2. **Visually check the topical-map trees** after the 13px change; fix any layout that relied on 12px.
3. **Add guard tests:** (a) `flattenTree` — folders before blocks, depth increments by 1, collapsed folders hide
   children, search hides empty folders; (b) route shell — switching section clears `selectedItemId`.
   Prove each fails on a planted break, then passes.
4. **Move the eight hand-rolled trees onto `TopicTree`** (one PR each), using `icon`/`meta` for type and columns.
   Start with `features/files/components/core/FileTree` and `features/code/views/explorer/FileTree.tsx` — those
   are literal file trees where the Finder standard matters most.
5. **Finish Finder parity in the primitive:** sortable column headers, solid selection highlight, type-ahead.
6. **Bring editing to the user page:** reuse pieces of `ContentBlocksManager` for edit/create in the preview pane
   rather than building a second editor.

---

## 5. Gotchas

- **Never hand-roll a tree.** Use `TopicTree`; extend the primitive if it lacks something.
- **Inline `<span>` ignores width.** Column cells must be `block` with a fixed width (`w-24`), not a percentage —
  percentages resolve against the auto-width meta slot and the columns drift.
- **Radix `ScrollArea` breaks `truncate`** (its inner table wrapper grows to content). Use a plain
  `overflow-y-auto` div for long text lists.
- **`TopicTree` reports both clicks and arrow keys as `onSelect`.** If a select has a side effect (toggling a
  folder), tell the input kinds apart — see `pointerInput` in `RenderBlocksSection.tsx`.
- **Route mode never dispatches `setActiveSection` on its own**; anything that depends on the section must
  read the URL or rely on the shell's sync effect.
- **The shared dev server (:3001) compiles each route on first visit**; switching tabs can take 30–60s locally.
  That is compile time, not a bug.
- **Sign in locally** with `pnpm preview:start` then `pnpm dev-login /agent-connections/render-blocks`; open the printed URL.
- **Type gate is `pnpm type-check` only** (the build ignores type errors). Run `pnpm check:interface-text --changed`
  before committing UI text.
- **Shared checkout:** commit by explicit pathspec, never tree-wide git commands; push to `main`; releases are automatic.
- `matrx-frontend/CLAUDE.md` points to `common-docs/operations/unassigned-handoffs.md` for ownerless handoffs;
  that file no longer exists, so this handoff is not listed anywhere else.
