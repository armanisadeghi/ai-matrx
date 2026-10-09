"use client";

// features/spaces/editor/schema.tsx — the block schema: BlockNote's defaults plus the Notion blocks it lacks.
//
// Built here (never @blocknote/xl-*, which is GPL): callout (callout-block.tsx), page, link to page, columns, and `slot`
// (a marked place where a phase-2 block will sit). Callout bodies and columns hold their content as
// ordinary block children; spaces.css draws the callout box around them and lays columns side by side.

import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs, defaultProps, defaultStyleSpecs } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { ArrowUpRight, FileText } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { useSpaces } from "../state/SpacesProvider";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSeededLink } from "../page/space-links";
import { IconPicker } from "../page/IconPicker";
import { notionCodeBlock } from "./code-block";
import { equationInline, mentionInline } from "./inline";
import { storedBlockSpecs } from "./stored-blocks";
import { CalloutBlock } from "./callout-block";
import { TabBlock, TabsBlock } from "./tabs-block";
import { SyncedBlock } from "./synced-block";
import { ButtonBlock } from "./button-block";
import { AiBlock } from "./ai-block";
import { AppletBlock } from "./applet-block";
import { SuggestionStyle } from "./suggest";

/** C10: Notion's code-block language picker (the stored `language` prop rides through convert.ts as is). */
const CODE_BLOCK = notionCodeBlock(createCodeBlockSpec({
  defaultLanguage: "text",
  supportedLanguages: {
    // "" too: BlockNote's "``` " shortcut asks for the language typed after the fence (none), and a
    // language the list does not know is refused — the fence then stayed a paragraph of literal "```".
    text: { name: "Plain text", aliases: ["plaintext", "txt", ""] },
    bash: { name: "Bash", aliases: ["sh", "shell", "zsh"] },
    c: { name: "C" },
    cpp: { name: "C++", aliases: ["c++"] },
    csharp: { name: "C#", aliases: ["cs"] },
    css: { name: "CSS" },
    go: { name: "Go", aliases: ["golang"] },
    html: { name: "HTML" },
    java: { name: "Java" },
    javascript: { name: "JavaScript", aliases: ["js"] },
    json: { name: "JSON" },
    kotlin: { name: "Kotlin" },
    markdown: { name: "Markdown", aliases: ["md"] },
    mermaid: { name: "Mermaid" },
    php: { name: "PHP" },
    python: { name: "Python", aliases: ["py"] },
    ruby: { name: "Ruby", aliases: ["rb"] },
    rust: { name: "Rust", aliases: ["rs"] },
    sql: { name: "SQL" },
    swift: { name: "Swift" },
    typescript: { name: "TypeScript", aliases: ["ts"] },
    yaml: { name: "YAML", aliases: ["yml"] },
  },
}));

export function PageRow({ spaceId, linked }: { spaceId: string; linked: boolean }) {
  const { byId, archived, linkTarget, requestLink, ready, open, pageHref, missingPageLabel } = useSpaces();
  // The tree first; a page it does not hold (shared from another organization) is read by id — never
  // "in Trash" unless it is.
  // Round 40: the route read every linked page in one call (`useSeededLink`); only a link it did not know
  // (added after load) asks, batched with every other unknown link of the same moment.
  const seeded = useSeededLink(spaceId);
  const page = byId.get(spaceId) ?? (seeded && !seeded.isArchived ? seeded : undefined) ?? linkTarget?.(spaceId) ?? undefined;
  const trashed = !!seeded?.isArchived || archived.some((a) => a.id === spaceId);
  const known = seeded !== undefined;
  useEffect(() => {
    if (!page && !trashed && !known) requestLink?.(spaceId);
  }, [page, trashed, known, requestLink, spaceId, ready]);
  const reading = !page && !trashed && !known && (!ready || (!!requestLink && linkTarget?.(spaceId) === undefined));
  const title = page
    ? page.title || "Untitled"
    : reading
      ? ""
      : (missingPageLabel ?? (trashed ? "Page in Trash" : "No access to this page"));
  return (
    <Link
      href={pageHref ? pageHref(spaceId) : `/spaces/${spaceId}`}
      className="spaces-page-link"
      data-missing={page ? undefined : "true"}
      contentEditable={false}
      draggable={false}
      // The editor must not turn a press on the link into a text selection (read-only pages too).
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        open(spaceId);
      }}
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

/** While a gutter drags, widths go to a <style> in <head> — never onto ProseMirror's own DOM, whose
 *  mutation observer would re-render the node view on every write. */
function setDragWidths(rules: Record<string, number> | null) {
  let el = document.getElementById("spaces-column-drag") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "spaces-column-drag";
    document.head.appendChild(el);
  }
  el.textContent = rules
    ? Object.entries(rules)
        .map(([id, w]) => `.spaces-editor .bn-block-outer[data-id="${CSS.escape(id)}"]{flex-grow:${w * 1000} !important}`)
        .join("\n")
    : "";
}

function ColumnBody({ children }: { children?: React.ReactNode }) {
  return <div className="spaces-column">{children}</div>;
}

const ColumnBlock = createReactBlockSpec(
  { type: "column", propSchema: { width: { default: 0.5 } }, content: "none" },
  {
    render: ({ block, editor }) => {
      const width = Number(block.props.width ?? 0.5);
      const list = editor.getParentBlock(block);
      const siblings = list?.children ?? [];
      const next = siblings[siblings.findIndex((c) => c.id === block.id) + 1];
      if (!next || !editor.isEditable) return <ColumnBody />;
      const nextWidth = Number(next.props.width ?? 0.5);
      return (
        <ColumnBody>
          <ColumnResizer
            onResize={(delta, done) => {
              const total = siblings.reduce((sum, c) => sum + Number(c.props.width ?? 0.5), 0) || 1;
              const pair = width + nextWidth;
              const mine = Math.min(pair - 0.08 * total, Math.max(0.08 * total, width + delta * total));
              setDragWidths(done ? null : { [block.id]: mine, [next.id]: pair - mine });
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
    codeBlock: CODE_BLOCK,
    callout: CalloutBlock(),
    page: PageBlock(),
    linkToPage: LinkToPageBlock(),
    columnList: ColumnListBlock(),
    column: ColumnBlock(),
    slot: SlotBlock(),
    tabs: TabsBlock(),
    tab: TabBlock(),
    synced: SyncedBlock(),
    button: ButtonBlock(),
    ai: AiBlock(),
    applet: AppletBlock(),
    table: defaultBlockSpecs.table,
    image: storedBlockSpecs.image(),
    video: storedBlockSpecs.video(),
    audio: storedBlockSpecs.audio(),
    file: storedBlockSpecs.file(),
    pdf: storedBlockSpecs.pdf(),
    bookmark: storedBlockSpecs.bookmark(),
    embed: storedBlockSpecs.embed(),
    equation: storedBlockSpecs.equation(),
    tableOfContents: storedBlockSpecs.tableOfContents(),
    breadcrumb: storedBlockSpecs.breadcrumb(),
    database: storedBlockSpecs.database(),
    unknownBlock: storedBlockSpecs.unknownBlock(),
    unsupportedText: storedBlockSpecs.unsupportedText(),
  },
  // N3: a suggested edit is a string style (the stored span's `suggestion`, as JSON).
  styleSpecs: { ...defaultStyleSpecs, suggestion: SuggestionStyle },
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    inlineMention: mentionInline,
    inlineEquation: equationInline,
  },
});

export type SpacesEditor = typeof spacesSchema.BlockNoteEditor;
export type SpacesEngineBlock = typeof spacesSchema.Block;
