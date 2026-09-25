"use client";

// components/rich-editor/visual/BlockHandle.tsx
//
// Notion's block handle: hover any block, grab the grip to drag it anywhere,
// or click it for Move up / Move down / Turn into / Delete. A move is a
// splice-safe move — the block keeps its stored bytes, its islands keep
// theirs, and the save gate reads an island that travelled as moved, not lost.
// Fine pointers only; touch uses the same verbs from the keyboard and menus.

import { useEffect, useState, type RefObject } from "react";
import type { Editor } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ai-matrx/design-system";
import { ArrowDown, ArrowUp, GripVertical, Heading1, Heading2, List, ListOrdered, Pilcrow, Quote, Trash2 } from "lucide-react";
import { moveBlock, toggleTaskList } from "../core/commands";
import { useRichEditorContext } from "../RichEditorContext";

interface Target {
  pos: number;
  top: number;
  height: number;
}

/** The block under a vertical coordinate: a stored block's own child when it has several, else the top-level block. */
function blockAt(editor: Editor, clientX: number, clientY: number): { pos: number; dom: HTMLElement } | null {
  const view = editor.view;
  const found = view.posAtCoords({ left: clientX, top: clientY });
  if (!found) return null;
  const $pos = view.state.doc.resolve(Math.min(found.inside >= 0 ? found.inside : found.pos, view.state.doc.content.size));
  if ($pos.depth === 0 && found.inside < 0) return null;
  const top = $pos.depth >= 1 ? $pos.before(1) : found.inside;
  const topNode = view.state.doc.nodeAt(top);
  let pos = top;
  if (topNode?.type.name === "sourceBlock" && topNode.childCount > 1 && $pos.depth >= 2) pos = $pos.before(2);
  const dom = view.nodeDOM(pos);
  return dom instanceof HTMLElement ? { pos, dom } : null;
}

export function BlockHandle({ editor, container }: { editor: Editor | null; container: RefObject<HTMLDivElement | null> }) {
  const context = useRichEditorContext();
  const [target, setTarget] = useState<Target | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const host = container.current;
    if (!host || !editor || context.readOnly) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const onMove = (event: MouseEvent) => {
      if (menuOpen) return;
      const content = host.querySelector(".ProseMirror");
      if (!content) return;
      const bounds = content.getBoundingClientRect();
      const hit = blockAt(editor, Math.max(event.clientX, bounds.left + 24), event.clientY);
      if (!hit) return;
      const rect = hit.dom.getBoundingClientRect();
      const hostRect = host.getBoundingClientRect();
      setTarget({ pos: hit.pos, top: rect.top - hostRect.top + host.scrollTop, height: rect.height });
    };
    const onLeave = () => {
      if (!menuOpen) setTarget(null);
    };
    host.addEventListener("mousemove", onMove);
    host.addEventListener("mouseleave", onLeave);
    return () => {
      host.removeEventListener("mousemove", onMove);
      host.removeEventListener("mouseleave", onLeave);
    };
  }, [editor, container, menuOpen, context.readOnly]);

  if (!editor || !target || context.readOnly) return null;

  const select = () => {
    const node = editor.state.doc.nodeAt(target.pos);
    if (!node) return false;
    editor.view.dispatch(editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, target.pos)));
    return true;
  };

  const approveIslandsInside = () => {
    const node = editor.state.doc.nodeAt(target.pos);
    node?.descendants((child) => {
      if (child.type.name === "inlineIsland" || child.type.name === "islandBlock") context.approveIsland(String(child.attrs.raw));
      return true;
    });
    if (node?.type.name === "islandBlock") context.approveIsland(String(node.attrs.raw));
  };

  const turnInto = (run: () => void) => {
    const node = editor.state.doc.nodeAt(target.pos);
    if (node?.isTextblock || node?.type.name === "sourceBlock") {
      editor.commands.setTextSelection(target.pos + (node.isTextblock ? 1 : 2));
      run();
    }
  };

  return (
    <div
      className="absolute left-0 z-10 flex w-7 items-start justify-center"
      style={{ top: target.top, height: Math.min(target.height, 32) }}
    >
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            draggable
            aria-label="Drag to move, or click for block actions"
            title="Drag to move · click for actions"
            className="mt-1 flex h-6 w-5 cursor-grab items-center justify-center rounded text-muted-foreground/70 hover:bg-muted hover:text-foreground active:cursor-grabbing"
            onDragStart={(event) => {
              if (!select()) return;
              const slice = editor.state.selection.content();
              editor.view.dragging = { slice, move: true };
              const dom = editor.view.nodeDOM(target.pos);
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", editor.state.doc.textBetween(target.pos, target.pos + (editor.state.doc.nodeAt(target.pos)?.nodeSize ?? 0), "\n"));
              if (dom instanceof HTMLElement) event.dataTransfer.setDragImage(dom, 0, 0);
            }}
          >
            <GripVertical className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="left" className="w-52">
          <DropdownMenuItem onSelect={() => select() && moveBlock(editor, "up")}>
            <ArrowUp className="mr-2 h-4 w-4" /> Move up
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => select() && moveBlock(editor, "down")}>
            <ArrowDown className="mr-2 h-4 w-4" /> Move down
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => turnInto(() => editor.chain().focus().setParagraph().run())}>
            <Pilcrow className="mr-2 h-4 w-4" /> Turn into text
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => turnInto(() => editor.chain().focus().setHeading({ level: 1 }).run())}>
            <Heading1 className="mr-2 h-4 w-4" /> Turn into heading 1
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => turnInto(() => editor.chain().focus().setHeading({ level: 2 }).run())}>
            <Heading2 className="mr-2 h-4 w-4" /> Turn into heading 2
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => turnInto(() => editor.chain().focus().toggleBulletList().run())}>
            <List className="mr-2 h-4 w-4" /> Turn into bulleted list
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => turnInto(() => editor.chain().focus().toggleOrderedList().run())}>
            <ListOrdered className="mr-2 h-4 w-4" /> Turn into numbered list
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => turnInto(() => toggleTaskList(editor))}>
            <List className="mr-2 h-4 w-4" /> Turn into checklist
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => turnInto(() => editor.chain().focus().toggleBlockquote().run())}>
            <Quote className="mr-2 h-4 w-4" /> Turn into quote
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => {
              approveIslandsInside();
              if (select()) editor.commands.deleteSelection();
              setTarget(null);
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Delete block (Undo brings it back)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
