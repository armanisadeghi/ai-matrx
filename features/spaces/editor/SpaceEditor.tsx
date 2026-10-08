"use client";

// features/spaces/editor/SpaceEditor.tsx — the block editor of one Space (§B, §C).
//
// BlockNote (MPL-2.0) with our schema, Notion's "/" menu, the ⋮⋮ handle + block menu, the selection
// toolbar, and Notion's extra shortcuts. Content goes out through `onChange` already converted to
// SpaceBlock — the engine never reaches the store.

import { createExtension } from "@blocknote/core";
import { CollaborationExtension } from "@blocknote/core/yjs";
import { en } from "@blocknote/core/locales";
import {
  AddBlockButton,
  DragHandleButton,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useState } from "react";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";

import { AGENT_ICON } from "@/components/icons/domain-icons";
import { mentionCandidates } from "@/features/rich-document/annotations/service";
import { outsideAriaMarksPlugin } from "./aria-hidden-marks";
import { applyMarkdownKey } from "./markdown-keys";
import { openMissedSlash } from "./slash-guard";
import { CalendarDays } from "lucide-react";
import { PASSAGE_ACTIONS_HOST_KEY } from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import { useSelectionZone } from "@ai-matrx/rich-content/selection-toolbar/selection-zones";

import { spaceCommentSource } from "../collab/comments";
import { PersonAvatar } from "../collab/CommentsPanel";

import type { SpaceBlock } from "../contract";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces } from "../state/SpacesProvider";
import { enterIntoOpenToggle } from "./toggle-enter";
import { INSTANT_CLOSE, SLASH_MENU } from "./floating";
import { makeBlockMenu, type BlockMenuActions } from "./BlockMenu";
import { currentBlockId, duplicateBlocks, selectedOrCurrent } from "./block-actions";
import { fromEngine, toEngine, type EngineBlock } from "./convert";
import { PasteUrlMenu, pastedAnchor, pastedUrl, type PastedUrl } from "./PasteUrlMenu";
import { spacePanel, spaceSelectionActions } from "./selection-format";
import { SYNCED_CLIP } from "./synced-block";
import { SuggestionCard, suggestMode } from "./suggest";
import { useRubberBand } from "./rubber-band";
import { CalloutIconHost } from "./callout-block";
import { dateChoices } from "./date-mention";
import { spacesSchema, type SpacesEditor } from "./schema";
import { insideDatabaseBlock } from "./database-host";
import { linkPageAt, slashItems, type SlashContext } from "./slash-items";
import { rankSlashItems } from "./slash-rank";
import { planColumnHeal, type HealBlock } from "./column-heal";
import { columnDropper } from "./column-drop";
import { usePersonTimeZone } from "@/hooks/usePersonTimeZone";

const PLACEHOLDERS = {
  ...en.placeholders,
  default: "Write, press '/' for commands…",
  emptyDocument: "Write, press '/' for commands…",
  heading: undefined,
  toggleListItem: "Toggle",
  bulletListItem: "List",
  numberedListItem: "List",
  checkListItem: "To-do",
};

/** Notion keys BlockNote does not ship: Cmd+D duplicate, `>` toggle, `"` quote (Cmd+Opt+4…8: see NOTION_TURN_INTO). */
/** A modal's `aria-hidden` marks on the page's blocks are never edits (aria-hidden-marks.ts). */
const outsideAriaMarks = createExtension({ key: "spacesOutsideAriaMarks", prosemirrorPlugins: [outsideAriaMarksPlugin()] });

