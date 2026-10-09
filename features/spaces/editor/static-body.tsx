"use client";

// features/spaces/editor/static-body.tsx — round 34: the page body's first paint, in the server's HTML.
//
// BlockNote 0.55 cannot draw on the server (it reads `window` while it creates the editor), and the editor
// waits for the page's room before it holds any content. So the first paint is the stored blocks drawn
// READ-ONLY in the editor's own DOM — the exact elements, classes and attributes BlockNote's node views
// produce (`.bn-block-outer > .bn-block > .bn-block-content[data-content-type]…`, captured from the live
// editor, `__tests__/walk/load-perf.walk.mjs DUMP=`), so `spaces.css` lays it out identically — and the
// React blocks through THE SAME components the editor's node views mount (`PageRow`, the callout `Glyph`,
// `DatabaseHost` + `DatabaseBlock`): one renderer per React block. The editor is built behind it and takes
// its place once it paints the same height (`SpacePage` `revealWhenPainted`); the walk's CLS check and the
// height match are the guard that this layer and the editor draw the same page.
//
// Only what a first paint needs is drawn here: text blocks, headings, lists, to-dos, toggles, quotes,
// dividers, callouts, columns, page links, databases and Applet frames. Anything else holds an empty block (the editor
// draws it on reveal).

import dynamic from "next/dynamic";
import { Suspense, type ReactNode } from "react";

import { listMarker } from "./list-marker";
import type { SpaceBlock } from "../contract";
import { ResolvedBlockSeed, useAwaitedBlockSeed } from "../page/space-seed-context";
import { CalloutGlyph } from "./callout-block";
import { AppletFrame, appletBlockHeight } from "./applet-frame";
import { toEngine, type EngineBlock } from "./convert";
import { DatabaseHost, PAINTED_WIDTH_SLACK, activeLayout, paintedSizesOf } from "./database-host";
import { columnCss, useDarkMode } from "./SpaceEditor";
import { PageRow } from "./schema";
import { readData } from "./stored-blocks";

// The same chunk the editor's database node view loads, rendered on the server here (rows in the HTML).
const DatabaseBlock = dynamic(() => import("../data/DatabaseBlock").then((m) => m.DatabaseBlock), {
  loading: () => <div className="spaces-db-loading" />,
});

type Inline = { type: string; text?: string; styles?: Record<string, unknown>; href?: string; content?: Inline[]; props?: Record<string, unknown> };

const TOGGLE_SVG = (
  <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="CURRENTCOLOR">
    <path d="M320-200v-560l440 280-440 280Z" />
  </svg>
);

/** BlockNote's style marks, nested the way its schema serializes them. */
function Styled({ node }: { node: Inline }): ReactNode {
  let out: ReactNode = node.text ?? "";
  const s = node.styles ?? {};
  if (s.code) out = <code>{out}</code>;
  if (s.strike) out = <s>{out}</s>;
  if (s.underline) out = <u>{out}</u>;
  if (s.italic) out = <em>{out}</em>;
  if (s.bold) out = <strong>{out}</strong>;
  if (typeof s.backgroundColor === "string") out = <span data-style-type="backgroundColor" data-value={s.backgroundColor}>{out}</span>;
  if (typeof s.textColor === "string") out = <span data-style-type="textColor" data-value={s.textColor}>{out}</span>;
  return out;
}

function spanText(node: Inline): string {
  try {
    const span = JSON.parse(String(node.props?.span ?? "{}")) as { text?: string; equation?: string };
    return span.text ?? span.equation ?? "";
  } catch {
    return "";
  }
}

function InlineContent({ content }: { content: unknown }) {
  const list = Array.isArray(content) ? (content as Inline[]) : [];
  return (
    <>
      {list.map((n, i) =>
        n.type === "text" ? (
          <Styled key={i} node={n} />
        ) : n.type === "link" ? (
          <a key={i} href={n.href} className="bn-inline-content-link">
            {(n.content ?? []).map((c, j) => (
              <Styled key={j} node={c} />
            ))}
          </a>
        ) : (
          <span key={i} data-inline-content-type={n.type}>
            {spanText(n)}
          </span>
        ),
      )}
    </>
  );
}

const kebab = (k: string) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

