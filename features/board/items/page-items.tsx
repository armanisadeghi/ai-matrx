"use client";

/**
 * Page — ANY page of the app, on the board.
 *
 * Every feature is meant to become a native item (its canonical component in
 * the tile, its surface reachable by agents — the board-items skill). Until a
 * feature is one, its own page still belongs on the board: the page runs in
 * the tile as the app itself, framed by the app's own origin, without the
 * shell's sidebar and header (`<html data-board-embed>`, styles/shell.css
 * §13d). It is how "anything can be added" holds today, and where a tile's
 * link to another page lands (engine/tile-navigation.tsx) instead of
 * replacing the board.
 *
 * Saved as a reference to the address (`entity: "page"`, `id` = path + query),
 * so `recordKeyOf` shows an existing tile instead of opening the page twice.
 * Known gap (agents): the page's own surface registers inside the frame, so
 * the board's agent sees it by title only.
 */

import { useState } from "react";
import { AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system/controls";
import { cn } from "@/lib/utils";
import type { NodeSource } from "../board/document";
import type { BoardItemType, ItemBodyProps, PickerProps } from "./types";

export const PAGE_ENTITY = "page";

/** The app path for `value` (a path or an address on this site), or null; never a board. */
export function appPagePath(value: string, origin: string): string | null {
  const raw = value.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.startsWith("/") ? raw : raw.includes("://") ? raw : `/${raw}`, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null;
  // A board inside a board has nothing to add and frames itself forever.
  if (url.pathname === "/board" || url.pathname.startsWith("/board/")) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** A tile title for a path before the page names itself. */
export function pageTitleFor(path: string): string {
  const last = path.split(/[?#]/)[0].split("/").filter(Boolean).pop() ?? "Page";
  const words = decodeURIComponent(last).replace(/[-_]+/g, " ");
  return words.length > 40 || /^[0-9a-f-]{20,}$/i.test(last) ? "Page" : words.charAt(0).toUpperCase() + words.slice(1);
}

export function pageSource(path: string): NodeSource {
  return { kind: "entity", entity: PAGE_ENTITY, id: path };
}

function pagePathOf(source: NodeSource): string | null {
  return source.kind === "entity" && source.entity === PAGE_ENTITY ? source.id : null;
}

/** The framed page's own title (without the app suffix), or null when unreadable. */
function frameTitle(frame: HTMLIFrameElement): string | null {
  try {
    return frame.contentDocument?.title?.split(" — ")[0]?.trim() || null;
  } catch {
    return null;
  }
}

function PageBody({ source, title, interacting, onSource }: ItemBodyProps) {
  const path = pagePathOf(source);
  if (!path) return null;
  return (
    <div className="relative h-full overflow-hidden bg-background">
      <iframe
        title={title}
        src={path}
        // The app itself: same origin, so the page is signed in as the person.
        allow="camera; microphone; display-capture; fullscreen; clipboard-read; clipboard-write; autoplay"
        className={cn("absolute inset-0 h-full w-full max-w-none border-0", !interacting && "pointer-events-none")}
        onLoad={(e) => {
          // The page names itself; the tile follows (same origin, readable).
          const named = frameTitle(e.currentTarget);
          if (named && named !== title) onSource(source, named);
        }}
      />
    </div>
  );
}

function PagePicker({ onPick, onCancel }: PickerProps) {
  const [value, setValue] = useState("");
  const path = typeof window === "undefined" ? null : appPagePath(value, window.location.origin);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (path) onPick([{ title: pageTitleFor(path), source: pageSource(path) }]);
      }}
    >
      <label className="text-sm font-medium text-foreground" htmlFor="board-page-input">
        Page address
      </label>
      <Input
        id="board-page-input"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="/meetings or a link to any page here"
      />
      {value.trim() && !path && <p className="text-xs text-destructive">Not a page of this app.</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" disabled={!path}>
          Add to board
        </Button>
      </div>
    </form>
  );
}

export const PAGE_ITEMS: BoardItemType[] = [
  {
    key: PAGE_ENTITY,
    surface: { none: "The page's own surface registers inside its frame; the board sees it by title." },
    comments: null,
    label: "Page",
    icon: AppWindow,
    group: "content",
    section: "media",
    accent: "slate",
    status: { none: "A framed app page has no state of its own." },
    defaultSize: { w: 1100, h: 760 },
    matches: (s) => pagePathOf(s) !== null,
    Body: PageBody,
    bringIn: { label: "Page", Picker: PagePicker },
    href: (s) => pagePathOf(s),
    kindLabel: "page",
  },
];