const notionKeys = createExtension(({ editor }: { editor: SpacesEditor }) => {
  return {
    key: "spacesNotionKeys",
    keyboardShortcuts: {
      "Mod-d": () => {
        const id = currentBlockId(editor);
        if (!id || !editor.isEditable) return false;
        duplicateBlocks(editor, selectedOrCurrent(editor, id));
        return true;
      },
    },
    inputRules: [
      { find: /^>\s$/, replace: () => ({ type: "toggleListItem", props: {} }) },
      { find: /^"\s$/, replace: () => ({ type: "quote", props: {} }) },
    ],
  };
});

/** Cmd+Opt+4…8 in Notion; BlockNote binds 4–6 to headings 4–6, so these run before its keymap. */
const NOTION_TURN_INTO: Record<string, { type: string; props?: Record<string, unknown> }> = {
  Digit4: { type: "checkListItem" },
  Digit5: { type: "bulletListItem" },
  Digit6: { type: "numberedListItem" },
  Digit7: { type: "toggleListItem" },
  Digit8: { type: "codeBlock" },
};

function turnIntoKey(editor: SpacesEditor, e: React.KeyboardEvent) {
  if (!(e.metaKey || e.ctrlKey) || !e.altKey || e.shiftKey) return;
  const code = e.code || `Digit${e.key}`;
  const target = NOTION_TURN_INTO[code];
  const id = currentBlockId(editor);
  if (!target || !id || !editor.isEditable) return;
  e.preventDefault();
  e.stopPropagation();
  editor.transact(() => {
    for (const b of selectedOrCurrent(editor, id)) editor.updateBlock(b, { type: target.type, props: target.props } as never);
  });
}

function flashBlock(id: string) {
  let el = document.getElementById("spaces-block-flash") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "spaces-block-flash";
    document.head.appendChild(el);
  }
  el.textContent = `.spaces-editor .bn-block-outer[data-id="${CSS.escape(id)}"] > .bn-block{animation:spaces-flash 1.6s ease-out;border-radius:4px}`;
  window.setTimeout(() => {
    if (el) el.textContent = "";
  }, 1700);
}

