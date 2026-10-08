"use client";

// features/spaces/editor/stored-blocks.tsx — the Notion blocks whose stored props ride verbatim in one
// `data` prop (convert.ts DATA_BLOCKS): image, video, audio, file, PDF, bookmark, embed, block equation,
// table of contents, breadcrumb, database — plus `unsupportedText` (an importer's marked text block) and
// `unknownBlock` (a stored type this editor has never heard of, kept whole and said out loud).

import { createReactBlockSpec } from "@blocknote/react";
import { createExtension, defaultProps, type Extension, type ExtensionFactoryInstance } from "@blocknote/core";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as PmNode } from "@tiptap/pm/model";
import { DATABASE_EVENT_CLAIMS, DatabaseHost, activeLayout, paintedSizesOf, pickPainted } from "./database-host";
import DisplayMath from "@/features/math/components/DisplayMath";
import InlineMathText from "@/features/math/components/InlineMathText";
import { FileText, Globe, Paperclip, TriangleAlert } from "lucide-react";
import { useLinkPreview } from "@/lib/link-preview";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Component, useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { ErrorNotice } from "@ai-matrx/design-system";

import type { RichSpan, SpaceMedia } from "../contract";
import { useSpaceMediaUrl } from "../page/media";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces } from "../state/SpacesProvider";
import { LateSeedRecords } from "../page/space-seed-context";

const DatabaseBlockView = dynamic(() => import("../data/DatabaseBlock").then((m) => m.DatabaseBlock), {
  ssr: false,
  loading: () => <div className="spaces-db-loading" />,
});

/** A database block's table owns its own presses and keys (`database-host.tsx`); the editor leaves them be. */
export const databaseOwnsItsEvents = createExtension({
  key: "spacesDatabaseOwnsItsEvents",
  prosemirrorPlugins: [new Plugin({ props: { handleDOMEvents: DATABASE_EVENT_CLAIMS } })],
});

/**
 * A database block's view is drawn by React a moment after the editor, so its node view's wrapper is empty
 * (0px) in the first frame and the blocks under it moved when the table landed (round 29). The block's
 * stored `paintedSize` goes on that wrapper as `--spaces-painted-h` IN THE SAME PASS as the text
 * (a node decoration), and spaces.css holds an empty wrapper at it.
 */
function paintedDecorations(doc: PmNode): DecorationSet {
  const decos: Decoration[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "database") return true;
    const data = readData(node.attrs.data);
    const h = typeof window === "undefined" ? undefined : pickPainted(paintedSizesOf(data), { vw: window.innerWidth }, activeLayout(data) === "chart")?.h;
    if (h) decos.push(Decoration.node(pos, pos + node.nodeSize, { style: `--spaces-painted-h:${h}px` }));
    return false;
  });
  return DecorationSet.create(doc, decos);
}
const databasePaintedGeometry = createExtension({
  key: "spacesDatabasePaintedGeometry",
  prosemirrorPlugins: [
    new Plugin<DecorationSet>({
      state: {
        init: (_config, state) => paintedDecorations(state.doc),
        apply: (tr, set) => (tr.docChanged ? paintedDecorations(tr.doc) : set),
      },
      props: {
        decorations(state) {
          return this.getState(state);
        },
      },
    }),
  ],
});

type Data = { props?: Record<string, unknown> };

