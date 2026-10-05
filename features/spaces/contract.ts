// features/spaces/contract.ts — THE SPACES CONTRACT (owner session, 2026-10-05).
//
// The few doors every Spaces screen talks through. The builder lane copies Notion on top of these and
// may ADD block types and block props; the four ports below are the seams the owner session fills with
// real implementations (database table, live data sources, AI) without touching the builder's UI.
//
//   SpacesStore   — load / save / list / archive Spaces (in memory now; Supabase table later)
//   SpacesDataPort — the RecordsConfig a data block mounts on (in-memory sample data now; live later)
//   SpacesAiPort  — the AI surfaces (Ask AI, selection actions, AI block) call this; unwired = says so
//
// No permission logic lives here or anywhere in the fence: the database decides who can open what;
// blocks are filters only. Delete always means archive.

import type { RecordsConfig } from "@ai-matrx/records";

/** Stable ids: crypto.randomUUID() at creation, never reused. */
export type SpaceId = string;
export type BlockId = string;

/** Notion's ten colors; "default" = none. Text and background are separate choices. */
export type SpaceColor = "default" | "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";

/** A run of inline text with marks — the content of every text-bearing block. */
export interface RichSpan {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  color?: SpaceColor;
  background?: SpaceColor;
  link?: string;
  /** Inline mention: a Space, a person or a date. */
  mention?: { kind: "space"; spaceId: SpaceId } | { kind: "person"; userId: string } | { kind: "date"; iso: string };
  equation?: string;
}

/**
 * One block. `type` names the block (parity checklist § C); `props` holds that block's own settings;
 * `children` holds nested blocks (indent, toggle body, column contents, callout body, synced copy).
 * The builder owns the `type` list and each `props` shape — add, never rename once stored.
 */
export interface SpaceBlock<P extends Record<string, unknown> = Record<string, unknown>> {
  id: BlockId;
  type: string;
  text?: RichSpan[];
  color?: SpaceColor;
  background?: SpaceColor;
  props?: P;
  children?: SpaceBlock[];
}

/** A Space's media: an uploaded file id (our file handler) or an external URL. Never a signed URL. */
export type SpaceMedia = { fileId: string } | { url: string } | { icon: string };

export interface SpaceDoc {
  id: SpaceId;
  /** Parent Space; null = top level of the person's tree. Children inherit access in the database. */
  parentId: SpaceId | null;
  /** Order among siblings (fractional index string). */
  position: string;
  title: string;
  icon?: SpaceMedia | null;
  cover?: (SpaceMedia & { offsetY?: number }) | null;
  settings: {
    font: "default" | "serif" | "mono";
    smallText: boolean;
    fullWidth: boolean;
    locked: boolean;
  };
  blocks: SpaceBlock[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string | null;
}

/** A row of the sidebar tree — no blocks. */
export type SpaceSummary = Pick<SpaceDoc, "id" | "parentId" | "position" | "title" | "icon" | "isArchived" | "updatedAt">;

export interface SpacesStore {
  /** Which store this is — the UI shows a "sample data, not saved" marker when kind is "memory". */
  readonly kind: "memory" | "database";
  list(options?: { includeArchived?: boolean }): Promise<SpaceSummary[]>;
  get(id: SpaceId): Promise<SpaceDoc | null>;
  create(input: { parentId: SpaceId | null; title?: string; blocks?: SpaceBlock[]; afterId?: SpaceId }): Promise<SpaceDoc>;
  /** Whole-document save with optimistic concurrency on `updatedAt`. */
  save(doc: SpaceDoc, expectedUpdatedAt: string): Promise<SpaceDoc>;
  move(id: SpaceId, parentId: SpaceId | null, position: string): Promise<void>;
  duplicate(id: SpaceId, options: { withChildren: boolean }): Promise<SpaceDoc>;
  archive(id: SpaceId): Promise<void>;
  restore(id: SpaceId): Promise<void>;
  /** Live changes from other people; returns unsubscribe. Memory store never fires. */
  subscribe(id: SpaceId, onChange: (doc: SpaceDoc) => void): () => void;
}

/** Where a data block's records come from. Custom table now; built-in module (`entity:<token>`) later. */
export type SpaceDataSource = { kind: "table"; tableId: string; viewId?: string } | { kind: "entity"; token: string };

export interface SpacesDataPort {
  readonly kind: "memory" | "live";
  /** The config a data/chart block passes to `<RecordsMount config>`. */
  config(): RecordsConfig;
  /** Sources the "Linked view of database" picker lists. */
  sources(): Promise<Array<{ source: SpaceDataSource; name: string }>>;
}

/** One AI request from a Notion-AI surface (parity § M). */
export interface SpacesAiRequest {
  surface: "empty-line" | "selection" | "block" | "ai-block" | "page-chat" | "database-autofill";
  /** The action picked (e.g. "improve", "summarize") or null for a free prompt. */
  action: string | null;
  /** What the person typed — only that. Page content travels as named context, never inside it. */
  prompt: string;
  context: { spaceId: SpaceId; blockIds: BlockId[]; selectedText?: string };
}

export interface SpacesAiPort {
  readonly wired: boolean;
  /** Streams text back; the surface renders Replace / Insert below / Discard. */
  run(request: SpacesAiRequest, onText: (chunk: string) => void, signal: AbortSignal): Promise<void>;
}
