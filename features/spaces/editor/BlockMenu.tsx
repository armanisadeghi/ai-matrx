"use client";

// features/spaces/editor/BlockMenu.tsx — the ⋮⋮ block menu (B9): Ask AI, Delete, Duplicate, Turn into,
// Copy link to block, Move to, Color. Rendered inside BlockNote's drag-handle menu so dragging and the
// menu share one handle, exactly as in Notion.

import { SideMenuExtension } from "@blocknote/core/extensions";
import { BlockColorsItem, useBlockNoteEditor, useComponentsContext, useExtensionState, usePortalElement } from "@blocknote/react";
import {
  Database,
  ArrowRightLeft,
  Code,
  Copy,
  CornerUpRight,
  FileInput,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Lightbulb,
  Link,
  List,
  ListChecks,
  MessageSquare,
  ListOrdered,
  ListTree,
  Palette,
  Quote,
  Trash2,
  Type,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AGENT_ICON } from "@/components/icons/domain-icons";

import type { SpacesEditor } from "./schema";
import { duplicateBlocks, selectedOrCurrent } from "./block-actions";
import { copyToClipboard } from "@/lib/clipboard/copy";
import type { PickedSource } from "../data/SourcePicker";
import type { SimpleTable } from "../data/table-to-database";
import { newViewId } from "../data/sources";
import { fromEngine } from "./convert";
import { databaseBlock } from "./slash-items";

const I = 16;

export const TURN_INTO: Array<{ label: string; icon: React.ReactNode; type: string; props?: Record<string, unknown> }> = [
  { label: "Text", icon: <Type size={I} />, type: "paragraph" },
  { label: "Heading 1", icon: <Heading1 size={I} />, type: "heading", props: { level: 1, isToggleable: false } },
  { label: "Heading 2", icon: <Heading2 size={I} />, type: "heading", props: { level: 2, isToggleable: false } },
  { label: "Heading 3", icon: <Heading3 size={I} />, type: "heading", props: { level: 3, isToggleable: false } },
  { label: "Heading 4", icon: <Heading4 size={I} />, type: "heading", props: { level: 4, isToggleable: false } },
  { label: "Bulleted list", icon: <List size={I} />, type: "bulletListItem" },
  { label: "Numbered list", icon: <ListOrdered size={I} />, type: "numberedListItem" },
  { label: "To-do list", icon: <ListChecks size={I} />, type: "checkListItem" },
  { label: "Toggle list", icon: <ListTree size={I} />, type: "toggleListItem" },
  { label: "Code", icon: <Code size={I} />, type: "codeBlock" },
  { label: "Quote", icon: <Quote size={I} />, type: "quote" },
  { label: "Callout", icon: <Lightbulb size={I} />, type: "callout" },
];

/** Radix sub-menus stay open after an item that re-renders the block; Escape closes the whole stack. */
function closeMenus() {
  // Escape on each open dropdown, innermost first (the focused element may sit outside the menu).
  window.setTimeout(() => {
    for (const el of [...document.querySelectorAll(".bn-menu-dropdown")].reverse()) {
      el.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    }
  }, 0);
}

export interface BlockMenuActions {
  spaceId: string;
  moveBlocksTo: (blockIds: string[]) => void;
  /** "Turn into page in": the blocks become a new page inside the page the person picks. */
  turnIntoPageIn: (blockIds: string[]) => void;
  askAi: () => void;
  /** H1 — a comment on the block (its own text is the quote). */
  comment: (blockId: string) => void;
  /** C14 — a simple table becomes a new database of this page (its rows become records). */
  tableToDatabase?: (table: SimpleTable) => Promise<PickedSource | null>;
}

/** The cells of a simple table block as plain text, and whether its first row is a header. */
function simpleTableOf(block: unknown): SimpleTable {
  const stored = fromEngine([block as never])[0];
  const props = (stored?.props ?? {}) as { headerRow?: boolean; rows?: Array<{ cells: Array<Array<{ text: string }>> }> };
  return { headerRow: !!props.headerRow, rows: (props.rows ?? []).map((r) => r.cells.map((spans) => spans.map((s) => s.text).join(""))) };
}

