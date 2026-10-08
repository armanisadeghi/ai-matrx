"use client";

// features/spaces/editor/callout-block.tsx — the callout (C14), drawn WITH the text (round 29, item 1).
//
// A React block (createReactBlockSpec) draws through a portal a frame after the editor: the callout's
// text — its contentDOM — only joined the page once React mounted, so the box drew one line high and
// grew under text already shown (0.09–0.13 CLS on the sample at 1699). This spec builds its DOM itself,
// in the same pass as every other block: box, icon slot (a fixed 24px button) and the text. Only the
// glyph inside the slot is React (its own small root), and the slot never changes size when it lands.
// The icon picker opens from one React host beside the editor (`CalloutIconHost`), anchored on the slot.

import { createBlockSpec, defaultProps } from "@blocknote/core";
import { DynamicIcon } from "@ai-matrx/icons";
import { useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { SpaceMedia } from "../contract";
import { IconPicker } from "../page/IconPicker";
import { isEmojiText } from "../page/SpaceIcon";
import { SPACE_ICONS } from "../icons-registry";

const OPEN_PICKER = "spaces:callout-icon";

type OpenPicker = { blockId: string; icon: string; anchor: HTMLElement };

export function CalloutGlyph({ name }: { name: string }) {
  // An emoji a person chose is stored as the icon text itself (a Lucide name is plain letters).
  if (isEmojiText(name)) return <span role="img" aria-label="emoji" style={{ fontSize: 19, lineHeight: 1 }}>{name}</span>;
  const Icon = SPACE_ICONS[name];
  if (Icon) return <Icon size={20} strokeWidth={1.75} aria-hidden />;
  return <DynamicIcon name={name} size={20} fallbackIcon="FileText" />;
}

export const CalloutBlock = createBlockSpec(
  {
    type: "callout",
    propSchema: {
      textColor: defaultProps.textColor,
      backgroundColor: defaultProps.backgroundColor,
      icon: { default: "Lightbulb" },
    },
    content: "inline",
  },
  {
    render: (block, editor) => {
      const dom = document.createElement("div");
      dom.className = "spaces-callout";
      const icon = block.props.icon;
      dom.dataset.hasIcon = icon ? "true" : "false";
      if (Array.isArray(block.content) && block.content.length === 0) dom.dataset.empty = "true";
      let root: Root | null = null;
      if (icon) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "spaces-callout-icon";
        button.contentEditable = "false";
        button.setAttribute("aria-label", "Change icon");
        button.addEventListener("mousedown", (e) => e.preventDefault());
        button.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!editor.isEditable) return;
          window.dispatchEvent(new CustomEvent<OpenPicker>(OPEN_PICKER, { detail: { blockId: block.id, icon, anchor: button } }));
        });
        root = createRoot(button);
        root.render(<CalloutGlyph name={icon} />);
        dom.appendChild(button);
      }
      const text = document.createElement("div");
      text.className = "spaces-callout-text";
      dom.appendChild(text);
      return {
        dom,
        contentDOM: text,
        destroy: () => {
          const r = root;
          root = null;
          // Unmounting inside ProseMirror's own update is refused by React; the next tick is free.
          if (r) queueMicrotask(() => r.unmount());
        },
      };
    },
  },
);

/** The callout icon picker: one per editor, opened by a callout's icon slot, anchored on it. */
export function CalloutIconHost({ editor }: { editor: { updateBlock: (id: string, update: { props: { icon: string } }) => unknown } }) {
  const [open, setOpen] = useState<OpenPicker | null>(null);
  useEffect(() => {
    const onOpen = (e: Event) => setOpen((e as CustomEvent<OpenPicker>).detail);
    window.addEventListener(OPEN_PICKER, onOpen);
    return () => window.removeEventListener(OPEN_PICKER, onOpen);
  }, []);
  if (!open) return null;
  const r = open.anchor.getBoundingClientRect();
  const value: SpaceMedia = isEmojiText(open.icon) ? { emoji: open.icon } : { icon: open.icon };
  return (
    <IconPicker
      value={value}
      open
      onOpenChange={(next) => {
        if (!next) setOpen(null);
      }}
      onChange={(media) => {
        editor.updateBlock(open.blockId, { props: { icon: media && "icon" in media ? media.icon : media && "emoji" in media ? media.emoji : "" } });
        setOpen(null);
      }}
    >
      <span aria-hidden style={{ position: "fixed", left: r.left, top: r.top, width: r.width, height: r.height, pointerEvents: "none" }} />
    </IconPicker>
  );
}
