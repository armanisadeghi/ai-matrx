/**
 * BOARD ITEMS — the one contract every feature implements to live on a board.
 *
 * A person's board (the master "Board", `/board`) holds ANYTHING the platform
 * supports: a chat, a note, a file, a task, a War Room, a meeting, a workflow
 * run, a write-up, a web page, an image… Each of those is ONE registered
 * `BoardItemType`: how to start a new one, how to bring in an existing one,
 * and the tile body — which is ALWAYS the feature's canonical component (the
 * real chat column, the real note editor, the real file viewer), never a
 * board-only copy.
 *
 * Register a type once (`catalog.ts`) and every board's Add menu, drop, paste
 * and agent tools offer it. That is how the board pushes the platform to
 * adopt everything.
 *
 * Saved form: a tile's `source` (`board/document.ts` `NodeSource`) — a
 * REFERENCE to the thing (`{ kind: "entity", entity: "note", id }`), never a
 * copy of its state. Opening a board re-mounts each source.
 */

import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { NodeSource } from "../board/document";
import type { PaceTier } from "../engine/lod";

/** What an Add action puts on the board. Position is decided by the board. */
export interface PlacedItem {
  title: string;
  source: NodeSource;
  /** Tile size in board px; the type's `defaultSize` when omitted. */
  size?: { w: number; h: number };
}

export interface ItemBodyProps {
  /** The tile's id on the board (not the record's). */
  tileId: string;
  source: NodeSource;
  title: string;
  /** Zoom pace tier — bodies that stream pass it to `StreamTileBody`. */
  tier: PaceTier;
  /** The tile is INTERACTING: its content owns pointer and keyboard. */
  interacting: boolean;
  /**
   * The body changed what the tile refers to (a draft note got its record id,
   * a new chat got its conversation id) or its title. Saved with the board,
   * outside the undo stack (undoing it would orphan the record).
   */
  onSource: (next: NodeSource, title?: string) => void;
}

export interface PickerProps {
  /** Put these on the board. */
  onPick: (items: PlacedItem[]) => void;
  onCancel: () => void;
}

export type BoardItemGroup = "work" | "content" | "media" | "features";

/**
 * The feature's OWN agent surface for the record in a tile — the same values,
 * write targets and client tools its page has, so an agent can do on the board
 * exactly what it can do on the feature's page. The board keeps every tile's
 * surface DORMANT (`SurfaceActivity`) except the LIVE tile — the one selected,
 * being worked in, or focused — so exactly one copy of a surface registers.
 */
export type ItemSurface =
  | {
      /** A registered manifest's `surfaceName` (features/surfaces/manifests). */
      name: string;
      /**
       * Mounts that surface for this record — the SAME host component the
       * feature's page uses. Omit when `Body` (the canonical component)
       * already mounts the provider itself (e.g. `NoteContentEditor`).
       */
      Host?: ComponentType<{ source: NodeSource; children: ReactNode }>;
    }
  | {
      /** Board-only content with no feature behind it (a label, a web page):
       * why it has no surface. The board's own tools edit it. Never for a
       * record — a record item without its surface is a defect. */
      none: string;
    };

/**
 * One way to start a new item. `create` is synchronous and cheap: return the
 * item to place NOW (a draft note, a new chat that opens its conversation when
 * mounted), so the person can start immediately. `Picker` is for a start that
 * needs ONE choice first (which agent to chat with) — the board shows it the
 * way it shows a bring-in picker, and places what it picks.
 */
export type StartNewEntry =
  | { label: string; icon?: LucideIcon; create: () => PlacedItem }
  | { label: string; icon?: LucideIcon; Picker: ComponentType<PickerProps> };

export interface BoardItemType {
  /** Registry key. For entity sources it equals `source.entity`. */
  key: string;
  /** Singular noun shown in menus: "Chat", "Note", "File". */
  label: string;
  icon: LucideIcon;
  group: BoardItemGroup;
  defaultSize: { w: number; h: number };
  /** Does this type render that saved source? */
  matches: (source: NodeSource) => boolean;
  /** The tile body — the feature's canonical component. */
  Body: ComponentType<ItemBodyProps>;
  /** The feature's agent surface for the tile's record (see `ItemSurface`). */
  surface: ItemSurface;
  /**
   * "Start something new" — one entry, or several ways to start the same
   * kind of thing (a chat, and a chat with an agent you pick). Each entry is
   * an Add-menu and Start-panel item of its own. Omit when the type has no
   * "new". See `StartNewEntry`.
   */
  startNew?: StartNewEntry | readonly StartNewEntry[];
  /** "Bring in what you have": a picker over the person's existing records. */
  bringIn?: { label: string; Picker: ComponentType<PickerProps> };
  /** Where the tile's "Open" goes (no dead ends). Null when it has no page. */
  href?: (source: NodeSource) => string | null;
  /** A word for agents' `board_read` ("chat", "note", "file"…). Defaults to `key`. */
  kindLabel?: string;
}

/** Every way to start a new item of this type, in menu order (none → []). */
export function startNewEntries(type: BoardItemType): readonly StartNewEntry[] {
  if (!type.startNew) return [];
  return "label" in type.startNew ? [type.startNew] : type.startNew;
}
