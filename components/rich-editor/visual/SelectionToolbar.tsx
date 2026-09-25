"use client";

// components/rich-editor/visual/SelectionToolbar.tsx
//
// The floating toolbar over a text selection (Notion / Medium / Google Docs):
// bold, italic, strikethrough, code, link, heading, quote, list — and "make
// variable" for prompt surfaces. Every button is the same verb its keyboard
// shortcut runs.

import type { Editor } from "@tiptap/core";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { Bold, Braces, Code, Heading1, Heading2, Italic, Link2, List, Quote, Strikethrough, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { insertVariable } from "../core/commands";
import { toVariableName } from "../core/variables";

interface ToolButton {
  id: string;
  label: string;
  icon: LucideIcon;
  active: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

export function SelectionToolbar({
  editor,
  onEditLink,
  offerVariables,
}: {
  editor: Editor;
  onEditLink: () => void;
  offerVariables: boolean;
}) {
  const buttons: ToolButton[] = [
    { id: "bold", label: "Bold (⌘B)", icon: Bold, active: (e) => e.isActive("bold"), run: (e) => e.chain().focus().toggleBold().run() },
    { id: "italic", label: "Italic (⌘I)", icon: Italic, active: (e) => e.isActive("italic"), run: (e) => e.chain().focus().toggleItalic().run() },
    { id: "strike", label: "Strikethrough (⌘⇧S)", icon: Strikethrough, active: (e) => e.isActive("strike"), run: (e) => e.chain().focus().toggleStrike().run() },
    { id: "code", label: "Inline code (⌘E)", icon: Code, active: (e) => e.isActive("code"), run: (e) => e.chain().focus().toggleCode().run() },
    { id: "link", label: "Link (⌘K)", icon: Link2, active: (e) => e.isActive("link"), run: () => onEditLink() },
    { id: "h1", label: "Heading 1", icon: Heading1, active: (e) => e.isActive("heading", { level: 1 }), run: (e) => e.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: "h2", label: "Heading 2", icon: Heading2, active: (e) => e.isActive("heading", { level: 2 }), run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: "quote", label: "Quote", icon: Quote, active: (e) => e.isActive("blockquote"), run: (e) => e.chain().focus().toggleBlockquote().run() },
    { id: "list", label: "Bulleted list", icon: List, active: (e) => e.isActive("bulletList"), run: (e) => e.chain().focus().toggleBulletList().run() },
  ];
  if (offerVariables) {
    buttons.push({
      id: "variable",
      label: "Turn into a {{variable}}",
      icon: Braces,
      active: () => false,
      run: (e) => {
        const { from, to } = e.state.selection;
        const name = toVariableName(e.state.doc.textBetween(from, to, " "));
        if (name) insertVariable(e, name);
      },
    });
  }

  return (
    <BubbleMenu
      editor={editor}
      options={{ placement: "top", offset: 8 }}
      shouldShow={({ editor: current, state }) => {
        const { selection } = state;
        if (selection.empty || selection instanceof NodeSelection || !current.isEditable) return false;
        return state.doc.textBetween(selection.from, selection.to).trim().length > 0;
      }}
      className="z-40 flex items-center gap-0.5 rounded-lg border border-border bg-popover p-0.5 shadow-lg"
    >
      {buttons.map((button) => {
        const Icon = button.icon;
        const active = button.active(editor);
        return (
          <button
            key={button.id}
            type="button"
            title={button.label}
            aria-label={button.label}
            aria-pressed={active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => button.run(editor)}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
              active && "bg-primary/10 text-primary",
            )}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </BubbleMenu>
  );
}
