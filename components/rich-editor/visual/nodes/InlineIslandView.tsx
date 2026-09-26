"use client";

// components/rich-editor/visual/nodes/InlineIslandView.tsx
//
// An inline island — {{variable}}, inline math, a citation, an image, an HTML
// or XML tag — as an atomic chip inside the sentence. Its bytes never change
// unless the person edits it here: a variable is re-picked or renamed, an
// equation is edited with a live preview through the shared renderer.

import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { Braces, Sigma } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRichEditorContext } from "../../RichEditorContext";
import { IslandCodeEditor } from "../../islands/IslandCodeEditor";
import { IslandPreview } from "../../islands/IslandPreview";
import { inlineIslandLabel, texOf } from "../../islands/island-meta";
import { isEscapedBracketMath } from "@/components/markdown-core/math-normalizer";
import {
  VARIABLE_STATE_CLASS,
  classifyVariable,
  toVariableName,
} from "../../core/variables";

/** The delimiters an inline equation was written with, so an edit keeps them. */
function mathDelimiters(raw: string): [string, string] {
  if (raw.startsWith("\\(")) return ["\\(", "\\)"];
  if (raw.startsWith("\\[")) return ["\\[", "\\]"];
  if (raw.startsWith("$$")) return ["$$", "$$"];
  return ["$", "$"];
}

function imageParts(raw: string): { alt: string; src: string } | null {
  const match = /^!\[([^\]]*)\]\(([^)\s]+)/.exec(raw);
  return match ? { alt: match[1] ?? "", src: match[2] ?? "" } : null;
}

export function InlineIslandView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const context = useRichEditorContext();
  const raw = String(node.attrs.raw ?? "");
  const islandType = String(node.attrs.islandType ?? "variable");
  const [open, setOpen] = useState(false);
  const readOnly = context.readOnly || !editor.isEditable;

  const write = (next: string) => {
    if (next === raw || !next) return;
    context.approveIsland(raw);
    updateAttributes({ raw: next });
  };

  if (islandType === "variable") {
    const info = classifyVariable(raw, context.variables);
    const [renaming, setRenaming] = [open, setOpen];
    return (
      <NodeViewWrapper as="span" className="rich-editor-inline-island" contentEditable={false}>
        <Popover open={renaming && !readOnly} onOpenChange={setRenaming}>
          <PopoverTrigger asChild>
            <span
              role="button"
              tabIndex={-1}
              title={info.title}
              className={cn(
                "mx-px inline-flex cursor-pointer items-center gap-0.5 rounded-md border px-1 py-px align-baseline font-medium text-[0.92em]",
                VARIABLE_STATE_CLASS[info.state],
                selected && "ring-2 ring-primary/50",
              )}
            >
              <Braces className="h-3 w-3 opacity-70" />
              {info.name}
              {info.declared?.type && <span className="ml-0.5 text-[0.8em] opacity-70">{info.declared.type}</span>}
            </span>
          </PopoverTrigger>
          <PopoverContent sizing="content" className="p-2" align="start">
            <div className="mb-1 text-xs font-medium text-muted-foreground">Variable</div>
            <input
              className="mb-2 h-8 w-full rounded-md border border-border bg-background px-2 text-base sm:text-sm"
              defaultValue={info.name}
              aria-label="Variable name"
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  const name = toVariableName(event.currentTarget.value);
                  if (name) write(`{{${name}}}`);
                  setRenaming(false);
                  editor.commands.focus();
                }
              }}
            />
            {context.variables && context.variables.length > 0 && (
              <div className="max-h-48 overflow-y-auto">
                {context.variables.map((variable) => (
                  <button
                    key={variable.name}
                    type="button"
                    className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-muted"
                    onClick={() => {
                      write(`{{${variable.name}}}`);
                      setRenaming(false);
                    }}
                  >
                    <span>{variable.name}</span>
                    {variable.type && <span className="text-xs text-muted-foreground">{variable.type}</span>}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-2 text-[11px] text-muted-foreground">{info.title}</p>
          </PopoverContent>
        </Popover>
      </NodeViewWrapper>
    );
  }

  if (islandType === "math_inline") {
    const tex = texOf(raw);
    const [open$, close$] = mathDelimiters(raw);
    // `\[1\]`, `\[x\]`, `\[word\]` are escaped brackets, not math — the reader
    // sees "[1]", as the renderer shows it (isEscapedBracketMath, the one rule).
    // With content-ir's own rule installed the tokenizer never makes these islands.
    if (open$ === "\\[" && !isEscapedBracketMath(tex, undefined)) {
      return (
        <NodeViewWrapper as="span" className="rich-editor-inline-island" contentEditable={false}>
          <span title="Escaped brackets — kept exactly as written" className={cn(selected && "rounded ring-2 ring-primary/50")}>
            [{raw.slice(2, -2)}]
          </span>
        </NodeViewWrapper>
      );
    }
    return (
      <NodeViewWrapper as="span" className="rich-editor-inline-island" contentEditable={false}>
        <Popover open={open && !readOnly} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <span
              role="button"
              tabIndex={-1}
              title="Equation — click to edit"
              className={cn(
                "mx-px inline-flex cursor-pointer items-center gap-0.5 rounded border border-violet-300/60 bg-violet-50 px-1 font-mono text-[0.85em] text-violet-700 dark:border-violet-700/60 dark:bg-violet-950/40 dark:text-violet-300",
                selected && "ring-2 ring-primary/50",
              )}
            >
              <Sigma className="h-3 w-3 opacity-70" />
              {tex || "equation"}
            </span>
          </PopoverTrigger>
          <PopoverContent sizing="content" className="space-y-2 p-2" align="start">
            <IslandCodeEditor
              value={tex}
              onChange={(next) => write(`${open$}${next}${close$}`)}
              language="math"
              autoFocus
              ariaLabel="Equation (TeX)"
              onExit={() => {
                setOpen(false);
                editor.commands.focus();
              }}
            />
            <div className="rounded-md border border-dashed border-border px-2 py-1">
              <IslandPreview raw={`$$\n${tex}\n$$`} islandType="math_block" />
            </div>
          </PopoverContent>
        </Popover>
      </NodeViewWrapper>
    );
  }

  const image = islandType === "md_image" ? imageParts(raw) : null;
  if (image) {
    return (
      <NodeViewWrapper as="span" className="rich-editor-inline-island" contentEditable={false}>
        <img
          src={image.src}
          alt={image.alt}
          title={raw}
          className={cn("inline-block max-h-64 max-w-full rounded-md align-middle", selected && "ring-2 ring-primary")}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="rich-editor-inline-island" contentEditable={false}>
      <span
        title={`${inlineIslandLabel(islandType)} — kept exactly as written`}
        className={cn(
          "mx-px inline rounded border border-border bg-muted/60 px-1 font-mono text-[0.82em] text-muted-foreground",
          selected && "ring-2 ring-primary/50",
        )}
      >
        {raw}
      </span>
    </NodeViewWrapper>
  );
}
