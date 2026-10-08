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
import { AlignCenter, AlignLeft, AlignRight, Captions, FileText, Globe, Paperclip, Replace, TriangleAlert } from "lucide-react";
import { useLinkPreview } from "@/lib/link-preview";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { Component, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { ErrorNotice } from "@ai-matrx/design-system";

import type { RichSpan, SpaceMedia } from "../contract";
import { useSpaceMediaUrl } from "../page/media";
import { SpaceIcon } from "../page/SpaceIcon";
import { useSpaces } from "../state/SpacesProvider";
import { LateSeedRecords } from "../page/space-seed-context";
import { useSpacesKnob } from "../state/knobs";
import { embedTarget } from "./embed-providers";
import { openMediaPicker, type MediaKind } from "./media-insert";

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
  const t = embedTarget(url);
  return t && (t.provider === "youtube" || t.provider === "vimeo" || t.provider === "loom") ? (t.src ?? null) : null;
}

/** The editing context a media block gets from the editor (null on a read-only page). */
interface MediaEdit {
  update: (next: Record<string, unknown>) => void;
  blockId: string;
}

type Align = "left" | "center" | "right";

/**
 * C20 — Notion's frame around an image, video, PDF or embed: drag either side edge to resize (a centered
 * block grows both ways), an embed's bottom edge for its height; on hover Align, Caption and Replace.
 */
function MediaFrame({ kind, p, edit, children, resizable = true, tall }: { kind: MediaKind | "embed"; p: Record<string, unknown>; edit: MediaEdit | null; children: ReactNode; resizable?: boolean; tall?: number }) {
  const align: Align = p.align === "left" || p.align === "right" ? p.align : "center";
  const stored = typeof p.width === "number" ? p.width : undefined;
  const [width, setWidth] = useState<number | undefined>(stored);
  const [height, setHeight] = useState<number | undefined>(tall);
  const [captioning, setCaptioning] = useState(false);
  const fig = useRef<HTMLElement>(null);
  const drag = useRef<{ x: number; y: number; w: number; h: number; side: "left" | "right" | "bottom" } | null>(null);
  useEffect(() => setWidth(stored), [stored]);
  useEffect(() => setHeight(tall), [tall]);
  const caption = Array.isArray(p.caption) ? (p.caption as RichSpan[]) : [];
  const captionText = caption.map((c) => c.text).join("");
  const showCaptionField = !!edit && (captioning || caption.length > 0);

  const startDrag = (side: "left" | "right" | "bottom") => (e: React.PointerEvent) => {
    if (!fig.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = fig.current.getBoundingClientRect();
    drag.current = { x: e.clientX, y: e.clientY, w: r.width, h: height ?? r.height, side };
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    if (d.side === "bottom") {
      setHeight(Math.max(120, Math.round(d.h + e.clientY - d.y)));
      return;
    }
    const dx = (e.clientX - d.x) * (d.side === "left" ? -1 : 1) * (align === "center" ? 2 : 1);
    const max = fig.current?.parentElement?.getBoundingClientRect().width ?? 2000;
    setWidth(Math.round(Math.min(max, Math.max(80, d.w + dx))));
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (!d || !edit) return;
    if (d.side === "bottom") edit.update({ ...p, height });
    else edit.update({ ...p, width });
  };

  return (
    <figure
      ref={fig}
      className="spaces-media spaces-media-frame"
      data-align={align}
      data-media-kind={kind}
      contentEditable={false}
      // A picture keeps its own width until resized; a frame (video, PDF, embed, file, audio) spans the line.
      style={width ? { width, maxWidth: "100%" } : kind === "image" ? undefined : { width: "100%" }}
    >
      <div className="spaces-media-body" style={height ? ({ "--spaces-embed-h": `${height}px` } as React.CSSProperties) : undefined}>
        {children}
        {edit && resizable ? (
          <>
            <span className="spaces-media-handle" data-side="left" aria-hidden onPointerDown={startDrag("left")} onPointerMove={moveDrag} onPointerUp={endDrag} />
            <span className="spaces-media-handle" data-side="right" aria-hidden onPointerDown={startDrag("right")} onPointerMove={moveDrag} onPointerUp={endDrag} />
            {kind === "embed" || kind === "pdf" ? (
              <span className="spaces-media-handle" data-side="bottom" aria-hidden onPointerDown={startDrag("bottom")} onPointerMove={moveDrag} onPointerUp={endDrag} />
            ) : null}
          </>
        ) : null}
        {edit ? (
          <div className="spaces-media-tools" onMouseDown={(e) => e.stopPropagation()}>
            {(["left", "center", "right"] as const).map((a) => {
              const Icon = a === "left" ? AlignLeft : a === "center" ? AlignCenter : AlignRight;
              return (
                <button key={a} type="button" aria-label={`Align ${a}`} data-active={align === a || undefined} onClick={() => edit.update({ ...p, align: a })}>
                  <Icon size={14} strokeWidth={1.8} />
                </button>
              );
            })}
            <span className="spaces-media-tools-sep" />
            <button type="button" aria-label="Caption" onClick={() => setCaptioning(true)}>
              <Captions size={14} strokeWidth={1.8} />
            </button>
            <button
              type="button"
              aria-label="Replace"
              onClick={(e) =>
                openMediaPicker({
                  kind,
                  anchor: e.currentTarget,
                  onPick: (picked) => {
                    const { fileId: _f, url: _u, name: _n, ...rest } = p;
                    edit.update({ ...rest, ...picked });
                  },
                })
              }
            >
              <Replace size={14} strokeWidth={1.8} />
            </button>
          </div>
        ) : null}
      </div>
      {showCaptionField ? (
        <CaptionField
          initial={captionText}
          autoFocus={captioning && caption.length === 0}
          onCommit={(text) => {
            setCaptioning(false);
            if (text === captionText) return;
            const { caption: _c, ...rest } = p;
            edit!.update(text ? { ...rest, caption: [{ text }] } : rest);
          }}
        />
      ) : (
        <Caption spans={p.caption} />
      )}
    </figure>
  );
}

/** The caption under a media block, typed in place (a caption with marks is edited as its plain text). Its keys
 *  never reach the editor: ProseMirror and the page's own key handlers listen natively above it (a space would
 *  open Ask AI and take the caret), so they are stopped on the field itself. */
function CaptionField({ initial, autoFocus, onCommit }: { initial: string; autoFocus: boolean; onCommit: (text: string) => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setText(initial), [initial]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const keep = (e: Event) => {
      e.stopPropagation();
      if (e instanceof KeyboardEvent && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        el.blur();
      }
    };
    const types = ["keydown", "keypress", "keyup", "beforeinput", "paste", "mousedown", "pointerdown"] as const;
    types.forEach((t) => el.addEventListener(t, keep));
    return () => types.forEach((t) => el.removeEventListener(t, keep));
  }, []);
  return (
    <input
      ref={ref}
      className="spaces-caption spaces-caption-field"
      placeholder="Write a caption…"
      value={text}
      autoFocus={autoFocus}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => onCommit(text.trim())}
    />
  );
}

