"use client";

// components/rich-editor/visual/nodes/SourceLockedView.tsx
//
// Markdown the visual editor cannot hold byte-for-byte (an indented code
// block, raw HTML, a spelling the serializer does not model, CRLF text). It is
// never re-written: shown rendered, with the reason, and edited as source.

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { FileLock2, GripVertical, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRichEditorContext } from "../../RichEditorContext";
import { IslandCodeEditor } from "../../islands/IslandCodeEditor";
import { IslandPreview } from "../../islands/IslandPreview";

export function SourceLockedView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const context = useRichEditorContext();
  const raw = String(node.attrs.raw ?? "");
  const reason = node.attrs.reason ? String(node.attrs.reason) : "source";
  const [editing, setEditing] = useState(false);
  const readOnly = context.readOnly || !editor.isEditable;
  const isPageBreak = reason === "page break";

  return (
    <NodeViewWrapper
      className={cn(
        "rich-editor-locked group/locked relative my-2 rounded-md border border-dashed transition-colors",
        selected ? "border-primary" : "border-border/70",
      )}
      contentEditable={false}
    >
      <div className="flex items-center gap-1.5 px-2 pt-1 text-[11px] text-muted-foreground opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/locked:opacity-100 sm:group-focus-within/locked:opacity-100">
        <span data-drag-handle className="cursor-grab text-muted-foreground/60" aria-hidden>
          <GripVertical className="h-3 w-3" />
        </span>
        <FileLock2 className="h-3 w-3" />
        <span>{isPageBreak ? "Page break" : `Kept exactly as written — ${reason}`}</span>
        {!readOnly && (
          <button
            type="button"
            className={cn("ml-auto rounded p-1 hover:bg-muted hover:text-foreground", editing && "bg-muted text-foreground")}
            onClick={() => setEditing((value) => !value)}
            title={editing ? "Done editing" : "Edit as source"}
            aria-pressed={editing}
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      {editing && !readOnly ? (
        <div className="p-2">
          <IslandCodeEditor
            value={raw}
            onChange={(next) => updateAttributes({ raw: next })}
            language="markdown"
            autoFocus
            ariaLabel="Source"
            onExit={() => {
              setEditing(false);
              editor.commands.focus();
            }}
          />
        </div>
      ) : (
        <div className="px-3 pb-2" onDoubleClick={() => !readOnly && setEditing(true)}>
          <IslandPreview raw={raw} islandType={isPageBreak ? "html_comment" : "prose"} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
