"use client";

// features/spaces/editor/tabs-block.tsx — Notion's Tabs block (N1).
//
// `tabs` draws the strip of named tabs; its children are `tab` blocks, each holding its own blocks as
// ordinary block children. Only the shown tab's blocks are drawn (a scoped <style>, never writes to
// ProseMirror's DOM). Click a tab to show it, double-click to rename, drag to reorder, "+" to add one.
// Which tab is shown is this reader's view, not page content: switching never writes a version.

import { createReactBlockSpec } from "@blocknote/react";
import { Plus } from "lucide-react";
import { useEffect, useReducer, useState } from "react";

import type { SpacesEditor } from "./schema";

interface TabLike {
  id: string;
  type: string;
  props: Record<string, unknown>;
  children: TabLike[];
}

/** The tab each tabs block shows, per block id — kept across node-view remounts (an edit inside a tab remounts it). */
const shownTab = new Map<string, string>();

const nameOf = (t: TabLike) => (typeof t.props?.name === "string" && t.props.name ? t.props.name : "Untitled");

function TabsStrip({ block: rendered, editor }: { block: TabLike; editor: SpacesEditor }) {
  // The node view is not re-rendered when only its children change (a rename, an added tab): read the
  // live block on every document change instead.
  const [, refresh] = useReducer((n: number) => n + 1, 0);
  useEffect(() => editor.onChange(() => refresh()), [editor]);
  const block = ((editor.getBlock(rendered.id) as unknown as TabLike | undefined) ?? rendered);
  const tabs = block.children.filter((c) => c.type === "tab");
  const [picked, setPickedState] = useState<string>(shownTab.get(block.id) ?? String(block.props.activeTab ?? ""));
  const setPicked = (id: string) => {
    shownTab.set(block.id, id);
    setPickedState(id);
  };
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const shown = tabs.find((t) => t.id === picked) ?? tabs[0];
  const editable = editor.isEditable;

  const rename = (tab: TabLike, name: string) => {
    setRenaming(null);
    const next = name.trim();
    if (next && next !== tab.props.name) editor.updateBlock(tab.id, { props: { name: next } } as never);
  };
  const add = () => {
    const last = tabs.at(-1);
    const made = { type: "tab", props: { name: `Tab ${tabs.length + 1}` }, children: [{ type: "paragraph" }] } as never;
    const [placed] = last ? editor.insertBlocks([made], last.id, "after") : (editor.updateBlock(block.id, { children: [made] } as never), [editor.getBlock(block.id)?.children[0]]);
    if (!placed) return;
    setPicked(placed.id);
    const line = placed.children?.[0];
    if (line) {
      try {
        editor.setTextCursorPosition(line.id, "start");
        editor.focus();
      } catch {
        // no text position in the new tab yet
      }
    }
  };
  const move = (dragId: string, overId: string) => {
    if (dragId === overId) return;
    const order = tabs.map((t) => t.id);
    const from = order.indexOf(dragId);
    const to = order.indexOf(overId);
    if (from < 0 || to < 0) return;
    // Move the dragged tab before / after the one it is dropped on, by the direction of travel.
    const target = editor.getBlock(overId);
    const dragged = editor.getBlock(dragId);
    if (!target || !dragged) return;
    editor.transact(() => {
      editor.removeBlocks([dragId]);
      editor.insertBlocks([dragged as never], overId, from < to ? "after" : "before");
    });
  };
  const fill = (tab: TabLike) => {
    const [line] = editor.updateBlock(tab.id, { children: [{ type: "paragraph" }] } as never).children ?? [];
    if (!line) return;
    try {
      editor.setTextCursorPosition(line.id, "start");
      editor.focus();
    } catch {
      // nothing to focus
    }
  };

  const hide = shown
    ? `.spaces-editor .bn-block-outer[data-id="${CSS.escape(block.id)}"] > .bn-block > .bn-block-group > .bn-block-outer:not([data-id="${CSS.escape(shown.id)}"]){display:none}`
    : "";
  return (
    <div className="spaces-tabs" contentEditable={false} data-tabs-id={block.id}>
      <style>{hide}</style>
      <div className="spaces-tabs-strip" role="tablist">
        {tabs.map((t) =>
          renaming === t.id ? (
            <input
              key={t.id}
              className="spaces-tabs-rename"
              defaultValue={nameOf(t) === "Untitled" ? "" : nameOf(t)}
              autoFocus
              aria-label="Tab name"
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") rename(t, e.currentTarget.value);
                if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={(e) => rename(t, e.currentTarget.value)}
            />
          ) : (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === shown?.id}
              className="spaces-tabs-tab"
              data-active={t.id === shown?.id ? "true" : undefined}
              data-tab-id={t.id}
              draggable={editable}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setPicked(t.id)}
              onDoubleClick={() => editable && setRenaming(t.id)}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData("application/x-spaces-tab", t.id);
                e.dataTransfer.effectAllowed = "move";
                setDragging(t.id);
              }}
              onDragOver={(e) => {
                if (!dragging) return;
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                const id = e.dataTransfer.getData("application/x-spaces-tab");
                if (!id) return;
                e.preventDefault();
                e.stopPropagation();
                setDragging(null);
                move(id, t.id);
              }}
              onDragEnd={() => setDragging(null)}
            >
              {nameOf(t)}
            </button>
          ),
        )}
        {editable ? (
          <button type="button" className="spaces-tabs-add" aria-label="Add tab" onMouseDown={(e) => e.stopPropagation()} onClick={add}>
            <Plus size={14} />
          </button>
        ) : null}
      </div>
      {shown && editable && shown.children.length === 0 ? (
        <button type="button" className="spaces-tabs-empty" onMouseDown={(e) => e.stopPropagation()} onClick={() => fill(shown)}>
          Empty tab
        </button>
      ) : null}
    </div>
  );
}

export const TabsBlock = createReactBlockSpec(
  { type: "tabs", propSchema: { activeTab: { default: "" } }, content: "none" },
  { render: ({ block, editor }) => <TabsStrip block={block as unknown as TabLike} editor={editor as unknown as SpacesEditor} /> },
);

export const TabBlock = createReactBlockSpec(
  { type: "tab", propSchema: { name: { default: "" } }, content: "none" },
  { render: () => <div className="spaces-tab" /> },
);
