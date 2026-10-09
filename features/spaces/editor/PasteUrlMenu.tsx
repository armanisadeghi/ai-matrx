"use client";

// features/spaces/editor/PasteUrlMenu.tsx — B12: pasting a lone URL puts it in as a link and offers
// Notion's choice beside it: keep it a Link, Mention (a Space's address or any link), Bookmark or Embed —
// and, for one of our `/applets/<slug>` links, "Embed Applet" (the live Applet block).

import { AppWindow, AtSign, Bookmark, Code2, Link2 } from "lucide-react";
import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

import { readAppletBySlug } from "@/features/applets/embed/appletsPort";
import { isReservedAppletSlug } from "@/features/applets/reserved-slugs";
import { toast } from "@/lib/toast";

import type { SpacesEditor } from "./schema";

export interface PastedUrl {
  url: string;
  blockId: string;
  /** The block held nothing but the link after the paste: Bookmark / Embed replace it. */
  alone: boolean;
  at: { left: number; top: number };
}

const URL_ONLY = /^https?:\/\/\S+$/i;

/** Where the choice menu opens: just under the pasted link (the caret's box). Not a selection popup. */
export function pastedAnchor(): { left: number; top: number } {
  const rect = window.getSelection()?.getRangeAt(0)?.getBoundingClientRect();
  return { left: rect?.left ?? 0, top: (rect?.bottom ?? 0) + 6 };
}

/** A clipboard holding one URL and nothing else (an HTML copy of a lone link counts). */
export function pastedUrl(event: ClipboardEvent): string | null {
  const text = event.clipboardData?.getData("text/plain").trim() ?? "";
  return URL_ONLY.test(text) ? text : null;
}

/** The Space a pasted address opens, when it is one of ours. */
export function spaceIdOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (typeof window !== "undefined" && u.host !== window.location.host) return null;
    const m = /^\/spaces\/([0-9a-f-]{36})\/?$/i.exec(u.pathname);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Our hosts an Applet link may come from: this app, and the public site (www.aimatrx.com / aimatrx.com). */
const APPLET_HOSTS = /^(?:www\.)?aimatrx\.com$/i;

/** The Applet slug a pasted address opens, when it is one of ours (`/applets/<slug>`). */
export function appletSlugOf(url: string, here: string | null = typeof window !== "undefined" ? window.location.host : null): string | null {
  try {
    const u = new URL(url);
    if (u.host !== here && !APPLET_HOSTS.test(u.host)) return null;
    const m = /^\/applets\/([A-Za-z0-9][A-Za-z0-9_-]*)\/?$/.exec(u.pathname);
    return m && !isReservedAppletSlug(m[1]) ? m[1] : null;
  } catch {
    return null;
  }
}

/** Swap the pasted link for the Applet block it names (read as the viewer; one she cannot open is said so). */
async function toAppletBlock(editor: SpacesEditor, p: PastedUrl, slug: string) {
  let app: Awaited<ReturnType<typeof readAppletBySlug>> = null;
  try {
    app = await readAppletBySlug(slug);
  } catch {
    toast.error("The Applet could not be read.");
    return;
  }
  if (!app) {
    toast.error("This Applet has not been shared with you.");
    return;
  }
  const block = { type: "applet", props: { data: JSON.stringify({ props: { appletId: app.id } }) } } as never;
  if (p.alone) editor.replaceBlocks([p.blockId], [block]);
  else {
    swapLink(editor, p.blockId, p.url, []);
    editor.insertBlocks([block], p.blockId, "after");
  }
}

