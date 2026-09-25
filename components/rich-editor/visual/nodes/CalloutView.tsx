"use client";

// components/rich-editor/visual/nodes/CalloutView.tsx
//
// A blockquote; with a GFM alert marker (`> [!NOTE]`) it is a callout with an
// icon and a type switch. Changing the type rewrites only the marker line.

import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { AlertOctagon, AlertTriangle, Info, Lightbulb, MessageSquareWarning, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CALLOUT_TYPES, type CalloutType } from "../../core/commands";

const CALLOUT_STYLE: Record<CalloutType, { icon: LucideIcon; label: string; className: string }> = {
  NOTE: { icon: Info, label: "Note", className: "border-sky-500/60 bg-sky-500/5 [&_.rich-callout-head]:text-sky-700 dark:[&_.rich-callout-head]:text-sky-300" },
  TIP: { icon: Lightbulb, label: "Tip", className: "border-emerald-500/60 bg-emerald-500/5 [&_.rich-callout-head]:text-emerald-700 dark:[&_.rich-callout-head]:text-emerald-300" },
  IMPORTANT: { icon: MessageSquareWarning, label: "Important", className: "border-violet-500/60 bg-violet-500/5 [&_.rich-callout-head]:text-violet-700 dark:[&_.rich-callout-head]:text-violet-300" },
  WARNING: { icon: AlertTriangle, label: "Warning", className: "border-amber-500/60 bg-amber-500/5 [&_.rich-callout-head]:text-amber-700 dark:[&_.rich-callout-head]:text-amber-300" },
  CAUTION: { icon: AlertOctagon, label: "Caution", className: "border-red-500/60 bg-red-500/5 [&_.rich-callout-head]:text-red-700 dark:[&_.rich-callout-head]:text-red-300" },
};

export function CalloutView({ node, updateAttributes, editor }: NodeViewProps) {
  const alert = node.attrs.mdAlert as string | null;
  const type = alert ? (alert.slice(2, -1).toUpperCase() as CalloutType) : null;
  const style = type ? CALLOUT_STYLE[type] : null;
  if (!type || !style || !alert) {
    return (
      <NodeViewWrapper as="blockquote">
        <NodeViewContent />
      </NodeViewWrapper>
    );
  }
  const Icon = style.icon;
  // Keep the author's casing ([!note] vs [!NOTE]) when the type changes.
  const lower = alert === alert.toLowerCase();
  return (
    <NodeViewWrapper as="div" className={cn("rich-editor-callout my-3 rounded-md border-l-4 px-3 py-2", style.className)}>
      <div className="rich-callout-head mb-1 flex items-center gap-1.5 text-sm font-semibold" contentEditable={false}>
        <Icon className="h-4 w-4" />
        {editor.isEditable ? (
          <select
            aria-label="Callout type"
            className="rounded bg-transparent text-sm font-semibold outline-none hover:bg-muted/60"
            value={type}
            onChange={(event) => {
              const next = event.target.value;
              updateAttributes({ mdAlert: `[!${lower ? next.toLowerCase() : next}]` });
            }}
          >
            {CALLOUT_TYPES.map((option) => (
              <option key={option} value={option}>
                {CALLOUT_STYLE[option].label}
              </option>
            ))}
          </select>
        ) : (
          style.label
        )}
      </div>
      <NodeViewContent className="rich-callout-body" />
    </NodeViewWrapper>
  );
}
