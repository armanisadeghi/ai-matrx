"use client";

// components/rich-editor/visual/nodes/IslandBlockView.tsx
//
// A protected block (kind JSON, XML section, code, math, HTML, comment,
// anchor, page break) in the visual editor: rendered through the shared
// renderer, locked against prose editing, and edited only in its OWN editor —
// which writes the new bytes through the one explicit island edit and tells
// the save gate the change was on purpose.

import { useEffect, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlertTriangle, Check, Copy, GripVertical, Lock, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useRichEditorContext } from "../../RichEditorContext";
import { IslandCodeEditor } from "../../islands/IslandCodeEditor";
import { IslandPreview } from "../../islands/IslandPreview";
import {
  CODE_LANGUAGES,
  islandMeta,
  texOf,
  fenceLanguage as fenceLanguageOf,
  withFenceLanguage,
} from "../../islands/island-meta";
import { consumeAutoEdit } from "../auto-edit";


export function IslandBlockView({ node, updateAttributes, deleteNode, selected, editor, getPos }: NodeViewProps) {
  const context = useRichEditorContext();
  const raw = String(node.attrs.raw ?? "");
  const islandType = String(node.attrs.islandType ?? "fence");
  const complete = node.attrs.complete !== false;
  const meta = islandMeta(islandType, raw);
  const Icon = meta.icon;
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const pos = typeof getPos === "function" ? getPos() : undefined;
    if (typeof pos === "number" && consumeAutoEdit(editor, pos)) setEditing(true);
  }, [editor, getPos]);

  const write = (next: string) => {
    if (next === raw) return;
    context.approveIsland(raw);
    updateAttributes({ raw: next, complete: true });
  };

  const remove = () => {
    context.approveIsland(raw);
    deleteNode();
    toast.info(`${meta.label} removed — press ⌘Z / Ctrl+Z to bring it back.`);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Copy failed — your browser blocked clipboard access.");
    }
  };

  const isFence = islandType === "fence";
  const isMath = meta.language === "math";
  const readOnly = context.readOnly || !editor.isEditable;

  return (
    <NodeViewWrapper
      className={cn(
        "rich-editor-island group/island relative my-3 rounded-lg border bg-card/60 transition-colors",
        selected ? "border-primary ring-1 ring-primary/40" : "border-border",
      )}
      data-island-type={islandType}
      contentEditable={false}
    >
      <div className="flex min-h-8 items-center gap-1.5 border-b border-border/60 px-2 py-1 text-xs text-muted-foreground">
        <span data-drag-handle className="cursor-grab touch-none text-muted-foreground/60 hover:text-foreground" aria-hidden>
          <GripVertical className="h-3.5 w-3.5" />
        </span>
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate font-medium text-foreground/80">{meta.label}</span>
        <Lock className="h-3 w-3 shrink-0 opacity-60" aria-label="Protected — never rewritten by the editor" />
        {!complete && (
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400" title="This block's closing marker is missing, so it runs to the end of the text. It is kept exactly as written.">
            <AlertTriangle className="h-3 w-3" /> not closed
          </span>
        )}
        {isFence && !readOnly && (
          <select
            className="ml-1 h-6 max-w-[8rem] rounded border border-border bg-background px-1 text-xs text-foreground"
            aria-label="Code language"
            value={fenceLanguageOf(raw)}
            onChange={(event) => write(withFenceLanguage(raw, event.target.value))}
          >
            {[...new Set([fenceLanguageOf(raw), ...CODE_LANGUAGES])].map((language) => (
              <option key={language || "plain"} value={language}>
                {language || "Plain text"}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-0.5 opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover/island:opacity-100 sm:group-focus-within/island:opacity-100">
          <button type="button" className="rounded p-1 hover:bg-muted hover:text-foreground" onClick={copy} title="Copy its exact source">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          {!readOnly && (
            <>
              <button
                type="button"
                className={cn("rounded p-1 hover:bg-muted hover:text-foreground", editing && "bg-muted text-foreground")}
                onClick={() => setEditing((value) => !value)}
                title={editing ? "Done editing" : "Edit its source"}
                aria-pressed={editing}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
                onClick={remove}
                title="Remove this block from the document (Undo brings it back)"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      {editing && !readOnly ? (
        <div className="space-y-2 p-2">
          <IslandCodeEditor
            value={raw}
            onChange={write}
            language={meta.language}
            autoFocus
            ariaLabel={`${meta.label} source`}
            onExit={() => {
              setEditing(false);
              editor.commands.focus();
            }}
          />
          {isMath && (
            <div className="rounded-md border border-dashed border-border px-3 py-2">
              <div className="mb-1 text-[11px] uppercase tracking-wide text-muted-foreground">Preview</div>
              <IslandPreview raw={raw} islandType={islandType} />
              {!texOf(raw).trim() && <p className="text-xs text-muted-foreground">Type TeX above, e.g. \frac{"{a}"}{"{b}"}.</p>}
            </div>
          )}
        </div>
      ) : (
        <div
          className="max-h-[32rem] overflow-auto px-3 py-2"
          onDoubleClick={() => !readOnly && setEditing(true)}
        >
          <IslandPreview raw={raw} islandType={islandType} />
        </div>
      )}
    </NodeViewWrapper>
  );
}