function MediaBlock({ type, p, edit }: { type: MediaKind; p: Record<string, unknown>; edit: MediaEdit | null }) {
  const media = mediaOf(p);
  const src = useSpaceMediaUrl(media);
  const width = typeof p.width === "number" ? p.width : undefined;
  const name = typeof p.name === "string" && p.name ? p.name : src ? decodeURIComponent(src.split("?")[0].split("/").pop() || "") : "File";
  if (type === "file") {
    return (
      <MediaFrame kind="file" p={p} edit={edit} resizable={false}>
        <a className="spaces-file-row" href={src ?? undefined} target="_blank" rel="noreferrer" onMouseDown={(e) => e.stopPropagation()}>
          <Paperclip size={16} strokeWidth={1.8} />
          <span className="truncate">{name}</span>
        </a>
      </MediaFrame>
    );
  }
  if (!src) return <div className="spaces-media-empty" contentEditable={false}>{media ? "Loading…" : `Add ${type === "image" ? "an image" : `a ${type}`}`}</div>;
  return (
    <MediaFrame kind={type} p={p} edit={edit} resizable={type !== "audio"} tall={type === "pdf" && typeof p.height === "number" ? p.height : undefined}>
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
    </MediaFrame>
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

function EmbedBlock({ p, edit }: { p: Record<string, unknown>; edit: MediaEdit | null }) {
  const url = String(p.url ?? "");
  const target = embedTarget(url);
  const knobHeight = useSpacesKnob("embedHeightPx");
  const height = typeof p.height === "number" ? p.height : knobHeight;
  return (
    <MediaFrame kind="embed" p={p} edit={edit} tall={height}>
      {target ? (
        <iframe
          className="spaces-iframe spaces-iframe-embed"
          data-provider={target.provider}
          src={target.src}
          srcDoc={target.srcDoc}
          title={hostOf(url)}
          allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
        />
      ) : (
        <div className="spaces-media-empty">This link can’t be embedded</div>
      )}
    </MediaFrame>
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

function editOf(ctx: { blockId: string; editor: never; update: (next: Record<string, unknown>) => void }): MediaEdit | null {
  return (ctx.editor as unknown as { isEditable: boolean }).isEditable ? { update: ctx.update, blockId: ctx.blockId } : null;
}

export const storedBlockSpecs = {
  image: storedSpec("image", (p, ctx) => <MediaBlock type="image" p={p} edit={editOf(ctx)} />),
  video: storedSpec("video", (p, ctx) => <MediaBlock type="video" p={p} edit={editOf(ctx)} />),
  audio: storedSpec("audio", (p, ctx) => <MediaBlock type="audio" p={p} edit={editOf(ctx)} />),
  file: storedSpec("file", (p, ctx) => <MediaBlock type="file" p={p} edit={editOf(ctx)} />),
  pdf: storedSpec("pdf", (p, ctx) => <MediaBlock type="pdf" p={p} edit={editOf(ctx)} />),
  bookmark: storedSpec("bookmark", (p) => <BookmarkBlock p={p} />),
  embed: storedSpec("embed", (p, ctx) => <EmbedBlock p={p} edit={editOf(ctx)} />),
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
