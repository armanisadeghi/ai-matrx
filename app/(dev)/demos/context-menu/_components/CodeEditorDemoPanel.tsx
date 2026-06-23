"use client";

/**
 * CodeEditorDemoPanel — textarea stand-in for Monaco that wires the context
 * menu exactly like `CodeWorkspaceContextMenu` on `/code`:
 *   - sourceFeature / surfaceName / isEditable / enabledPlacements
 *   - full `vsc_*` contextData via `buildCodeWorkspaceContextData`
 *   - contextFilter: "code-editor" (excludes general shortcuts)
 */

import { useCallback, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  buildCodeWorkspaceContextData,
  CODE_WORKSPACE_CONTEXT_MENU_PROPS,
} from "@/features/code/agent-context/buildCodeWorkspaceContextData";
import { textareaCursorMeta } from "@/features/code/agent-context/textareaCursorMeta";
import type { UnifiedAgentContextMenuProps } from "@/features/context-menu-v2/UnifiedAgentContextMenu";
import {
  DEMO_CODE_EDITOR_ALL_DIAGNOSTICS,
  DEMO_CODE_EDITOR_DIAGNOSTICS,
  DEMO_CODE_EDITOR_FILE_PATH,
  DEMO_CODE_EDITOR_INITIAL_CONTENT,
  DEMO_CODE_EDITOR_LANGUAGE,
} from "../_fixtures/code-editor-demo";
import { DemoProTextarea } from "./DemoProTextarea";

const UnifiedAgentContextMenu = dynamic(
  () =>
    import("@/features/context-menu-v2/UnifiedAgentContextMenu").then((m) => ({
      default: m.UnifiedAgentContextMenu,
    })),
  { ssr: false },
);

export interface CodeEditorDemoPanelProps {
  title: string;
  description: React.ReactNode;
  initialContent?: string;
  /**
   * `production` — contextFilter: "code-editor" (matches `/code`).
   * `explicit` — omits contextFilter; pass addedContexts/excludedContexts via menuOverrides.
   */
  contextFilterMode?: "production" | "explicit";
  /** Extra props merged onto the production code-editor menu baseline. */
  menuOverrides?: Partial<UnifiedAgentContextMenuProps>;
  minHeightClass?: string;
}

export function CodeEditorDemoPanel({
  title,
  description,
  initialContent = DEMO_CODE_EDITOR_INITIAL_CONTENT,
  contextFilterMode = "production",
  menuOverrides,
  minHeightClass = "min-h-[180px]",
}: CodeEditorDemoPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [content, setContent] = useState(initialContent);
  const [selectedText, setSelectedText] = useState("");
  const [caretIndex, setCaretIndex] = useState(0);

  const syncSelectionFromTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    setCaretIndex(start);
    setSelectedText(
      start !== end
        ? content.slice(Math.min(start, end), Math.max(start, end))
        : "",
    );
  }, [content]);

  const { currentLine, currentColumn, lineCount } = textareaCursorMeta(
    content,
    caretIndex,
  );

  const contextData = buildCodeWorkspaceContextData(
    {
      fullContent: content,
      selectedText,
      language: DEMO_CODE_EDITOR_LANGUAGE,
      filePath: DEMO_CODE_EDITOR_FILE_PATH,
      currentLine,
      currentColumn,
      lineCount,
      activeTabDiagnostics: DEMO_CODE_EDITOR_DIAGNOSTICS,
      allDiagnostics: DEMO_CODE_EDITOR_ALL_DIAGNOSTICS,
    },
    {
      contextFilter: contextFilterMode === "production" ? "code-editor" : null,
    },
  );

  const explicitContextProps: Partial<UnifiedAgentContextMenuProps> =
    contextFilterMode === "explicit"
      ? {
          addedContexts: ["code-editor"],
          excludedContexts: ["general"],
        }
      : {};

  return (
    <section className="flex flex-col gap-2">
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </header>
      <UnifiedAgentContextMenu
        {...CODE_WORKSPACE_CONTEXT_MENU_PROPS}
        {...explicitContextProps}
        contextData={contextData}
        {...menuOverrides}
      >
        <DemoProTextarea
          ref={textareaRef}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            setCaretIndex(e.target.selectionStart);
          }}
          onSelect={syncSelectionFromTextarea}
          onKeyUp={syncSelectionFromTextarea}
          onMouseUp={syncSelectionFromTextarea}
          spellCheck={false}
          mono
          minHeightClass={minHeightClass}
        />
      </UnifiedAgentContextMenu>
    </section>
  );
}
