"use client";

// features/spaces/editor/SpaceEditor.tsx — the block editor of one Space (§B, §C).
//
// BlockNote (MPL-2.0) with our schema, Notion's "/" menu, the ⋮⋮ handle + block menu, the selection
// toolbar, and Notion's extra shortcuts. Content goes out through `onChange` already converted to
// SpaceBlock — the engine never reaches the store.

import { createExtension, filterSuggestionItems } from "@blocknote/core";
import { en } from "@blocknote/core/locales";
import {
  AddBlockButton,
  BasicTextStyleButton,
  BlockTypeSelect,
  ColorStyleButton,
  CreateLinkButton,
  DragHandleButton,
  FormattingToolbar,
  FormattingToolbarController,
  SideMenu,
  SideMenuController,
  SuggestionMenuController,
  useComponentsContext,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { useEffect, useState } from "react";

import { AGENT_ICON } from "@/components/icons/domain-icons";

import type { SpaceBlock } from "../contract";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces } from "../state/SpacesProvider";
import { INSTANT_CLOSE, SLASH_MENU } from "./floating";
import { makeBlockMenu, type BlockMenuActions } from "./BlockMenu";
import { currentBlockId, duplicateBlocks, selectedOrCurrent } from "./block-actions";
import { fromEngine, toEngine, type EngineBlock } from "./convert";
import { PasteUrlMenu, pastedUrl, type PastedUrl } from "./PasteUrlMenu";
import { useRubberBand } from "./rubber-band";
import { spacesSchema, type SpacesEditor } from "./schema";
import { slashItems, type SlashContext } from "./slash-items";

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

