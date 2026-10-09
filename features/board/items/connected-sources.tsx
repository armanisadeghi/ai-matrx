"use client";

/**
 * LINES ARE CONTEXT, on the chat tile's side. A line between a tile and a chat tile (either
 * direction) makes that tile a CONNECTED SOURCE of the chat: its full values ride in the chat's own
 * context (`tools/tile-context.ts`), and the chat tile's header shows who is connected as small
 * chips (click one to fly to that tile; its x takes the line away).
 *
 * `TileLinks` is the board's side of it, provided by `UserBoard`; a board without it (a demo, a
 * guest board) shows no chips and sends no entry.
 */

import { createContext, useContext, useEffect, useEffectEvent, useRef, useSyncExternalStore } from "react";
import { Link2, X } from "lucide-react";
import { removeContextEntry, setContextEntries } from "@ai-matrx/chat/agents/redux/execution-system/instance-context/instance-context.slice";
import type { CanvasContextEntry } from "@ai-matrx/chat/canvas/workspace/CanvasChatColumn";
import { useAppStore } from "@/lib/redux/hooks";
import { cn } from "@/lib/utils";
import type { BoardConnection } from "../board/board-store";
import type { BoardTileBase } from "../board/useBoard";
import {
  buildTileContext,
  CONNECTED_CONTEXT_KEY,
  connectedTileIds,
  type TileContextEntry,
  type TileContextHost,
} from "../tools/tile-context";

export interface ConnectedSource {
  id: string;
  title: string;
}

export interface TileLinks {
  subscribe: (listener: () => void) => () => void;
  /** The tile's connected sources as one stable string (a `useSyncExternalStore` snapshot). */
  snapshot: (tileId: string) => string;
  /** Fly to a tile and select it. */
  focus: (id: string) => void;
  /** Take away every line between two tiles. */
  disconnect: (a: string, b: string) => void;
  /** This tile's context entry now, or null when no line touches it. */
  context: (tileId: string) => Promise<TileContextEntry | null>;
}

const TileLinksContext = createContext<TileLinks | null>(null);
export const TileLinksProvider = TileLinksContext.Provider;
export const useTileLinks = (): TileLinks | null => useContext(TileLinksContext);

const SEP_ITEM = "\u0002";
const SEP_FIELD = "\u0001";

/** The links of one board: reads at call time, so the host it closes over may change every render. */
export function createTileLinks<T extends BoardTileBase & { title: string }>(args: {
  board: {
    read: () => { tiles: T[]; connections: readonly BoardConnection[] };
    subscribe: (listener: () => void) => () => void;
    disconnect: (id: string) => void;
  };
  host: () => TileContextHost<T>;
  focus: (id: string) => void;
}): TileLinks {
  const { board } = args;
  return {
    subscribe: board.subscribe,
    snapshot: (tileId) => {
      const now = board.read();
      const titles = new Map(now.tiles.map((t) => [t.id, t.title]));
      return connectedTileIds(now.connections, tileId)
        .filter((id) => titles.has(id))
        .map((id) => `${id}${SEP_FIELD}${titles.get(id)}`)
        .join(SEP_ITEM);
    },
    focus: args.focus,
    disconnect: (a, b) => {
      for (const c of board.read().connections) {
        if ((c.from === a && c.to === b) || (c.from === b && c.to === a)) board.disconnect(c.id);
      }
    },
    context: (tileId) => buildTileContext(tileId, args.host()),
  };
}

const parse = (snapshot: string): ConnectedSource[] =>
  snapshot === ""
    ? []
    : snapshot.split(SEP_ITEM).map((entry) => {
        const [id, title] = entry.split(SEP_FIELD);
        return { id, title: title ?? "" };
      });

/** The tiles joined to this tile by a line, in either direction. */
export function useConnectedSources(tileId: string): ConnectedSource[] {
  const links = useTileLinks();
  const snapshot = useSyncExternalStore(
    links ? links.subscribe : noopSubscribe,
    () => (links ? links.snapshot(tileId) : ""),
    () => "",
  );
  return parse(snapshot);
}
const noopSubscribe = () => () => {};

/**
 * Keeps ONE chat tile's context entry true: written when a line is drawn, rewritten when the chat is
 * focused or about to send (the chat column calls the returned function in the capture phase of every
 * pointerdown / Enter / focus, so a note edited since is read fresh), removed when the last line goes.
 * Returns the chat column's `getCanvasContext`, or undefined when nothing is connected.
 */
export function useConnectedChatContext(
  tileId: string,
  conversationId: string | null,
): (() => CanvasContextEntry) | undefined {
  const links = useTileLinks();
  const store = useAppStore();
  const sources = useConnectedSources(tileId);
  const key = sources.map((s) => `${s.id}:${s.title}`).join("|");
  const cache = useRef<TileContextEntry | null>(null);
  const latest = useRef(0);
  const refresh = useEffectEvent(async () => {
    if (!links || !conversationId) return;
    const mine = ++latest.current;
    const entry = await links.context(tileId);
    // A newer refresh (a line drawn or removed meanwhile) already answered.
    if (mine !== latest.current) return;
    cache.current = entry;
    if (entry) store.dispatch(setContextEntries({ conversationId, entries: [entry] }));
    else store.dispatch(removeContextEntry({ conversationId, key: CONNECTED_CONTEXT_KEY }));
  });
  useEffect(() => {
    void refresh();
  }, [links, conversationId, key]);

  if (sources.length === 0) return undefined;
  return () => {
    void refresh();
    return (
      cache.current ?? {
        key: CONNECTED_CONTEXT_KEY,
        type: "json",
        label: "Sources connected to this chat",
        value: { reading: sources.map((s) => ({ id: s.id, title: s.title })) },
      }
    );
  };
}

/** Header chips: how many sources are connected, and which. Lives in the tile's existing header. */
export function ConnectedSourceChips({ tileId, width }: { tileId: string; width: number }) {
  const links = useTileLinks();
  const sources = useConnectedSources(tileId);
  if (!links || sources.length === 0) return null;
  // Names only where there is room; the count always shows.
  const shown = width >= 520 ? sources.slice(0, 2) : [];
  const more = sources.length - shown.length;
  return (
    <div data-board-connected-chips className="flex min-w-0 items-center gap-1">
      {shown.map((s) => (
        <span
          key={s.id}
          className="group flex h-6 max-w-[8rem] min-w-0 items-center gap-0.5 rounded-md bg-primary/10 pl-1.5 pr-0.5 text-[11px] text-primary-ink"
        >
          <button
            type="button"
            title={`Go to "${s.title}"`}
            onClick={() => links.focus(s.id)}
            className="min-w-0 truncate hover:underline"
          >
            {s.title || "Untitled"}
          </button>
          <button
            type="button"
            title={`Take away the line to "${s.title}"`}
            aria-label={`Disconnect ${s.title}`}
            onClick={() => links.disconnect(tileId, s.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-50 hover:bg-primary/15 hover:opacity-100"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {(more > 0 || shown.length === 0) && (
        <button
          type="button"
          title={`Connected: ${sources.map((s) => s.title || "Untitled").join(", ")}`}
          onClick={() => links.focus((sources[shown.length] ?? sources[0]).id)}
          className={cn(
            "flex h-6 items-center gap-1 rounded-md bg-primary/10 px-1.5 text-[11px] text-primary-ink hover:bg-primary/15",
          )}
        >
          <Link2 className="h-3 w-3" />
          {shown.length === 0 ? sources.length : `+${more}`}
        </button>
      )}
    </div>
  );
}