/** B12 — a web address as Notion's link mention: favicon + the page's name (its host and path until a title is known). */
function linkMentionSpan(url: string) {
  let title = url;
  let icon: string | undefined;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, "");
    title = `${u.host.replace(/^www\./, "")}${path}`;
    icon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.host)}&sz=64`;
  } catch {
    /* keep the raw address */
  }
  return { text: title, mention: { kind: "link", url, title, ...(icon ? { icon } : {}) } };
}

type InlineItem = { type: string; href?: string; content?: unknown; props?: Record<string, unknown> };

/** The block's inline content without the last link to `url`, plus `replacement` in its place. */
function swapLink(editor: SpacesEditor, blockId: string, url: string, replacement: InlineItem[]) {
  const block = editor.getBlock(blockId);
  const content = (block?.content ?? []) as InlineItem[];
  if (!block || !Array.isArray(content)) return;
  const at = content.map((c) => c.type === "link" && c.href === url).lastIndexOf(true);
  if (at < 0) return;
  editor.updateBlock(blockId, { content: [...content.slice(0, at), ...replacement, ...content.slice(at + 1)] } as never);
}

function toBlock(editor: SpacesEditor, p: PastedUrl, type: "bookmark" | "embed") {
  const block = { type, props: { data: JSON.stringify({ props: { url: p.url } }) } } as never;
  if (p.alone) {
    editor.replaceBlocks([p.blockId], [block]);
  } else {
    swapLink(editor, p.blockId, p.url, []);
    editor.insertBlocks([block], p.blockId, "after");
  }
}

const GAP = 4;
const EDGE = 8;

/** The pasted link on the page (the last one with that address in its block), else null. */
function linkElement(blockId: string, url: string): HTMLElement | null {
  const block = document.querySelector(`.bn-block[data-id="${CSS.escape(blockId)}"]`);
  const links = block ? Array.from(block.querySelectorAll<HTMLAnchorElement>("a[href]")).filter((a) => a.getAttribute("href") === url) : [];
  return links[links.length - 1] ?? null;
}

export function PasteUrlMenu({ editor, pasted, onClose }: { editor: SpacesEditor; pasted: PastedUrl; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const spaceId = spaceIdOf(pasted.url);
  const appletSlug = appletSlugOf(pasted.url);
  // Notion's placement: under the pasted link's first line, left edges aligned; above it when the room
  // below is short; kept inside the window; it follows the link as the page scrolls.
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const link = linkElement(pasted.blockId, pasted.url);
      const rects = link ? Array.from(link.getClientRects()) : [];
      const first = rects[0];
      const last = rects[rects.length - 1];
      const anchor = first && last ? { left: first.left, top: first.top, bottom: last.bottom } : { left: pasted.at.left, top: pasted.at.top - 6, bottom: pasted.at.top - 6 };
      const h = el.offsetHeight;
      const w = el.offsetWidth;
      const below = window.innerHeight - anchor.bottom - GAP - EDGE;
      const top = below >= h || below >= anchor.top ? anchor.bottom + GAP : anchor.top - GAP - h;
      const left = Math.min(Math.max(EDGE, anchor.left), window.innerWidth - w - EDGE);
      // Written to the menu's own style (it is ours, not ProseMirror's), so following a scroll re-renders nothing.
      // Scrolled out of the window with its link, it is not drawn pinned to the edge.
      const offscreen = anchor.bottom < 0 || anchor.top > window.innerHeight;
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      if (offscreen) delete el.dataset.placed;
      else el.dataset.placed = "true";
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [pasted]);

  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") e.preventDefault();
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", away, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("mousedown", away, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [onClose]);

  const pick = (fn: () => void) => () => {
    fn();
    onClose();
    editor.focus();
  };

  // In the body, above the page: inside the editor it sat under the title's stacking layer when flipped up.
  return createPortal(
    <div ref={ref} role="menu" aria-label="Paste as" className="spaces-paste-menu">
      <button type="button" role="menuitem" className="spaces-paste-item" onClick={pick(() => undefined)}>
        <Link2 size={16} />
        Link
      </button>
      <button
        type="button"
        role="menuitem"
        className="spaces-paste-item"
        onClick={pick(() => {
          const span = spaceId ? { text: pasted.url, mention: { kind: "space", spaceId } } : linkMentionSpan(pasted.url);
          swapLink(editor, pasted.blockId, pasted.url, [{ type: "inlineMention", props: { span: JSON.stringify(span) } }]);
        })}
      >
        <AtSign size={16} />
        Mention
      </button>
      <button type="button" role="menuitem" className="spaces-paste-item" onClick={pick(() => toBlock(editor, pasted, "bookmark"))}>
        <Bookmark size={16} />
        Bookmark
      </button>
      <button type="button" role="menuitem" className="spaces-paste-item" onClick={pick(() => toBlock(editor, pasted, "embed"))}>
        <Code2 size={16} />
        Embed
      </button>
      {appletSlug ? (
        <button type="button" role="menuitem" className="spaces-paste-item" onClick={pick(() => void toAppletBlock(editor, pasted, appletSlug))}>
          <AppWindow size={16} />
          Embed Applet
        </button>
      ) : null}
    </div>,
    document.body,
  );
}