export function makeBlockMenu(actions: BlockMenuActions) {
  return function BlockMenu() {
    const C = useComponentsContext()!;
    const editor = useBlockNoteEditor() as unknown as SpacesEditor;
    const portal = usePortalElement();
    const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
    const [query, setQuery] = useState("");
    // D5: when the menu closes and nothing else took focus (Radix leaves it on the page), the caret goes
    // back to the end of the block, so typing — "/" above all — carries on in the page.
    const blockId = block?.id;
    useEffect(() => {
      if (!blockId) return;
      return () => {
        window.setTimeout(() => {
          const active = document.activeElement;
          const lost = !active || active === document.body || !!active.closest(".bn-side-menu") || !active.closest(".bn-editor, input, textarea, [contenteditable=true], [role=dialog], [role=menu]");
          const target = editor.getBlock(blockId);
          // A block with no text (divider, database, chart) takes no caret: nothing is focused for it.
          if (!lost || document.querySelector(".bn-menu-dropdown, [role='dialog']") || !target || !Array.isArray(target.content)) return;
          editor.focus();
          editor.setTextCursorPosition(blockId, "end");
        }, 0);
      };
    }, [blockId, editor]);
    // A colour picked in the Color sub-menu closes the whole menu (Notion).
    useEffect(() => {
      if (!blockId) return;
      const onClick = (e: MouseEvent) => {
        const item = e.target instanceof Element ? e.target.closest(".bn-menu-dropdown [role=menuitem], .bn-menu-dropdown [role=menuitemcheckbox], .bn-menu-dropdown .bn-menu-item") : null;
        if (item?.querySelector(".bn-color-icon")) closeMenus();
      };
      document.addEventListener("click", onClick);
      return () => document.removeEventListener("click", onClick);
    }, [blockId]);
    if (!block) return null;
    const targets = () => selectedOrCurrent(editor, block.id);
    const hasText = Array.isArray(block.content);
    // B9 "Search actions": the menu narrows to the actions (and Turn into targets) whose name matches.
    const q = query.trim().toLowerCase();
    const shows = (label: string) => !q || label.toLowerCase().includes(q);
    const turnMatches = q ? TURN_INTO.filter((t) => shows(t.label) || shows("turn into")) : TURN_INTO;
    const none = q && !["Ask AI", "Delete", "Duplicate", "Turn into", "Turn into page in", "Copy link to block", "Move to", "Comment", "Color"].some(shows) && !turnMatches.length;
    return (
      <C.Generic.Menu.Dropdown className="bn-menu-dropdown bn-drag-handle-menu spaces-block-menu">
        <div className="spaces-block-menu-search" onKeyDown={(e) => e.key !== "Escape" && e.key !== "ArrowDown" && e.stopPropagation()}>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search actions…"
            aria-label="Search actions"
          />
        </div>
        {none ? <p className="spaces-block-menu-empty">No results</p> : null}
        {shows("Ask AI") ? (
          <C.Generic.Menu.Item className="bn-menu-item" icon={<AGENT_ICON size={I} />} onClick={actions.askAi}>
            Ask AI
          </C.Generic.Menu.Item>
        ) : null}
        {!q ? <C.Generic.Menu.Divider /> : null}
        {shows("Delete") ? (
          <C.Generic.Menu.Item className="bn-menu-item" icon={<Trash2 size={I} />} onClick={() => editor.removeBlocks(targets())}>
            Delete
          </C.Generic.Menu.Item>
        ) : null}
        {shows("Duplicate") ? (
          <C.Generic.Menu.Item className="bn-menu-item" icon={<Copy size={I} />} onClick={() => duplicateBlocks(editor, targets())}>
            Duplicate
          </C.Generic.Menu.Item>
        ) : null}
        {hasText && q && turnMatches.length && !shows("turn into")
          ? turnMatches.map((item) => (
              <C.Generic.Menu.Item
                key={item.label}
                className="bn-menu-item"
                icon={item.icon}
                onClick={() => {
                  editor.transact(() => {
                    for (const id of targets()) editor.updateBlock(id, { type: item.type, props: item.props } as never);
                  });
                  closeMenus();
                }}
              >
                Turn into {item.label}
              </C.Generic.Menu.Item>
            ))
          : null}
        {hasText && (!q || shows("turn into")) ? (
          <C.Generic.Menu.Root position="right" sub portalElement={portal}>
            <C.Generic.Menu.Trigger sub>
              <C.Generic.Menu.Item className="bn-menu-item" subTrigger icon={<ArrowRightLeft size={I} />}>
                Turn into
              </C.Generic.Menu.Item>
            </C.Generic.Menu.Trigger>
            <C.Generic.Menu.Dropdown sub className="bn-menu-dropdown">
              {TURN_INTO.map((item) => (
                <C.Generic.Menu.Item
                  key={item.label}
                  className="bn-menu-item"
                  icon={item.icon}
                  checked={block.type === item.type && (item.type !== "heading" || block.props.level === item.props?.level)}
                  onClick={() => {
                    editor.transact(() => {
                      for (const id of targets()) editor.updateBlock(id, { type: item.type, props: item.props } as never);
                    });
                    closeMenus();
                  }}
                >
                  {item.label}
                </C.Generic.Menu.Item>
              ))}
            </C.Generic.Menu.Dropdown>
          </C.Generic.Menu.Root>
        ) : null}
        {shows("Turn into page in") ? (
          <C.Generic.Menu.Item
            className="bn-menu-item"
            icon={<FileInput size={I} />}
            onClick={() => {
              closeMenus();
              actions.turnIntoPageIn(targets());
            }}
          >
            Turn into page in
          </C.Generic.Menu.Item>
        ) : null}
        {shows("Copy link to block") ? (
        <C.Generic.Menu.Item
          className="bn-menu-item"
          icon={<Link size={I} />}
          onClick={() => {
            const url = `${window.location.origin}/spaces/${actions.spaceId}#block-${block.id}`;
            void copyToClipboard(url, "Copied link to block").then((ok) => {
              if (ok) closeMenus();
            });
          }}
        >
          Copy link to block
        </C.Generic.Menu.Item>
        ) : null}
        {block.type === "table" && actions.tableToDatabase && shows("Turn into database") ? (
          <C.Generic.Menu.Item
            className="bn-menu-item"
            icon={<Database size={I} />}
            onClick={() => {
              closeMenus();
              const id = block.id;
              const table = simpleTableOf(editor.getBlock(id));
              void actions.tableToDatabase!(table).then((src) => {
                if (!src || !editor.getBlock(id)) return;
                editor.replaceBlocks([id], [databaseBlock(src, { id: newViewId(), name: "Table", layout: "grid" }, false)]);
              });
            }}
          >
            Turn into database
          </C.Generic.Menu.Item>
        ) : null}
        {shows("Move to") ? (
          <C.Generic.Menu.Item className="bn-menu-item" icon={<CornerUpRight size={I} />} onClick={() => {
              closeMenus();
              actions.moveBlocksTo(targets());
            }}>
            Move to
          </C.Generic.Menu.Item>
        ) : null}
        {shows("Comment") ? (
          <C.Generic.Menu.Item
            className="bn-menu-item"
            icon={<MessageSquare size={I} />}
            onClick={() => {
              closeMenus();
              actions.comment(block.id);
            }}
          >
            Comment
          </C.Generic.Menu.Item>
        ) : null}
        {shows("Color") ? (
          <BlockColorsItem>
            <span className="spaces-menu-label">
              <Palette size={I} />
              Color
            </span>
          </BlockColorsItem>
        ) : null}
      </C.Generic.Menu.Dropdown>
    );
  };
}
