"use client";

// features/spaces/editor/selection-format.tsx — a Space's formatting as REGISTERED actions of the ONE selection
// toolbar (components/selection-toolbar): inline styles, Link, text colour and the block type, plus Ask AI and
// Comment. The strip keeps one compact row (bold, italic, link, colour, Ask AI, Comment); the rest sit behind
// More. Link and colour draw a small panel inside the toolbar's own frame — never a second bubble.

import type { ReactNode } from "react";
import { useState } from "react";
import type { Action } from "@ai-matrx/alchemy/actions";
import { registerAlchemyIcon } from "@ai-matrx/rich-content/utils/alchemy-icon-keys";
import { selectionToolbarHostOf, shownInSelectionMode } from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import type { SelectionToolbarUi } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";
import { Bold, CheckSquare, Code, Heading1, Heading2, Heading3, Italic, Link as LinkIcon, List, ListOrdered, MessageSquare, Palette, Quote, Strikethrough } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import type { SpacesEditor } from "./schema";

const COLORS = ["default", "gray", "brown", "red", "orange", "yellow", "green", "blue", "purple", "pink"] as const;
const LINK_PANEL = "space-link";
const COLOR_PANEL = "space-color";

type Placement = "primary" | "overflow";
const BLOCKS: Array<[id: string, label: string, Icon: typeof Heading1, type: string, props?: Record<string, unknown>]> = [
  ["selection:format-h1", "Heading 1", Heading1, "heading", { level: 1 }],
  ["selection:format-h2", "Heading 2", Heading2, "heading", { level: 2 }],
  ["selection:format-h3", "Heading 3", Heading3, "heading", { level: 3 }],
  ["selection:format-quote", "Quote", Quote, "quote"],
  ["selection:format-list", "Bulleted list", List, "bulletListItem"],
  ["selection:format-numbered", "Numbered list", ListOrdered, "numberedListItem"],
  ["selection:format-tasks", "To-do list", CheckSquare, "checkListItem"],
];
const STYLES: Array<[id: string, label: string, Icon: typeof Bold, style: string, placement: Placement]> = [
  ["selection:format-bold", "Bold", Bold, "bold", "primary"],
  ["selection:format-italic", "Italic", Italic, "italic", "primary"],
  ["selection:format-strike", "Strikethrough", Strikethrough, "strike", "overflow"],
  ["selection:format-code", "Code", Code, "code", "overflow"],
];

export interface SpaceSelectionDeps {
  editor: SpacesEditor;
  editable: boolean;
  hasComment: boolean;
  askAi: () => void;
  comment: () => void;
}

export function spaceSelectionActions({ editor, editable, hasComment, askAi, comment }: SpaceSelectionDeps): Action[] {
  const base = (id: string, label: string, icon: Parameters<typeof registerAlchemyIcon>[0], order: number, placement: Placement, category: Action["category"]) => ({
    id,
    label,
    icon: registerAlchemyIcon(icon),
    category,
    order,
    placement,
    preserveSelection: true,
  });
  const edit = (id: string) => (t: Parameters<Action["eligible"]>[0]) =>
    editable && shownInSelectionMode(id, t) ? ({ status: "available" } as const) : ({ status: "absent" } as const);
  const actions: Action[] = [
    ...STYLES.map(([id, label, Icon, style, placement], i): Action => ({
      ...base(id, label, Icon, 10 + i, placement, "edit"),
      eligible: edit(id),
      run: () => {
        editor.focus();
        editor.toggleStyles({ [style]: true } as never);
      },
    })),
    {
      ...base("selection:format-link", "Link", LinkIcon, 12.5, "primary", "edit"),
      eligible: edit("selection:format-link"),
      run: (t) => selectionToolbarHostOf(t)?.ui.openPanel(LINK_PANEL),
    },
    {
      ...base("selection:format-color", "Text colour", Palette, 12.6, "primary", "edit"),
      eligible: edit("selection:format-color"),
      run: (t) => selectionToolbarHostOf(t)?.ui.openPanel(COLOR_PANEL),
    },
    ...BLOCKS.map(([id, label, Icon, type, props], i): Action => ({
      ...base(id, label, Icon, 30 + i, "overflow", "edit"),
      eligible: edit(id),
      run: () => {
        editor.focus();
        editor.updateBlock(editor.getTextCursorPosition().block, { type, props: props ?? {} } as never);
      },
    })),
    {
      ...base("selection:ai", "Ask AI", AGENT_ICON, 20, "primary", "ai"),
      eligible: edit("selection:ai"),
      run: () => askAi(),
    },
    {
      ...base("selection:comment", "Comment", MessageSquare, 21, "primary", "feedback"),
      eligible: (t) => (hasComment && shownInSelectionMode("selection:comment", t) ? { status: "available" } : { status: "absent" }),
      run: () => comment(),
    },
  ];
  return actions;
}

function LinkPanel({ editor, ui }: { editor: SpacesEditor; ui: SelectionToolbarUi }) {
  const [url, setUrl] = useState("https://");
  const apply = () => {
    const href = url.trim();
    if (href && href !== "https://") {
      editor.focus();
      editor.createLink(href);
    }
    ui.close();
  };
  return (
    <div className="flex items-center gap-1 p-1" data-selection-panel="">
      <input
        autoFocus
        aria-label="Link address"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          // The press must end HERE: apply() hands focus to the editor, and the same Enter would then replace the selection.
          if (e.key === "Enter") {
            e.preventDefault();
            e.stopPropagation();
            apply();
          }
          if (e.key === "Escape") ui.closePanel();
        }}
        className="h-7 w-56 rounded-md border border-border bg-background px-2 text-base outline-none"
      />
      <button type="button" onClick={apply} className="h-7 rounded-md bg-primary px-2 type-secondary text-primary-foreground">
        Apply
      </button>
    </div>
  );
}

function ColorPanel({ editor, ui }: { editor: SpacesEditor; ui: SelectionToolbarUi }) {
  return (
    <div className="flex items-center gap-1 p-1" data-selection-panel="">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          title={c === "default" ? "Default" : c}
          aria-label={`Text colour ${c}`}
          onClick={() => {
            editor.focus();
            if (c === "default") editor.removeStyles({ textColor: "default" } as never);
            else editor.addStyles({ textColor: c } as never);
            ui.close();
          }}
          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
        >
          <span style={{ color: c === "default" ? undefined : `var(--bn-colors-highlights-${c}-text, ${c})` }} className="text-base font-semibold">
            A
          </span>
        </button>
      ))}
    </div>
  );
}

/** The zone's panels: Link's address field and the colour swatches, drawn inside the toolbar's frame. */
export function spacePanel(editor: SpacesEditor, panel: string, ui: SelectionToolbarUi): ReactNode | null {
  if (panel === LINK_PANEL) return <LinkPanel editor={editor} ui={ui} />;
  if (panel === COLOR_PANEL) return <ColorPanel editor={editor} ui={ui} />;
  return null;
}
