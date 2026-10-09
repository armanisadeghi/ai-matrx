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
import type { EntityTypeToken } from "@ai-matrx/associations";
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

/** What a type's `HeaderAction` receives: the tile's header button slot. */
export interface HeaderActionProps {
  tileId: string;
  source: NodeSource;
  /** The tile's width in board px. */
  width: number;
  onSource: (next: NodeSource, title?: string) => void;
}

export interface PickerProps {
  /** Put these on the board. */
  onPick: (items: PlacedItem[]) => void;
  onCancel: () => void;
}

export type BoardItemGroup = "work" | "content" | "media" | "features";

/** A type's colour on the board (its card at far zoom, its kind label). Tokens
 * `--board-accent-<name>` in `components/board-accents.css`, light and dark. */
export const BOARD_ACCENTS = [
  "blue",
  "amber",
  "slate",
  "indigo",
  "emerald",
  "teal",
  "rose",
  "cyan",
  "violet",
  "orange",
  "pink",
  "lime",
] as const;
export type BoardAccent = (typeof BOARD_ACCENTS)[number];

/** How a status reads: a tone (semantic colour) and one or two words. */
export type ItemStatusTone = "neutral" | "active" | "attention" | "success" | "danger";
export interface ItemStatus {
  tone: ItemStatusTone;
  /** One or two words: "In progress", "Replying", "Live". */
  label: string;
}

/**
 * The item's real state on its tile (header chip; the card at far zoom).
 * `useStatus` is a HOOK, called in one leaf per tile: it reads only what the app
 * already holds (Redux, kept answers) — never a network read per tile. Return
 * null when the item is at rest and there is nothing to say (a saved note, an
 * idle chat). A type with no state of its own says why in `none`.
 * `basics` are the tile's saved values: a type whose live state is not loaded
 * at overview (the store is filled by the tile's own mount) falls back to them
 * instead of showing nothing.
 */
export type ItemStatusDoor = { useStatus: (source: NodeSource, basics?: ItemBasicValues | null) => ItemStatus | null } | { none: string };

/** The tile's saved `basics.values` (`BoardNode.basics`): what the item last said about itself, kept per node. */
export type ItemBasicValues = Readonly<Record<string, unknown>>;

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
 * way it shows a bring-in picker, and places what it picks. `Dialog` is for a
 * feature whose canonical create form IS a dialog (a meeting): the board
 * mounts it bare, never inside a second dialog, and places what it saves.
 */
export type StartNewEntry =
  | { label: string; icon?: LucideIcon; create: () => PlacedItem }
  | { label: string; icon?: LucideIcon; Picker: ComponentType<PickerProps> }
  | { label: string; icon?: LucideIcon; Dialog: ComponentType<PickerProps> };

/** The record a tile's comments live on: its own thread — the same one its page shows. */
export interface CommentRecord {
  /** Platform entity token (`task`, `note`, `conversation` …), never the item key. */
  token: EntityTypeToken;
  id: string;
}

/** `comments` for an item whose source is `{ kind: "entity", id }`: that record, once it exists. */
export function entityComments(token: EntityTypeToken) {
  return (source: NodeSource): CommentRecord | null =>
    source.kind === "entity" && source.id ? { token, id: source.id } : null;
}

export interface BoardItemType {
  /** Registry key. For entity sources it equals `source.entity`. */
  key: string;
  /** Singular noun shown in menus: "Chat", "Note", "File". */
  label: string;
  icon: LucideIcon;
  group: BoardItemGroup;
  /** The type's colour on the board (see `BoardAccent`). */
  accent: BoardAccent;
  /** The item's live state on its tile (see `ItemStatusDoor`). */
  status: ItemStatusDoor;
  defaultSize: { w: number; h: number };
  /** Does this type render that saved source? */
  matches: (source: NodeSource) => boolean;
  /** The tile body — the feature's canonical component. */
  Body: ComponentType<ItemBodyProps>;
  /** The feature's agent surface for the tile's record (see `ItemSurface`). */
  surface: ItemSurface;
  /**
   * Where comments on the tile live. A record item names its record's own
   * thread (`entityComments(token)`; null while the record does not exist).
   * `null` = board-only content, or a record type with no thread of its own:
   * the tile's comment door posts on the BOARD and says so.
   */
  comments: ((source: NodeSource) => CommentRecord | null) | null;
  /**
   * "Start something new" — one entry, or several ways to start the same
   * kind of thing (a chat, and a chat with an agent you pick). Each entry is
   * an Add-menu and Start-panel item of its own. Omit when the type has no
   * "new". See `StartNewEntry`.
   */
  startNew?: StartNewEntry | readonly StartNewEntry[];
  /** "Bring in what you have": a picker over the person's existing records. */
  bringIn?: { label: string; Picker: ComponentType<PickerProps> };
  /**
   * The AGENT'S door to this type's existing records (`board_add_items`, `board_find_records`).
   * `place` is the ONE builder the bring-in picker also calls, so an agent's tile and a person's
   * pick are the same source. Omit for a type whose record cannot be named by one id.
   */
  record?: RecordDoor;
  /** Where the tile's "Open" goes (no dead ends). Null when it has no page. */
  href?: (source: NodeSource) => string | null;
  /** A word for agents' `board_read` ("chat", "note", "file"…). Defaults to `key`. */
  kindLabel?: string;
  /**
   * Mounted for as long as the tile is on the board, OUTSIDE the part that
   * sleeps (a frozen or discarded tile's body runs nothing): what must outlive
   * the body — a chat holds its live run (LIVE-RUN-RETENTION.md) and keeps
   * the tile awake while it is replying.
   */
  Keep?: ComponentType<{ tileId: string; source: NodeSource }>;
  /** A button in the tile's EXISTING header (never a new row): the chat's conversation-list toggle. */
  HeaderAction?: ComponentType<HeaderActionProps>;
  /** The body reads `tier` (pauses media, paces streams). Others get a constant,
   * so a zoom across a tier boundary never re-renders their content. */
  usesTier?: boolean;
  /**
   * The body is proven to wake correctly after a freeze (every effect re-runs;
   * nothing resets or reloads its own state), so an unneeded tile may sleep.
   * Opt in per type, after checking it in the browser.
   */
  sleeps?: boolean;
  /** Works for a meeting guest with no account (board-only content, the meeting's own parts).
   * A guest's board offers only these to add. */
  guestSafe?: boolean;
}

/** One of the person's records an agent found, ready for `board_add_items`. */
export interface FoundRecord {
  /** The catalog key (`BoardItemType.key`). */
  type: string;
  id: string;
  title: string;
  updated_at: string | null;
  snippet?: string;
}

export interface RecordDoor {
  /** An existing record by id, placed exactly as this type's bring-in picker places it. */
  place: (id: string, title?: string) => PlacedItem;
  /**
   * The search projection's entity token for this type (`platform.search_items`, the index
   * `knowledge_search` reads). Set when the projection holds the type.
   */
  searchToken?: string;
  /**
   * For a type the projection does not hold: the person's records through the bring-in picker's
   * OWN list service (every organization, never the active one), matched on the name. Trashed and
   * archived records are left out.
   */
  find?: (query: string, limit: number) => Promise<FoundRecord[]>;
}

/** Every way to start a new item of this type, in menu order (none → []). */
export function startNewEntries(type: BoardItemType): readonly StartNewEntry[] {
  if (!type.startNew) return [];
  return "label" in type.startNew ? [type.startNew] : type.startNew;
}
