"use client";

// features/spaces/editor/schema.tsx — the block schema: BlockNote's defaults plus the Notion blocks it lacks.
//
// Built here (never @blocknote/xl-*, which is GPL): callout, page, link to page, columns, and `slot`
// (a marked place where a phase-2 block will sit). Callout bodies and columns hold their content as
// ordinary block children; spaces.css draws the callout box around them and lays columns side by side.

import { BlockNoteSchema, defaultBlockSpecs, defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { useSpaces } from "../state/SpacesProvider";
import { SpaceIcon } from "../page/SpaceIcon";
import { IconPicker } from "../page/IconPicker";

const CalloutBlock = createReactBlockSpec(
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
    render: ({ block, editor, contentRef }) => (
      <div className="spaces-callout" data-has-icon={block.props.icon ? "true" : "false"}>
        {block.props.icon ? (
          <IconPicker
            value={{ icon: block.props.icon }}
            disabled={!editor.isEditable}
            onChange={(media) => editor.updateBlock(block, { props: { icon: media && "icon" in media ? media.icon : "" } })}
          >
            <button type="button" className="spaces-callout-icon" contentEditable={false} aria-label="Change icon">
              <SpaceIcon media={{ icon: block.props.icon }} size={20} />
            </button>
          </IconPicker>
        ) : null}
        <div className="spaces-callout-text" ref={contentRef} />
      </div>
    ),
  },
);

function PageRow({ spaceId, linked }: { spaceId: string; linked: boolean }) {
  const { byId } = useSpaces();
  const page = byId.get(spaceId);
  const title = page ? page.title || "Untitled" : "Page in Trash";
  return (
    <Link
      href={`/spaces/${spaceId}`}
      className="spaces-page-link"
      data-missing={page ? undefined : "true"}
      contentEditable={false}
      draggable={false}
    >
      <span className="spaces-page-link-icon">
        {page?.icon ? <SpaceIcon media={page.icon} size={18} /> : <FileText size={18} strokeWidth={1.6} />}
        {linked ? <ArrowUpRight className="spaces-page-link-arrow" size={10} strokeWidth={2.5} /> : null}
      </span>
      <span className="spaces-page-link-title">{title}</span>
    </Link>
  );
}

const PageBlock = createReactBlockSpec(
  {
    type: "page",
    propSchema: { textColor: defaultProps.textColor, backgroundColor: defaultProps.backgroundColor, spaceId: { default: "" } },
    content: "none",
  },
  { render: ({ block }) => <PageRow spaceId={block.props.spaceId} linked={false} /> },
);

const LinkToPageBlock = createReactBlockSpec(
  {
    type: "linkToPage",
    propSchema: { textColor: defaultProps.textColor, backgroundColor: defaultProps.backgroundColor, spaceId: { default: "" } },
    content: "none",
  },
  { render: ({ block }) => <PageRow spaceId={block.props.spaceId} linked /> },
);

const ColumnListBlock = createReactBlockSpec(
  { type: "columnList", propSchema: {}, content: "none" },
  { render: () => <div className="spaces-column-list" /> },
);

/** The gutter on a column's right edge: drag to trade width with the next column (Notion C17). */
function ColumnResizer({ onResize }: { onResize: (deltaRatio: number, done: boolean) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      className="spaces-column-resizer"
      contentEditable={false}
      onPointerDown={(e) => {
        const list = (e.currentTarget.closest(".bn-block-group") as HTMLElement | null) ?? null;
        if (!list) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width: list.getBoundingClientRect().width };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        onResize((e.clientX - start.current.x) / start.current.width, false);
      }}
      onPointerUp={(e) => {
        if (!start.current) return;
        onResize((e.clientX - start.current.x) / start.current.width, true);
        start.current = null;
      }}
    />
  );
}

/** Applies the stored width to the column's outer block element, which is the flex item. */
function ColumnBody({ width, children }: { width: number; children?: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outer = ref.current?.closest<HTMLElement>(".bn-block-outer");
    if (outer) outer.style.flexGrow = String(width);
  }, [width]);
  return (
    <div className="spaces-column" ref={ref}>
      {children}
    </div>
  );
}

const ColumnBlock = createReactBlockSpec(
  { type: "column", propSchema: { width: { default: 0.5 } }, content: "none" },
  {
    render: ({ block, editor }) => {
      const width = Number(block.props.width ?? 0.5);
      const list = editor.getParentBlock(block);
      const siblings = list?.children ?? [];
      const next = siblings[siblings.findIndex((c) => c.id === block.id) + 1];
      if (!next || !editor.isEditable) return <ColumnBody width={width} />;
      const nextWidth = Number(next.props.width ?? 0.5);
      const outerOf = (id: string) => document.querySelector<HTMLElement>(`.bn-block-outer[data-id="${id}"]`);
      return (
        <ColumnBody width={width}>
          <ColumnResizer
            onResize={(delta, done) => {
              const total = siblings.reduce((sum, c) => sum + Number(c.props.width ?? 0.5), 0) || 1;
              const pair = width + nextWidth;
              const mine = Math.min(pair - 0.08 * total, Math.max(0.08 * total, width + delta * total));
              const a = outerOf(block.id);
              const b = outerOf(next.id);
              if (a) a.style.flexGrow = String(mine);
              if (b) b.style.flexGrow = String(pair - mine);
              if (!done) return;
              editor.transact(() => {
                editor.updateBlock(block, { props: { width: mine } });
                editor.updateBlock(next, { props: { width: pair - mine } });
              });
            }}
          />
        </ColumnBody>
      );
    },
  },
);

const SlotBlock = createReactBlockSpec(
  { type: "slot", propSchema: { label: { default: "" }, height: { default: 200 } }, content: "none" },
  {
    render: ({ block }) => (
      <div className="spaces-slot" style={{ minHeight: Number(block.props.height) }} contentEditable={false}>
        <span className="spaces-slot-tag">Phase 2</span>
        <span>{block.props.label}</span>
      </div>
    ),
  },
);

export const spacesSchema = BlockNoteSchema.create({
  blockSpecs: {
    paragraph: defaultBlockSpecs.paragraph,
    heading: defaultBlockSpecs.heading,
    bulletListItem: defaultBlockSpecs.bulletListItem,
    numberedListItem: defaultBlockSpecs.numberedListItem,
    checkListItem: defaultBlockSpecs.checkListItem,
    toggleListItem: defaultBlockSpecs.toggleListItem,
    quote: defaultBlockSpecs.quote,
    divider: defaultBlockSpecs.divider,
    codeBlock: defaultBlockSpecs.codeBlock,
    callout: CalloutBlock(),
    page: PageBlock(),
    linkToPage: LinkToPageBlock(),
    columnList: ColumnListBlock(),
    column: ColumnBlock(),
    slot: SlotBlock(),
  },
});

export type SpacesEditor = typeof spacesSchema.BlockNoteEditor;
export type SpacesEngineBlock = typeof spacesSchema.Block;
