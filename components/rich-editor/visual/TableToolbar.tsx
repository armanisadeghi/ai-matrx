"use client";

// components/rich-editor/visual/TableToolbar.tsx
//
// Table controls that appear while the cursor is in a table (Notion / Google
// Docs): add or remove rows and columns, align the column, delete the table.
// Every change rewrites only the table's markdown — unchanged rows keep their
// stored bytes (markdown-serialize.ts).

import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { PluginKey } from "@tiptap/pm/state";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns3,
  Rows3,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setColumnAlign } from "../core/commands";

const TABLE_MENU_KEY = new PluginKey("richEditorTableMenu");

interface Tool {
  id: string;
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  danger?: boolean;
}

const TOOLS: Array<Tool | "|"> = [
  { id: "row-above", label: "Add row above", icon: ArrowUpToLine, run: (e) => e.chain().focus().addRowBefore().run() },
  { id: "row-below", label: "Add row below", icon: ArrowDownToLine, run: (e) => e.chain().focus().addRowAfter().run() },
  { id: "col-left", label: "Add column left", icon: ArrowLeftToLine, run: (e) => e.chain().focus().addColumnBefore().run() },
  { id: "col-right", label: "Add column right", icon: ArrowRightToLine, run: (e) => e.chain().focus().addColumnAfter().run() },
  "|",
  { id: "align-left", label: "Align column left", icon: AlignLeft, run: (e) => setColumnAlign(e, "left") },
  { id: "align-center", label: "Center column", icon: AlignCenter, run: (e) => setColumnAlign(e, "center") },
  { id: "align-right", label: "Align column right", icon: AlignRight, run: (e) => setColumnAlign(e, "right") },
  "|",
  { id: "del-row", label: "Delete row", icon: Rows3, run: (e) => e.chain().focus().deleteRow().run(), danger: true },
  { id: "del-col", label: "Delete column", icon: Columns3, run: (e) => e.chain().focus().deleteColumn().run(), danger: true },
  { id: "del-table", label: "Delete table (Undo brings it back)", icon: Trash2, run: (e) => e.chain().focus().deleteTable().run(), danger: true },
];

export function TableToolbar({ editor }: { editor: Editor }) {
  return (
    <BubbleMenu
      editor={editor}
      pluginKey={TABLE_MENU_KEY}
      options={{ placement: "top-start", offset: 6 }}
      shouldShow={({ editor: current }) => current.isEditable && current.isActive("table")}
      getReferencedVirtualElement={() => {
        const { $from } = editor.state.selection;
        for (let depth = $from.depth; depth > 0; depth -= 1) {
          if ($from.node(depth).type.name === "table") {
            const dom = editor.view.nodeDOM($from.before(depth));
            if (dom instanceof HTMLElement) return { getBoundingClientRect: () => dom.getBoundingClientRect() };
          }
        }
        return null;
      }}
      className="matrx-touch-targets z-30 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-md"
    >
      {TOOLS.map((tool, index) =>
        tool === "|" ? (
          <span key={`sep-${index}`} className="mx-0.5 h-5 w-px bg-border" />
        ) : (
          <button
            key={tool.id}
            type="button"
            title={tool.label}
            aria-label={tool.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => tool.run(editor)}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
              tool.danger && "hover:bg-destructive/10 hover:text-destructive",
            )}
          >
            <tool.icon className="h-4 w-4" />
          </button>
        ),
      )}
    </BubbleMenu>
  );
}
