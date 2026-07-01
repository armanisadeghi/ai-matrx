# Theme mode migration — Redux → `useThemeMode()`

**Problem:** Components that read `useAppSelector(s => s.theme.mode)` for *visual* rendering (Prism, Monaco, Mermaid, maps, CSS modules) can desync from the painted `<html class="dark">` on boot. Redux `initialState` is `"dark"` while SyncBootScript / the theme cookie may paint light.

**Write authority:** Redux `theme.mode` + `setMode` / `toggleMode` (settings, toggles, persistence).

**Read for visuals:** `@/styles/themes/useThemeMode()` — reads painted DOM, subscribes to class mutations + Redux.

**Boot fix:** `reconcileThemeFromPaintedDom()` in `lib/sync/engine/boot.ts` aligns Redux after rehydrate.

---

## Status: complete (2026-07-01)

All visual consumers migrated. Remaining `useAppSelector(…theme.mode…)` usages are toggles, settings, or intentional demos only.

---

## Core primitive

| File | Status |
|------|--------|
| `styles/themes/useThemeMode.ts` | ✅ |
| `lib/sync/engine/boot.ts` | ✅ reconcile on boot |

---

## Visual consumers — migrated

| File | Status |
|------|--------|
| `features/code-editor/components/code-block/CodeBlock.tsx` | ✅ |
| `components/mardown-display/chat-markdown/InlineCodeSnippet.tsx` | ✅ |
| `features/files/components/core/FilePreview/previewers/CodePreview.tsx` | ✅ |
| `components/diff/views/RawJsonView.tsx` | ✅ |
| `components/mardown-display/markdown-classification/MarkdownClassificationTester.tsx` | ✅ |
| `components/official/themed-section-card/ThemedSectionCard.tsx` | ✅ |
| `components/rich-text-editor/MarkdownDualDisplay.tsx` | ✅ |
| `components/rich-text-editor/RemirrorEditor.tsx` | ✅ |
| `components/mardown-display/chat-markdown/diff-blocks/renderers/SearchReplaceDiffRenderer.tsx` | ✅ |
| `components/mardown-display/chat-markdown/FullScreenMarkdownEditor.tsx` | ✅ |
| `components/mardown-display/chat-markdown/tui/TuiEditorContent.tsx` | ✅ |
| `components/mardown-display/markdown-classification/MarkdownClassifier.tsx` | ✅ |
| `components/mardown-display/blocks/mermaid/MermaidBlock.tsx` | ✅ |
| `components/mermaid/MermaidView.tsx` | ✅ |
| `components/mermaid/code/CodeModePane.tsx` | ✅ |
| `components/mermaid/workbench/MermaidWorkbench.tsx` | ✅ |
| `components/official-candidate/json-inspector/JsonEditorPane.tsx` | ✅ |
| `features/code-editor/components/DiffView.tsx` | ✅ |
| `features/code-editor/components/code-block/MultiFileCodeEditor.tsx` | ✅ |
| `features/code-editor/multi-file-core/MultiFileCodeEditorBody.tsx` | ✅ |
| `features/code-editor/multi-file-core/useCodeEdiorBasics.ts` | ✅ |
| `features/code-editor/agent-code-editor/components/parts/CodeOrDiffColumn.tsx` | ✅ |
| `features/code-editor/agent-code-editor/components/parts/DiffView.tsx` | ✅ |
| `features/code-editor/hooks/useMonacoTheme.ts` | ✅ |
| `features/code/editor/useMonacoTheme.ts` | ✅ |
| `features/window-panels/windows/code/CodeEditorWindow.tsx` | ✅ |
| `features/window-panels/windows/multi-file-smart-code-editor/MultiFileSmartCodeEditorWindow.tsx` | ✅ |
| `features/administration/database-admin/SyntaxHighlighter.tsx` | ✅ |
| `features/kg-graph/components/KgGraphCytoscape.tsx` | ✅ |
| `features/data-tables/hooks/useUniverDarkModeSync.ts` | ✅ |
| `features/data-tables/components/WorkbookEditor.tsx` | ✅ |
| `features/data-tables/components/DocumentEditor.tsx` | ✅ |
| `features/applet/builder/modules/field-builder/previews/FieldPreview.tsx` | ✅ |
| `app/(dev)/demos/tests/_maps/OpenStreetMapComponent.tsx` | ✅ |
| `app/(dev)/demos/tests/_maps/components/LayerSwitcher.tsx` | ✅ |
| `app/(dev)/demos/tests/_maps/components/SearchControl.tsx` | ✅ |
| `app/(dev)/demos/tests/tailwind-test/color-converter/components/ColorInput.tsx` | ✅ |
| `app/(dev)/demos/glass-lab/_components/VariantPicker.tsx` | ✅ |
| `components/ui/sonner.tsx` | ✅ |
| `features/image-studio/modes/edit/EditModeShell.tsx` | ✅ |
| `components/diff/code/CodeDiff.tsx` | ✅ |
| `features/files/components/core/FileEditor/CloudFileEditor.tsx` | ✅ |

---

## Keep Redux (correct)

| File | Reason |
|------|--------|
| `styles/themes/ThemeSwitcher.tsx` | Toggle UI |
| `features/shell/components/header/header-right-menu/ThemeToggleMenuItem.tsx` | Toggle UI |
| `components/matrx/PublicHeaderThemeToggle.tsx` | Toggle UI |
| `components/layout/new-layout/MobileUnifiedMenu.tsx` | Toggle UI |
| `features/public-chat/components/ChatMobileHeader.tsx` | Toggle UI |
| `components/ui/menu-system/MenuCore.tsx` | Toggle UI |
| `components/debug/debug-interface.tsx` | Debug Redux state |
| `features/settings/tabs/AppearanceTab.tsx` | Settings write path |
| `app/(dev)/demos/settings-hooks/page.dev.tsx` | Demo Redux inspector |
| `app/(dev)/demos/sync-demo/theme/_client.tsx` | Demo compares Redux vs DOM |

---

## Already DOM-correct (optional future consolidate)

These read `document.documentElement.classList` inline and behave correctly; could switch to `useThemeMode()` later for consistency:

- `features/code/terminal/TerminalTab.tsx`
- `components/mardown-display/blocks/diagram/InteractiveDiagramBlock.tsx`
- `lib/block-print/dom-capture-print-utils.ts`
- `features/whatsapp-clone/chat-view/MessageInputBar.tsx`
- `app/(dev)/demos/glass-lab/_components/DraggableGlassWidget.tsx`

---

## Text blocks

`TextEditor`, `SimpleMarkdownBlock`, `RichTextBlock` — removed unused local `isDark` MutationObserver state (styling uses Tailwind `dark:` only).

---

## ESLint follow-up (future)

Consider banning `useAppSelector(…theme.mode…)` outside theme toggles / settings / tests.