/** Props that differ from their schema defaults become `data-*` on the content element (BlockNote's rule). */
const DEFAULTS: Record<string, unknown> = { textColor: "default", backgroundColor: "default", textAlignment: "left", level: 1, isToggleable: false, checked: false, width: 0.5, icon: "Lightbulb" };
function contentAttrs(b: EngineBlock): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.props ?? {})) {
    if (k === "data" || v === undefined || v === null || typeof v === "object") continue;
    if (k in DEFAULTS ? DEFAULTS[k] === v : v === "" && k !== "icon") continue;
    out[`data-${kebab(k)}`] = String(v);
  }
  return out;
}

function Text({ tag, content }: { tag: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote"; content: unknown }) {
  const Tag = tag;
  return (
    <Tag className="bn-inline-content">
      <InlineContent content={content} />
    </Tag>
  );
}

function ToggleBlock({ children }: { children: ReactNode }) {
  return (
    <div>
      <div className="bn-toggle-wrapper" data-show-children="false">
        <button className="bn-toggle-button" type="button" tabIndex={-1}>
          {TOGGLE_SVG}
        </button>
        {children}
      </div>
    </div>
  );
}

/** A plain (vanilla-spec) block's content element. */
function Plain({ b, index, depth = 0 }: { b: EngineBlock; index?: number; depth?: number }) {
  const attrs = contentAttrs(b);
  if (b.type === "numberedListItem" && index !== undefined) attrs["data-index"] = String(index);
  if (b.type === "numberedListItem" && index !== undefined && depth > 0) attrs["data-marker"] = listMarker(index, depth);
  let inner: ReactNode = null;
  const props = b.props ?? {};
  switch (b.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(props.level ?? 1)));
      const text = <Text tag={`h${level}` as "h1"} content={b.content} />;
      inner = props.isToggleable ? <ToggleBlock>{text}</ToggleBlock> : text;
      break;
    }
    case "toggleListItem":
      inner = (
        <ToggleBlock>
          <Text tag="p" content={b.content} />
        </ToggleBlock>
      );
      break;
    case "checkListItem":
      inner = (
        <>
          <div contentEditable={false}>
            <input type="checkbox" defaultChecked={props.checked === true} disabled />
          </div>
          <Text tag="p" content={b.content} />
        </>
      );
      break;
    case "quote":
      inner = <Text tag="blockquote" content={b.content} />;
      break;
    case "divider":
      inner = <hr />;
      break;
    case "callout": {
      const icon = typeof props.icon === "string" ? props.icon : "Lightbulb";
      const empty = Array.isArray(b.content) && b.content.length === 0;
      inner = (
        <div className="spaces-callout" data-has-icon={icon ? "true" : "false"} data-empty={empty ? "true" : undefined}>
          {icon ? (
            <button type="button" className="spaces-callout-icon" contentEditable={false} aria-label="Change icon" tabIndex={-1}>
              <CalloutGlyph name={icon} />
            </button>
          ) : null}
          <div className="bn-inline-content spaces-callout-text">
            <InlineContent content={b.content} />
          </div>
        </div>
      );
      break;
    }
    default:
      inner = <Text tag="p" content={b.content} />;
  }
  return (
    <div className="bn-block-content" data-content-type={b.type} {...(b.type === "divider" ? { contentEditable: false } : {})} {...attrs}>
      {inner}
    </div>
  );
}

const REACT_BLOCKS = new Set(["page", "linkToPage", "columnList", "column", "database", "applet"]);
const PLAIN_BLOCKS = new Set(["paragraph", "heading", "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem", "quote", "divider", "callout"]);

/** The server's answers for this block (its own seed, awaited inside the block's own Suspense). */
function SeededDatabase({ blockId, p }: { blockId: string; p: Record<string, unknown> }) {
  const seed = useAwaitedBlockSeed(blockId);
  return (
    <ResolvedBlockSeed blockId={blockId} seed={seed}>
      <DatabaseBlock blockId={blockId} props={p} onChange={() => undefined} editable={false} />
    </ResolvedBlockSeed>
  );
}