function useDarkMode(): boolean {
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

function AskAiButton({ onClick }: { onClick: () => void }) {
  const C = useComponentsContext()!;
  return (
    <C.FormattingToolbar.Button mainTooltip="Ask AI" icon={<AGENT_ICON size={16} />} onClick={onClick} label="Ask AI">
      Ask AI
    </C.FormattingToolbar.Button>
  );
}

export interface SpaceEditorProps {
  spaceId: string;
  initialBlocks: SpaceBlock[];
  editable: boolean;
  onChange: (blocks: SpaceBlock[]) => void;
  slash: SlashContext;
  menu: Omit<BlockMenuActions, "spaceId">;
  /** Lets the page reach the editor (title Enter → first block, Move to). */
  onReady?: (editor: SpacesEditor) => void;
}

/** Column widths as CSS keyed by block id (the flex items are BlockNote's own outer elements). */
function columnCss(blocks: EngineBlock[]): string {
  const rules: string[] = [];
  const walk = (list: EngineBlock[]) => {
    for (const b of list) {
      if (b.type === "column") rules.push(`.spaces-editor .bn-block-outer[data-id="${CSS.escape(b.id)}"]{flex-grow:${Number(b.props?.width ?? 0.5)} !important}`);
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return rules.join("\n");
}

export function SpaceEditor({ spaceId, initialBlocks, editable, onChange, slash, menu, onReady }: SpaceEditorProps) {
  const dark = useDarkMode();
  const { byId } = useSpaces();
  const [pasted, setPasted] = useState<PastedUrl | null>(null);
  const editor = useCreateBlockNote(
    {
      // B12: a lone URL goes in as a link and the Link / Mention / Bookmark / Embed choice opens beside
      // it; anything else (Markdown, HTML, blocks) takes BlockNote's own conversion.
      pasteHandler: ({ event, editor: ed, defaultPasteHandler }) => {
        const url = pastedUrl(event);
        const where = ed.getTextCursorPosition().block;
        if (!url || where.type === "codeBlock") return defaultPasteHandler();
        ed.insertInlineContent([{ type: "link", href: url, content: url }] as never);
        const block = ed.getTextCursorPosition().block;
        const content = (Array.isArray(block.content) ? block.content : []) as Array<{ type: string; text?: string }>;
        const alone = content.length === 1 && content[0].type === "link";
        const rect = window.getSelection()?.getRangeAt(0)?.getBoundingClientRect();
        setPasted({ url, blockId: block.id, alone, at: { left: rect?.left ?? 0, top: (rect?.bottom ?? 0) + 6 } });
        return true;
      },
      tables: { headers: true, splitCells: false, cellBackgroundColor: true, cellTextColor: true },
      schema: spacesSchema,
      initialContent: initialBlocks.length ? (toEngine(initialBlocks) as never) : undefined,
      dictionary: { ...en, placeholders: PLACEHOLDERS },
      extensions: [notionKeys()],
      tabBehavior: "prefer-indent",
      // Notion keeps no empty line after the last block; the page end (SpacePage) adds one on click.
      trailingBlock: false,
    },
    [spaceId],
  ) as unknown as SpacesEditor;
  const [BlockMenu] = useState(() => makeBlockMenu({ spaceId, ...menu }));
  const [widths, setWidths] = useState(() => columnCss(editor.document as unknown as EngineBlock[]));

  useEffect(() => {
    onReady?.(editor);
  }, [editor, onReady]);

  useRubberBand(editor, editable);

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
      className="contents"
      onKeyDownCapture={(e) => {
        turnIntoKey(editor, e);
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
      onKeyDown={(e) => {
        // Tab / Shift+Tab the editor could not apply (top level, first child): stay in the editor, as
        // Notion does — never hand focus to the title or the next control.
        if (e.key === "Tab" && !e.defaultPrevented) e.preventDefault();
      }}
    >
    <style>{widths}</style>
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={dark ? "dark" : "light"}
      sideMenu={false}
      slashMenu={false}
      formattingToolbar={false}
      onChange={() => {
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
          // B12 — "@" names a page: the mention is the page's address, shown as its current title.
          const q = query.trim().toLowerCase();
          const hits = [...byId.values()]
            .filter((p) => p.id !== spaceId && (p.title || "Untitled").toLowerCase().includes(q))
            .slice(0, 8);
          return hits.map((p) => ({
            title: p.title || "Untitled",
            icon: <SpaceIcon media={p.icon} size={16} />,
            onItemClick: () =>
              editor.insertInlineContent([
                { type: "inlineMention", props: { span: JSON.stringify({ text: p.title || "Untitled", mention: { kind: "space", spaceId: p.id } }) } },
                " ",
              ] as never),
          }));
        }}
      />
      <SuggestionMenuController triggerCharacter="/" floatingUIOptions={SLASH_MENU} getItems={async (query) => filterSuggestionItems(slashItems(editor, slash), query)} />
      {editable ? (
      <SideMenuController
        floatingUIOptions={INSTANT_CLOSE}
        sideMenu={(props) => (
          <SideMenu {...props}>
            <AddBlockButton />
            <DragHandleButton {...props} dragHandleMenu={BlockMenu} />
          </SideMenu>
        )}
      />
      ) : null}
      {editable ? (
      <FormattingToolbarController
        floatingUIOptions={INSTANT_CLOSE}
        formattingToolbar={() => (
          <FormattingToolbar>
            <AskAiButton onClick={menu.askAi} />
            <BlockTypeSelect key="blockTypeSelect" />
            <CreateLinkButton key="createLinkButton" />
            <BasicTextStyleButton basicTextStyle="bold" key="boldStyleButton" />
            <BasicTextStyleButton basicTextStyle="italic" key="italicStyleButton" />
            <BasicTextStyleButton basicTextStyle="underline" key="underlineStyleButton" />
            <BasicTextStyleButton basicTextStyle="strike" key="strikeStyleButton" />
            <BasicTextStyleButton basicTextStyle="code" key="codeStyleButton" />
            <ColorStyleButton key="colorStyleButton" />
          </FormattingToolbar>
        )}
      />
      ) : null}
    </BlockNoteView>
    {pasted ? <PasteUrlMenu editor={editor} pasted={pasted} onClose={() => setPasted(null)} /> : null}
    </div>
  );
}
