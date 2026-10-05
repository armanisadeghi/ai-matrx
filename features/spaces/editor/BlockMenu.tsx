"use client";

// features/spaces/editor/BlockMenu.tsx — the ⋮⋮ block menu (B9): Ask AI, Delete, Duplicate, Turn into,
// Copy link to block, Move to, Color. Rendered inside BlockNote's drag-handle menu so dragging and the
// menu share one handle, exactly as in Notion.

import { SideMenuExtension } from "@blocknote/core/extensions";
import { BlockColorsItem, useBlockNoteEditor, useComponentsContext, useExtensionState, usePortalElement } from "@blocknote/react";
import {
  ArrowRightLeft,
  ChevronRight,
  Code,
  Copy,
  CornerUpRight,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  Link,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Palette,
  Quote,
  Trash2,
  Type,
} from "lucide-react";

import { AGENT_ICON } from "@/components/icons/domain-icons";
import { toast } from "@/lib/toast";

import type { SpacesEditor } from "./schema";
import { duplicateBlocks, selectedOrCurrent } from "./block-actions";

const I = 16;

export const TURN_INTO: Array<{ label: string; icon: React.ReactNode; type: string; props?: Record<string, unknown> }> = [
  { label: "Text", icon: <Type size={I} />, type: "paragraph" },
  { label: "Heading 1", icon: <Heading1 size={I} />, type: "heading", props: { level: 1, isToggleable: false } },
  { label: "Heading 2", icon: <Heading2 size={I} />, type: "heading", props: { level: 2, isToggleable: false } },
  { label: "Heading 3", icon: <Heading3 size={I} />, type: "heading", props: { level: 3, isToggleable: false } },
  { label: "Bulleted list", icon: <List size={I} />, type: "bulletListItem" },
  { label: "Numbered list", icon: <ListOrdered size={I} />, type: "numberedListItem" },
  { label: "To-do list", icon: <ListChecks size={I} />, type: "checkListItem" },
  { label: "Toggle list", icon: <ListTree size={I} />, type: "toggleListItem" },
  { label: "Code", icon: <Code size={I} />, type: "codeBlock" },
  { label: "Quote", icon: <Quote size={I} />, type: "quote" },
  { label: "Callout", icon: <Lightbulb size={I} />, type: "callout" },
];

export interface BlockMenuActions {
  spaceId: string;
  moveBlocksTo: (blockIds: string[]) => void;
  askAi: () => void;
}

export function makeBlockMenu(actions: BlockMenuActions) {
  return function BlockMenu() {
    const C = useComponentsContext()!;
    const editor = useBlockNoteEditor() as unknown as SpacesEditor;
    const portal = usePortalElement();
    const block = useExtensionState(SideMenuExtension, { editor, selector: (s) => s?.block });
    if (!block) return null;
    const targets = () => selectedOrCurrent(editor, block.id);
    const hasText = Array.isArray(block.content);
    return (
      <C.Generic.Menu.Dropdown className="bn-menu-dropdown bn-drag-handle-menu spaces-block-menu">
        <C.Generic.Menu.Item className="bn-menu-item" icon={<AGENT_ICON size={I} />} onClick={actions.askAi}>
          Ask AI
        </C.Generic.Menu.Item>
        <C.Generic.Menu.Divider />
        <C.Generic.Menu.Item className="bn-menu-item" icon={<Trash2 size={I} />} onClick={() => editor.removeBlocks(targets())}>
          Delete
        </C.Generic.Menu.Item>
        <C.Generic.Menu.Item className="bn-menu-item" icon={<Copy size={I} />} onClick={() => duplicateBlocks(editor, targets())}>
          Duplicate
        </C.Generic.Menu.Item>
        {hasText ? (
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
                  }}
                >
                  {item.label}
                </C.Generic.Menu.Item>
              ))}
            </C.Generic.Menu.Dropdown>
          </C.Generic.Menu.Root>
        ) : null}
        <C.Generic.Menu.Item
          className="bn-menu-item"
          icon={<Link size={I} />}
          onClick={() => {
            const url = `${window.location.origin}/spaces/${actions.spaceId}#block-${block.id}`;
            void navigator.clipboard.writeText(url).then(
              () => toast.success("Copied link to block"),
              () => toast.error("Could not copy the link"),
            );
          }}
        >
          Copy link to block
        </C.Generic.Menu.Item>
        <C.Generic.Menu.Item className="bn-menu-item" icon={<CornerUpRight size={I} />} onClick={() => actions.moveBlocksTo(targets())}>
          Move to
        </C.Generic.Menu.Item>
        <BlockColorsItem>
          <span className="spaces-menu-label">
            <Palette size={I} />
            Color
            <ChevronRight size={14} className="ml-auto opacity-60" />
          </span>
        </BlockColorsItem>
      </C.Generic.Menu.Dropdown>
    );
  };
}