/** A React block's node-view wrapper and the component its node view mounts. */
function ReactBlock({ b }: { b: EngineBlock }) {
  const props = b.props ?? {};
  let inner: ReactNode = null;
  if (b.type === "page" || b.type === "linkToPage") inner = <PageRow spaceId={String(props.spaceId ?? "")} linked={b.type === "linkToPage"} />;
  else if (b.type === "columnList") inner = <div className="spaces-column-list" />;
  else if (b.type === "column")
    inner = (
      <div className="spaces-column">
        <div className="spaces-column-resizer" contentEditable={false} />
      </div>
    );
  else if (b.type === "applet")
    // The reserved frame only: the Applet itself mounts in the editor once the block scrolls into view.
    inner = (
      <div className="spaces-applet" data-applet-block={String(readData(props.data).appletId ?? "")} data-mode="frame">
        <AppletFrame height={appletBlockHeight(readData(props.data))} />
      </div>
    );
  else if (b.type === "database") {
    const p = readData(props.data);
    inner = (
      <DatabaseHost blockId={b.id} layout={activeLayout(p)} painted={paintedSizesOf(p)} serverDrawn>
        <Suspense fallback={<div className="spaces-db-loading" />}>
          <SeededDatabase blockId={b.id} p={p} />
        </Suspense>
      </DatabaseHost>
    );
  }
  return (
    <div className={`react-renderer node-${b.type} bn-react-node-view-renderer`} contentEditable={false}>
      <div className="bn-block-content" data-content-type={b.type} {...contentAttrs(b)} data-node-view-wrapper="" style={{ whiteSpace: "normal" }}>
        {inner}
      </div>
    </div>
  );
}

function Group({ blocks, numDepth = 0 }: { blocks: EngineBlock[]; numDepth?: number }) {
  let run = 0;
  return (
    <div className="bn-block-group" data-node-type="blockGroup">
      {blocks.map((b) => {
        const start = Number(b.props?.start);
        run = b.type === "numberedListItem" ? (run === 0 && Number.isFinite(start) && start > 0 ? start : run + 1) : 0;
        const content = REACT_BLOCKS.has(b.type) ? <ReactBlock b={b} /> : PLAIN_BLOCKS.has(b.type) ? <Plain b={b} index={b.type === "numberedListItem" ? run : undefined} depth={numDepth} /> : <div className="bn-block-content" data-content-type={b.type} />;
        return (
          <div key={b.id} className="bn-block-outer" data-node-type="blockOuter" data-id={b.id}>
            <div className="bn-block" data-node-type="blockContainer" data-id={b.id}>
              {content}
              {b.children?.length ? <Group blocks={b.children} numDepth={b.type === "numberedListItem" ? numDepth + 1 : numDepth} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Each database block's stored painted height, held by CSS per window width (the server knows no width):
 * the same sizes the editor's first frame holds (`pickPainted` by window width), as media rules.
 */
function paintedCss(blocks: EngineBlock[]): string {
  const rules: string[] = [];
  const walk = (list: EngineBlock[]) => {
    for (const b of list) {
      if (b.type === "database") {
        const sizes = paintedSizesOf(readData(b.props?.data));
        for (const size of sizes) {
          if (!size.vw) continue;
          const id = b.id.replace(/["\\]/g, "\\$&");
          // A chart tile's height does not follow the window: a width nobody saved at holds the first stored size.
          if (size === sizes[0] && activeLayout(readData(b.props?.data)) === "chart") rules.push(`.spaces-static-body .bn-block-outer[data-id="${id}"] .spaces-db-host{min-height:${size.h}px}`);
          rules.push(`@media (min-width:${size.vw - PAINTED_WIDTH_SLACK}px) and (max-width:${size.vw + PAINTED_WIDTH_SLACK}px){.spaces-static-body .bn-block-outer[data-id="${id}"] .spaces-db-host{min-height:${size.h}px}}`);
        }
      }
      if (b.children?.length) walk(b.children);
    }
  };
  walk(blocks);
  return rules.join("\n");
}

/** The page's stored blocks, read-only, as the editor will draw them. */
export function StaticSpaceBody({ blocks }: { blocks: SpaceBlock[] }) {
  const dark = useDarkMode();
  const engine = toEngine(blocks) as unknown as EngineBlock[];
  return (
    <div className="spaces-static-body">
      <style>{`${columnCss(engine)}\n${paintedCss(engine)}`}</style>
      <div className={`bn-root bn-container ${dark ? "dark" : "light"} bn-shadcn spaces-editor`} data-color-scheme={dark ? "dark" : "light"}>
        <div className="ProseMirror bn-editor bn-default-styles" translate="no">
          <Group blocks={engine} />
        </div>
      </div>
    </div>
  );
}