export function useDarkMode(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const root = document.documentElement;
    const read = () => setDark(root.classList.contains("dark"));
    read();
    const obs = new MutationObserver(read);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

export interface SpaceEditorProps {
  spaceId: string;
  initialBlocks: SpaceBlock[];
  editable: boolean;
  onChange: (blocks: SpaceBlock[]) => void;
  slash: SlashContext;
  menu: Omit<BlockMenuActions, "spaceId" | "comment">;
  /** H1 — start a comment on a block, about `quote` (the selection, or the block's text). */
  onComment?: (anchor: { blockId: string; quote: string }) => void;
  /** Lets the page reach the editor (title Enter → first block, Move to). */
  onReady?: (editor: SpacesEditor) => void;
  /**
   * H3 live co-editing: the body is the room's shared Yjs fragment (`initialBlocks` is then unused — the
   * fragment already holds the page) and other members' cursors draw in their colours.
   */
  collab?: { fragment: Y.XmlFragment; provider: { awareness: Awareness }; user: { name: string; color: string } };
}

/**
 * A column's flex-grow: its width fraction scaled up. Equal ratios in a row; scaled so a wrapped row of
 * a nested column list (spaces.css, D3) still fills its line — flex hands out only the grow sum's share
 * of free space when the sum is under 1.
 */
export function growOf(width: number): number {
  return Math.round(width * 1000 * 1000) / 1000;
}

/** An id inside a quoted attribute selector: only the quote and backslash need escaping (same on the server). */
const attrValue = (id: string) => id.replace(/["\\]/g, "\\$&");

/** Column widths as CSS keyed by block id (the flex items are BlockNote's own outer elements). */
export function columnCss(blocks: EngineBlock[]): string {
  const rules: string[] = [];
  const walk = (list: EngineBlock[]) => {
    for (const b of list) {
      if (b.type === "column") rules.push(`.spaces-editor .bn-block-outer[data-id="${attrValue(b.id)}"]{flex-grow:${growOf(Number(b.props?.width ?? 0.5))} !important}`);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return rules.join("\n");
}

export function SpaceEditor({ spaceId, initialBlocks, editable, onChange, slash, menu, onReady, onComment, collab }: SpaceEditorProps) {
  const dark = useDarkMode();
  const { store } = useSpaces();
  // "@today" / "@tomorrow" are the person's own days (their saved time zone), never the device's.
  const zone = usePersonTimeZone();
  const [pasted, setPasted] = useState<PastedUrl | null>(null);
  // H3: with a room, BlockNote's own Yjs binding drives the body (sync, cursors, Yjs undo) — exactly what
  // @blocknote/core/yjs `withCollaboration` adds: the extension, ProseMirror history off, and its fixed-id
  // placeholder first block (the fragment's content replaces it).
  // C16: a block dropped on another's left / right edge makes columns (a vertical guide, not a line).
  const [columnDrop] = useState(columnDropper);
  const room = collab
    ? CollaborationExtension({ fragment: collab.fragment, provider: collab.provider, user: collab.user, showCursorLabels: "activity" })
    : null;
  const editor = useCreateBlockNote(
    {
      // B12: a lone URL goes in as a link and the Link / Mention / Bookmark / Embed choice opens beside
      // it; anything else (Markdown, HTML, blocks) takes BlockNote's own conversion.
      pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
        // C18: "Copy and sync" put a synced block on the clipboard — paste a linked copy of it.
        const clip = event.clipboardData?.getData("text/plain")?.trim().match(SYNCED_CLIP);
        if (clip) {
          const at = ed.getTextCursorPosition().block;
          const block = { type: "synced", props: { data: JSON.stringify({ props: { sourceId: clip[1] } }) } } as never;
          const empty = Array.isArray(at.content) && at.content.length === 0;
          if (empty) ed.replaceBlocks([at], [block]);
          else ed.insertBlocks([block], at, "after");
          return true;
        }
        const url = pastedUrl(event);
        const where = ed.getTextCursorPosition().block;
        if (!url || where.type === "codeBlock") return defaultPasteHandler();
        ed.insertInlineContent([{ type: "link", href: url, content: url }] as never);
        const block = ed.getTextCursorPosition().block;
        const content = (Array.isArray(block.content) ? block.content : []) as Array<{ type: string; text?: string }>;
        const alone = content.length === 1 && content[0].type === "link";
        setPasted({ url, blockId: block.id, alone, at: pastedAnchor() });
        return true;
      },
      tables: { headers: true, splitCells: false, cellBackgroundColor: true, cellTextColor: true },
      schema: spacesSchema,
      initialContent: room ? ([{ type: "paragraph", id: "initialBlockId" }] as never) : initialBlocks.length ? (toEngine(initialBlocks) as never) : undefined,
      disableExtensions: room ? ["history"] : undefined,
      // Notion names the no-colour choice "Default" (a callout on Default draws a bordered box).
      dictionary: { ...en, placeholders: PLACEHOLDERS, color_picker: { ...en.color_picker, colors: { ...en.color_picker.colors, default: "Default" } } },
      extensions: room ? [notionKeys(), suggestMode(), outsideAriaMarks(), room] : [notionKeys(), suggestMode(), outsideAriaMarks()],
      tabBehavior: "prefer-indent",
      dropCursor: { color: "rgba(35, 131, 226, 0.43)", width: 4, hooks: columnDrop.hooks },
      // Notion keeps no empty line after the last block; the page end (SpacePage) adds one on click.
      trailingBlock: false,
    },
    [spaceId],
  ) as unknown as SpacesEditor;
  const commentOnBlock = (blockId: string) => {
    const b = editor.getBlock(blockId) as unknown as EngineBlock | undefined;
    const quote = b ? fromEngine([b]).map((x) => (x.text ?? []).map((t) => t.text).join("")).join(" ") : "";
    onComment?.({ blockId, quote });
  };
  const commentOnSelection = () => {
    const blocks = editor.getSelection()?.blocks ?? [editor.getTextCursorPosition().block];
    const first = blocks[0];
    if (!first) return;
    const quote = editor.getSelectedText().split("\n")[0] ?? "";
    if (quote.trim()) onComment?.({ blockId: first.id, quote });
    else commentOnBlock(first.id);
  };
  const [BlockMenu] = useState(() => makeBlockMenu({ spaceId, ...menu, comment: (id) => commentOnBlock(id) }));
  useEffect(() => columnDrop.attach(), [columnDrop]);
  // The first paint already has the stored column widths (with a room the editor holds only its placeholder
  // until the first sync, and the columns drew 50/50 then jumped: the page's largest layout shift).
  const [widths, setWidths] = useState(() => columnCss((room ? toEngine(initialBlocks) : editor.document) as unknown as EngineBlock[]));
  // With a room the body arrives through the Yjs binding (the first sync, a peer's edit), which
  // BlockNoteView's onChange never reports — so a page opened in a room drew its columns 50/50. The
  // editor's own change feed, remote updates included, keeps the widths current.
  useEffect(() => {
    const read = () => setWidths(columnCss(editor.document as unknown as EngineBlock[]));
    const raf = requestAnimationFrame(read);
    const off = editor.onChange(read, true);
    return () => {
      cancelAnimationFrame(raf);
      off();
    };
  }, [editor]);

  useEffect(() => {
    onReady?.(editor);
  }, [editor, onReady]);

  useRubberBand(editor, editable);

  // THE ONE SELECTION TOOLBAR (components/selection-toolbar) serves this editor: Copy first (the common pair),
  // then these registered actions — the inline styles, Ask AI and Comment. BlockNote's own formatting bubble is
  // gone (two bubbles over one selection); the toolbar's mode table decides what shows while editing.
  const [zoneElement, setZoneElement] = useState<HTMLElement | null>(null);
  const passageActions = spaceSelectionActions({ editor, editable, hasComment: Boolean(onComment), askAi: menu.askAi, comment: () => commentOnSelection() });
  useSelectionZone(zoneElement, {
    editable,
    host: { [PASSAGE_ACTIONS_HOST_KEY]: passageActions },
    renderPanel: (panel, ui) => spacePanel(editor, panel, ui),
  });

  // Deep link to a block (#block-<id>): scroll to it and flash it (E2). Polls until the block renders.
  useEffect(() => {
    let timer = 0;
    const go = (tries: number) => {
      const hash = window.location.hash;
      if (!hash.startsWith("#block-")) return;
      const el = document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(hash.slice("#block-".length))}"]`);
      if (!el) {
        if (tries > 0) timer = window.setTimeout(() => go(tries - 1), 100);
        return;
      }
      // Twice: the router's own hash scroll finds no element by that id and scrolls to the top.
      el.scrollIntoView({ block: "center" });
      window.setTimeout(() => el.scrollIntoView({ block: "center" }), 400);
      // The flash is a <style> rule, never a class on ProseMirror's DOM (its observer strips it).
      flashBlock(hash.slice("#block-".length));
    };
    go(100);
    const onHash = () => go(10);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", onHash);
    };
  }, [editor]);

  return (
    <div
      ref={setZoneElement}
      className="contents"
      data-space-selection-zone=""
      onKeyDownCapture={(e) => {
        // A KEY PRESSED IN A DATABASE BLOCK IS THE TABLE'S (stored-blocks `insideDatabaseBlock`): Enter,
        // Space and Escape there must never write into a toggle, open Ask AI or move the page's caret.
        if (insideDatabaseBlock(e.nativeEvent)) return;
        turnIntoKey(editor, e);
        // Notion's Markdown shortcuts BlockNote lacks: ``` (code block), " + space (quote).
        if ((e.key === "`" || e.key === " ") && !e.metaKey && !e.ctrlKey && !e.altKey && editable && !document.querySelector(".bn-suggestion-menu") && applyMarkdownKey(editor, e.key)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // "/" always opens the "/" menu: when BlockNote did not open it on this keypress, open it now.
        if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && editable) {
          window.requestAnimationFrame(() => openMissedSlash(editor));
        }
        // Enter at the end of an open toggle's title writes inside it (Notion); closed: a sibling.
        if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey && editable && !document.querySelector(".bn-suggestion-menu") && enterIntoOpenToggle(editor)) {
          e.preventDefault();
          e.stopPropagation();
        }
        // `[[` links a page, `[+` makes a sub-page (Notion B14 / N15): the "[" typed before goes, the picker opens.
        if ((e.key === "[" || e.key === "+") && !e.metaKey && !e.ctrlKey && !e.altKey && editable && !document.querySelector(".bn-suggestion-menu")) {
          const view = editor.prosemirrorView;
          const { from, to } = editor.prosemirrorState.selection;
          if (view && from === to && from > 0 && editor.prosemirrorState.doc.textBetween(from - 1, from) === "[") {
            e.preventDefault();
            e.stopPropagation();
            view.dispatch(view.state.tr.delete(from - 1, from));
            linkPageAt(editor, slash, currentBlockId(editor), e.key === "+");
          }
        }
        // M1 — Space on an empty line opens Ask AI (Notion); anywhere else it is a space.
        if (e.key === " " && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && editable && !document.querySelector(".bn-suggestion-menu")) {
          const { from, to } = editor.prosemirrorState.selection;
          const block = from === to ? editor.getTextCursorPosition().block : null;
          if (block && block.type === "paragraph" && Array.isArray(block.content) && block.content.length === 0) {
            e.preventDefault();
            e.stopPropagation();
            menu.askAi();
          }
        }
        // Escape with text selected drops the selection, so the selection toolbar goes with it
        // (it used to stay up with nothing selected). Menus that are open take Escape first.
        if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector(".bn-suggestion-menu, [role='menu']")) {
          const { from, to } = editor.prosemirrorState.selection;
          if (from !== to) editor.setTextCursorPosition(editor.getTextCursorPosition().block, "end");
        }
      }}
      onMouseUp={(e) => {
        // A click on an empty line (an empty column's first line above all) puts the caret on that line
        // (Notion). ProseMirror left it where it was when the press landed beside the line's text.
        if (!editable || e.button !== 0 || !(e.target instanceof Element) || insideDatabaseBlock(e.nativeEvent)) return;
        const content = e.target.closest(".bn-block-content");
        const id = content?.closest(".bn-block-outer[data-id]")?.getAttribute("data-id");
        if (!content || !id || !content.querySelector(".bn-inline-content") || !window.getSelection()?.isCollapsed) return;
        if (currentBlockId(editor) === id) return;
        editor.setTextCursorPosition(id, "end");
      }}
      onKeyDown={(e) => {
        // Tab / Shift+Tab the editor could not apply (top level, first child): stay in the editor, as
        // Notion does — never hand focus to the title or the next control.
        if (e.key === "Tab" && !e.defaultPrevented) e.preventDefault();
      }}
    >
    <style>{widths}</style>
    <CalloutIconHost editor={editor as never} />
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={dark ? "dark" : "light"}
      sideMenu={false}
      slashMenu={false}
      formattingToolbar={false}
      onChange={(_editor, context) => {
        // D5 — an emptied column leaves the layout at once (column-heal.ts); this person's edits only.
        const local = context?.getChanges().some((c) => c.source.type === "local") ?? false;
        if (local && editable && healColumns(editor)) return; // the heal's own change reports the page
        const doc = editor.document as unknown as EngineBlock[];
        setWidths(columnCss(doc));
        onChange(fromEngine(doc));
      }}
      className="spaces-editor"
    >
      <SuggestionMenuController
        triggerCharacter="@"
        floatingUIOptions={SLASH_MENU}
        getItems={async (query) => {
          // B14/C27 — "@" lists people (who can read this page: its organization's members and the people it
          // is shared with — cmt_mention_candidates) then pages. A person mention stores the user id.
          const q = query.trim().toLowerCase();
          const people = await mentionCandidates(spaceCommentSource(spaceId, ""), query.trim()).catch(() => []);
          const personItems = people.slice(0, 5).map((p) => ({
            title: p.name,
            group: "People",
            icon: <PersonAvatar name={p.name} url={p.avatarUrl} size={20} />,
            onItemClick: () =>
              editor.insertInlineContent([
                { type: "inlineMention", props: { span: JSON.stringify({ text: p.name, mention: { kind: "person", userId: p.userId } }) } },
                " ",
              ] as never),
          }));
          // Pages come from the server's search door (round 35: the sidebar never holds the whole tree).
          const hits = (
            await store.search(query.trim(), 9).catch((err: unknown) => {
              console.error("[spaces] page search for @ failed", err);
              return [];
            })
          ).filter((p) => p.id !== spaceId).slice(0, 8);
          // N2 — "@today", "@tomorrow", "@yesterday", "@oct 12": a date mention (Notion's Date group).
          const dateItems = dateChoices(query, new Date(), zone).map((c) => ({
            title: c.title,
            group: "Date",
            icon: <CalendarDays size={16} />,
            onItemClick: () =>
              editor.insertInlineContent([
                { type: "inlineMention", props: { span: JSON.stringify({ text: c.title, mention: { kind: "date", iso: c.iso } }) } },
                " ",
              ] as never),
          }));
          const pageItems = hits.map((p) => ({
            title: p.title || "Untitled",
            group: "Link to page",
            icon: <SpaceIcon media={p.icon} size={16} />,
            onItemClick: () =>
              editor.insertInlineContent([
                { type: "inlineMention", props: { span: JSON.stringify({ text: p.title || "Untitled", mention: { kind: "space", spaceId: p.id } }) } },
                " ",
              ] as never),
          }));
          // Typed words that make a date put Date first; an empty "@" lists it last (Notion).
          return q ? [...dateItems, ...personItems, ...pageItems] : [...personItems, ...pageItems, ...dateItems];
        }}
      />
      <SuggestionMenuController triggerCharacter="/" floatingUIOptions={SLASH_MENU} getItems={async (query) => rankSlashItems(slashItems(editor, slash), query)} />
      {editable ? (
      <SideMenuController
        floatingUIOptions={INSTANT_CLOSE}
        sideMenu={(props) => (
          <SideMenu {...props}>
            <AddBlockButton />
            {/* The block menu opens on a click (Notion), never on the press that starts a drag: the
                menu trigger opens on mousedown, so the press is kept from it and the click opens it. */}
            <span className="spaces-drag-handle" onPointerDownCapture={(e) => e.stopPropagation()} onMouseDownCapture={(e) => e.stopPropagation()}>
              <DragHandleButton {...props} dragHandleMenu={BlockMenu} />
            </span>
          </SideMenu>
        )}
      />
      ) : null}
    </BlockNoteView>
    {pasted ? <PasteUrlMenu editor={editor} pasted={pasted} onClose={() => setPasted(null)} /> : null}
    <SuggestionCard getView={() => editor.prosemirrorView ?? null} canResolve={editable} />
    </div>
  );
}

