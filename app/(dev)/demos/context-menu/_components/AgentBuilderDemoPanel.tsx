"use client";

/**
 * AgentBuilderDemoPanel — textarea stand-in for agent-builder fields.
 * Wires the menu to target `/agents/[id]` production shape:
 *   matrx-user/agent-builder + full agent scope + focused_field
 */

import { useCallback, useRef, useState } from "react";
import {
  AGENT_BUILDER_CONTEXT_MENU_PROPS,
  buildAgentBuilderContextData,
} from "@/features/agents/agent-context/buildAgentBuilderContextData";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v2/utils/build-application-scope";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import type { EditableContextMenuProps } from "@/features/context-menu-v3/types";
import {
  DEMO_AGENT_BUILDER_SCOPE,
  DEMO_AGENT_FIELD_INITIAL,
  DEMO_AGENT_FOCUSED_FIELD,
} from "../_fixtures/agent-builder-demo";
import { DemoProTextarea } from "./DemoProTextarea";

export interface AgentBuilderDemoPanelProps {
  title: string;
  description: React.ReactNode;
  initialContent?: string;
  focusedField?: string;
  menuOverrides?: Partial<EditableContextMenuProps>;
  minHeightClass?: string;
}

export function AgentBuilderDemoPanel({
  title,
  description,
  initialContent = DEMO_AGENT_FIELD_INITIAL,
  focusedField = DEMO_AGENT_FOCUSED_FIELD,
  menuOverrides,
  minHeightClass = "min-h-[180px]",
}: AgentBuilderDemoPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [content, setContent] = useState(initialContent);
  const [history, setHistory] = useState<string[]>([initialContent]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const pushHistory = (next: string) => {
    const trimmed = history.slice(0, historyIndex + 1);
    trimmed.push(next);
    setHistory(trimmed);
    setHistoryIndex(trimmed.length - 1);
  };

  const contextData = buildAgentBuilderContextData({
    agentScope: {
      ...DEMO_AGENT_BUILDER_SCOPE,
      is_dirty: historyIndex > 0 || content !== DEMO_AGENT_FIELD_INITIAL,
    },
    fieldContent: content,
    focusedField,
  });

  const getApplicationScope = useCallback(() => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? 0;
    const end = el?.selectionEnd ?? 0;
    const selectedText =
      start !== end && el
        ? el.value.slice(Math.min(start, end), Math.max(start, end))
        : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: el ? { type: "editable", element: el, start, end } : null,
      contextData,
    });
  }, [content, contextData]);

  const replaceContent = (next: string) => {
    setContent(next);
    pushHistory(next);
  };

  const handleUndo = useCallback(() => {
    if (historyIndex <= 0) return;
    const i = historyIndex - 1;
    setHistoryIndex(i);
    setContent(history[i]);
  }, [history, historyIndex]);

  const handleRedo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const i = historyIndex + 1;
    setHistoryIndex(i);
    setContent(history[i]);
  }, [history, historyIndex]);

  return (
    <section className="flex flex-col gap-2">
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        <div className="text-[11px] text-muted-foreground">{description}</div>
      </header>
      <EditableContextMenu
        {...AGENT_BUILDER_CONTEXT_MENU_PROPS}
        getTextarea={() => textareaRef.current}
        getApplicationScope={getApplicationScope}
        onTextReplace={replaceContent}
        onTextInsertBefore={(t) => replaceContent(t + content)}
        onTextInsertAfter={(t) => replaceContent(content + t)}
        onContentInserted={() => {
          if (textareaRef.current) pushHistory(textareaRef.current.value);
        }}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        contextData={contextData}
        {...menuOverrides}
      >
        <DemoProTextarea
          ref={textareaRef}
          surfaceName={AGENT_BUILDER_CONTEXT_MENU_PROPS.surfaceName}
          getApplicationScope={getApplicationScope}
          value={content}
          onChange={(e) => {
            setContent(e.target.value);
            pushHistory(e.target.value);
          }}
          spellCheck={false}
          minHeightClass={minHeightClass}
        />
      </EditableContextMenu>
    </section>
  );
}
