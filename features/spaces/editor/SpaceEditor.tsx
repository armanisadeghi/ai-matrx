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
import { makeBlockMenu, type BlockMenuActions } from "./BlockMenu";
import { currentBlockId, duplicateBlocks, selectedOrCurrent } from "./block-actions";
import { fromEngine, toEngine, type EngineBlock } from "./convert";
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

/** Notion keys BlockNote does not ship: Cmd+D duplicate, Cmd+Opt+4…8 turn into, `>` toggle, `"` quote. */
const notionKeys = createExtension(({ editor }: { editor: SpacesEditor }) => {
  const turnInto = (type: string, props?: Record<string, unknown>) => () => {
    const id = currentBlockId(editor);
    if (!id || !editor.isEditable) return false;
    editor.transact(() => {
      for (const b of selectedOrCurrent(editor, id)) editor.updateBlock(b, { type, props } as never);
    });
    return true;
  };
  return {
    key: "spacesNotionKeys",
    keyboardShortcuts: {
      "Mod-d": () => {
        const id = currentBlockId(editor);
        if (!id || !editor.isEditable) return false;
        duplicateBlocks(editor, selectedOrCurrent(editor, id));
        return true;
      },
      "Mod-Alt-4": turnInto("checkListItem"),
      "Mod-Alt-5": turnInto("bulletListItem"),
      "Mod-Alt-6": turnInto("numberedListItem"),
      "Mod-Alt-7": turnInto("toggleListItem"),
      "Mod-Alt-8": turnInto("codeBlock"),
    },
    inputRules: [
      { find: /^>\s$/, replace: () => ({ type: "toggleListItem", props: {} }) },
      { find: /^"\s$/, replace: () => ({ type: "quote", props: {} }) },
    ],
  };
});

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
  const editor = useCreateBlockNote(
    {
      schema: spacesSchema,
      initialContent: initialBlocks.length ? (toEngine(initialBlocks) as never) : undefined,
      dictionary: { ...en, placeholders: PLACEHOLDERS },
      extensions: [notionKeys()],
      tabBehavior: "prefer-indent",
    },
    [spaceId],
  ) as unknown as SpacesEditor;
  const [BlockMenu] = useState(() => makeBlockMenu({ spaceId, ...menu }));
  const [widths, setWidths] = useState(() => columnCss(editor.document as unknown as EngineBlock[]));

  useEffect(() => {
    onReady?.(editor);
  }, [editor, onReady]);

  // Deep link to a block (#block-<id>): scroll to it and flash it (E2).
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#block-")) return;
    const id = hash.slice("#block-".length);
    const timer = window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${CSS.escape(id)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.classList.add("spaces-flash");
      window.setTimeout(() => el.classList.remove("spaces-flash"), 1600);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [editor]);

  return (
    <>
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
      <SuggestionMenuController triggerCharacter="/" getItems={async (query) => filterSuggestionItems(slashItems(editor, slash), query)} />
      <SideMenuController
        sideMenu={(props) => (
          <SideMenu {...props}>
            <AddBlockButton />
            <DragHandleButton {...props} dragHandleMenu={BlockMenu} />
          </SideMenu>
        )}
      />
      <FormattingToolbarController
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
    </BlockNoteView>
    </>
  );
}