/** Apply column-heal.ts's plan to the live editor; true when it changed anything. */
function healColumns(editor: SpacesEditor): boolean {
  const ops = planColumnHeal(editor.document as unknown as HealBlock[]);
  if (!ops.length) return false;
  // The caret goes where a deleted block's caret goes: the end of the line above the row (Notion), else the
  // start of what the row melted into.
  let caret: { id: string; at: "start" | "end" } | null = null;
  editor.transact(() => {
    for (const op of ops) {
      if (!editor.getBlock(op.id)) continue;
      if (op.kind === "remove") editor.removeBlocks([op.id]);
      else if (op.kind === "width") editor.updateBlock(op.id, { props: { width: op.width } } as never);
      else {
        const above = editor.getPrevBlock(op.id);
        const placed = editor.replaceBlocks([op.id], (op.blocks.length ? op.blocks : [{ type: "paragraph" }]) as never);
        const first = placed.insertedBlocks[0]?.id;
        caret = above && Array.isArray(above.content) ? { id: above.id, at: "end" } : first ? { id: first, at: "start" } : caret;
      }
    }
  });
  if (caret) {
    try {
      editor.setTextCursorPosition((caret as { id: string }).id, (caret as { at: "start" | "end" }).at);
    } catch {
      // A block without text (a nested row, a database): the caret stays where the engine put it.
    }
  }
  return true;
}