export function readData(raw: unknown): Record<string, unknown> {
  try {
    return ((JSON.parse(String(raw || "{}")) as Data).props ?? {}) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function mediaOf(p: Record<string, unknown>): SpaceMedia | null {
  if (typeof p.fileId === "string" && p.fileId) return { fileId: p.fileId };
  if (typeof p.url === "string" && p.url) return { url: p.url };
  return null;
}

/** A caption: the stored spans, drawn with their marks. */
export function Spans({ spans }: { spans: RichSpan[] | undefined }) {
  return (
    <>
      {(spans ?? []).map((s, i) => {
        const cls = [s.bold && "font-semibold", s.italic && "italic", s.underline && "underline", s.strike && "line-through", s.code && "spaces-inline-code"]
          .filter(Boolean)
          .join(" ");
        const body = s.equation !== undefined ? <InlineMath expression={s.equation} /> : s.text;
        return s.link ? (
          <a key={i} href={s.link} className={`spaces-link ${cls}`} target="_blank" rel="noreferrer">
            {body}
          </a>
        ) : (
          <span key={i} className={cls} data-color={s.color} data-background={s.background}>
            {body}
          </span>
        );
      })}
    </>
  );
}

function Caption({ spans }: { spans: unknown }) {
  if (!Array.isArray(spans) || spans.length === 0) return null;
  return (
    <figcaption className="spaces-caption">
      <Spans spans={spans as RichSpan[]} />
    </figcaption>
  );
}

export function InlineMath({ expression }: { expression: string }) {
  // Through the ONE markdown core (math preset), never a direct KaTeX call.
  return (
    <span className="spaces-inline-equation">
      <InlineMathText text={expression ? `$${expression}$` : ""} />
    </span>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** YouTube / Vimeo / Loom pages become their embed address; anything else is played as a file. */
function videoEmbed(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  const loom = url.match(/loom\.com\/share\/([\w-]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return null;
}

function MediaBlock({ type, p }: { type: string; p: Record<string, unknown> }) {
  const media = mediaOf(p);
  const src = useSpaceMediaUrl(media);
  const width = typeof p.width === "number" ? p.width : undefined;
  const name = typeof p.name === "string" && p.name ? p.name : src ? decodeURIComponent(src.split("?")[0].split("/").pop() || "") : "File";
  if (type === "file") {
    return (
      <figure className="spaces-media" contentEditable={false}>
        <a className="spaces-file-row" href={src ?? undefined} target="_blank" rel="noreferrer" onMouseDown={(e) => e.stopPropagation()}>
          <Paperclip size={16} strokeWidth={1.8} />
          <span className="truncate">{name}</span>
        </a>
        <Caption spans={p.caption} />
      </figure>
    );
  }
  if (!src) return <div className="spaces-media-empty" contentEditable={false}>{media ? "Loading…" : `Add ${type === "image" ? "an image" : `a ${type}`}`}</div>;
  return (
    <figure className="spaces-media" contentEditable={false} style={width ? { width, maxWidth: "100%" } : undefined}>
      {type === "image" ? <img src={src} alt={Array.isArray(p.caption) ? (p.caption as RichSpan[]).map((s) => s.text).join("") : ""} className="spaces-image" draggable={false} /> : null}
      {type === "video" ? (
        videoEmbed(src) ? (
          <iframe className="spaces-iframe spaces-iframe-video" src={videoEmbed(src)!} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title={name} />
        ) : (
          <video className="spaces-video" src={src} controls preload="metadata" />
        )
      ) : null}
      {type === "audio" ? <audio className="spaces-audio" src={src} controls preload="metadata" /> : null}
      {type === "pdf" ? <iframe className="spaces-iframe spaces-iframe-pdf" src={src} title={name} /> : null}
      <Caption spans={p.caption} />
    </figure>
  );
}

function BookmarkBlock({ p }: { p: Record<string, unknown> }) {
  const url = String(p.url ?? "");
  // C22 — Notion's card: title, two lines of description, favicon + address, the page's image on the
  // right. Until the preview answers (or when it has none) the card shows the host and the address.
  const { status, preview } = useLinkPreview(url);
  const card = status === "ready" && preview ? preview : null;
  return (
    <figure className="spaces-media" contentEditable={false}>
      <a className="spaces-bookmark" data-rich={card ? "true" : undefined} href={url} target="_blank" rel="noreferrer" onMouseDown={(e) => e.stopPropagation()}>
        <span className="spaces-bookmark-text">
          <span className="spaces-bookmark-title">{card?.title || hostOf(url)}</span>
          {card?.description ? <span className="spaces-bookmark-desc">{card.description}</span> : null}
          <span className="spaces-bookmark-url">
            {card?.favicon_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- a site's favicon, any host
              <img src={card.favicon_url} alt="" width={16} height={16} className="spaces-bookmark-favicon" />
            ) : (
              <Globe size={12} strokeWidth={1.8} />
            )}
            <span className="truncate">{url}</span>
          </span>
        </span>
        {card?.image_url ? (
          <span className="spaces-bookmark-image">
            {/* eslint-disable-next-line @next/next/no-img-element -- the linked page's own picture, any host */}
            <img src={card.image_url} alt="" />
          </span>
        ) : null}
      </a>
      <Caption spans={p.caption} />
    </figure>
  );
}

function EmbedBlock({ p }: { p: Record<string, unknown> }) {
  const url = String(p.url ?? "");
  const src = videoEmbed(url) ?? url;
  return (
    <figure className="spaces-media" contentEditable={false}>
      <iframe className="spaces-iframe spaces-iframe-embed" src={src} title={hostOf(url)} sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation" />
      <Caption spans={p.caption} />
    </figure>
  );
}

function EquationBlock({ p }: { p: Record<string, unknown> }) {
  const expression = String(p.expression ?? "");
  return expression ? (
    <div className="spaces-equation" contentEditable={false}>
      <DisplayMath math={expression} />
    </div>
  ) : (
    <div className="spaces-media-empty" contentEditable={false}>Add a TeX equation</div>
  );
}

interface HeadingLite {
  id: string;
  level: number;
  text: string;
}

/** The page's headings, read live from the editor document. */
function TableOfContents({ editor }: { editor: { document: unknown; onChange: (cb: () => void) => (() => void) | void } }) {
  const version = useSyncExternalStore(
    (cb) => {
      const off = editor.onChange(cb);
      return () => {
        if (typeof off === "function") off();
      };
    },
    () => JSON.stringify(collectHeadings(editor.document)),
    () => "[]",
  );
  const headings = JSON.parse(version) as HeadingLite[];
  if (!headings.length) return <div className="spaces-toc-empty" contentEditable={false}>Add headings to create a table of contents.</div>;
  return (
    <nav className="spaces-toc" contentEditable={false}>
      {headings.map((h) => (
        <a key={h.id} href={`#block-${h.id}`} className="spaces-toc-row" style={{ paddingLeft: (h.level - 1) * 24 }} onMouseDown={(e) => e.stopPropagation()}>
          {h.text || "Untitled"}
        </a>
      ))}
    </nav>
  );
}

function collectHeadings(doc: unknown): HeadingLite[] {
  const out: HeadingLite[] = [];
  const walk = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const b of list as Array<{ id: string; type: string; props?: { level?: number }; content?: unknown; children?: unknown }>) {
      if (b.type === "heading") {
        const text = Array.isArray(b.content) ? (b.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("") : "";
        out.push({ id: b.id, level: Number(b.props?.level ?? 1), text });
      }
      walk(b.children);
    }
  };
  walk(doc);
  return out;
}

function Breadcrumb() {
  const params = useParams<{ spaceId?: string }>();
  const { pathTo, open } = useSpaces();
  const path = params?.spaceId ? pathTo(params.spaceId) : [];
  return (
    <nav className="spaces-breadcrumb-block" contentEditable={false}>
      {path.map((s, i) => (
        <span key={s.id} className="spaces-breadcrumb-part">
          {i > 0 ? <span className="spaces-breadcrumb-sep">/</span> : null}
          <button type="button" onMouseDown={(e) => e.stopPropagation()} onClick={() => open(s.id)}>
            {s.icon ? <SpaceIcon media={s.icon} size={14} /> : <FileText size={14} strokeWidth={1.6} />}
            <span>{s.title || "Untitled"}</span>
          </button>
        </span>
      ))}
    </nav>
  );
}

/** A data block that throws keeps the page: it says so in place, and the rest of the page still works. */
class BlockBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  override state = { error: null as string | null };
  static getDerivedStateFromError(e: unknown) {
    return { error: e instanceof Error ? e.message : "This block could not be drawn." };
  }
  override render() {
    return this.state.error ? <ErrorNotice title="This block could not be drawn" message={this.state.error} size="compact" /> : this.props.children;
  }
}

const dataProp = { data: { default: "{}" } } as const;

export function storedSpec(
  type: string,
  render: (p: Record<string, unknown>, ctx: { blockId: string; editor: never; update: (next: Record<string, unknown>) => void }) => React.ReactNode,
  extensions?: (ExtensionFactoryInstance | Extension)[],
) {
  return createReactBlockSpec(
    { type, propSchema: dataProp, content: "none" },
    {
      render: ({ block, editor }) => {
        const p = readData(block.props.data);
        const update = (next: Record<string, unknown>) => {
          let whole: Record<string, unknown> = {};
          try {
            whole = JSON.parse(String(block.props.data || "{}")) as Record<string, unknown>;
          } catch {
            whole = {};
          }
          editor.updateBlock(block, { props: { data: JSON.stringify({ ...whole, props: next }) } } as never);
        };
        return <>{render(p, { blockId: block.id, editor: editor as never, update })}</>;
      },
    },
    extensions,
  );
}

export const storedBlockSpecs = {
  image: storedSpec("image", (p) => <MediaBlock type="image" p={p} />),
  video: storedSpec("video", (p) => <MediaBlock type="video" p={p} />),
  audio: storedSpec("audio", (p) => <MediaBlock type="audio" p={p} />),
  file: storedSpec("file", (p) => <MediaBlock type="file" p={p} />),
  pdf: storedSpec("pdf", (p) => <MediaBlock type="pdf" p={p} />),
  bookmark: storedSpec("bookmark", (p) => <BookmarkBlock p={p} />),
  embed: storedSpec("embed", (p) => <EmbedBlock p={p} />),
  equation: storedSpec("equation", (p) => <EquationBlock p={p} />),
  tableOfContents: storedSpec("tableOfContents", (_p, ctx) => <TableOfContents editor={ctx.editor} />),
  breadcrumb: storedSpec("breadcrumb", () => <Breadcrumb />),
  database: storedSpec("database", (p, ctx) => (
    <DatabaseHost blockId={ctx.blockId} layout={activeLayout(p)} painted={paintedSizesOf(p)}>
      <BlockBoundary>
        <LateSeedRecords blockId={ctx.blockId} fallback={<div className="spaces-db-loading" />}>
          <DatabaseBlockView blockId={ctx.blockId} props={p} onChange={ctx.update} editable={(ctx.editor as unknown as { isEditable: boolean }).isEditable} />
        </LateSeedRecords>
      </BlockBoundary>
    </DatabaseHost>
   ), [databaseOwnsItsEvents, databasePaintedGeometry]),
  unknownBlock: createReactBlockSpec(
    { type: "unknownBlock", propSchema: dataProp, content: "none" },
    {
      render: ({ block }) => {
        let type = "block";
        try {
          type = String((JSON.parse(String(block.props.data)) as { type?: string }).type ?? "block");
        } catch {
          /* kept whole regardless */
        }
        return (
          <div className="spaces-unknown" contentEditable={false}>
            <TriangleAlert size={14} strokeWidth={1.8} />
            <span>This block ({type}) can’t be shown here yet. It is kept as it was.</span>
          </div>
        );
      },
    },
  ),
  unsupportedText: createReactBlockSpec(
    {
      type: "unsupportedText",
      propSchema: { textColor: defaultProps.textColor, backgroundColor: defaultProps.backgroundColor, data: { default: "{}" } },
      content: "inline",
    },
    {
      render: ({ contentRef }) => (
        <div className="spaces-unsupported" ref={contentRef} />
      ),
    },
  ),
};
