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

// Block, span, color, media and data-source shapes are defined ONCE in lib/spaces-blocks/types.ts
// (shared with the Notion importer and every server-side writer); this contract re-exports them.
import type { PageProperty, PagePropertyType, RichSpan, SpaceBlock, SpaceColor, SpaceDataSource, SpaceMedia } from "@/lib/spaces-blocks/types";
export type { PageProperty, PagePropertyType, RichSpan, SpaceBlock, SpaceColor, SpaceDataSource, SpaceMedia };

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
  /** N13 — properties shown under the title (Notion's page properties); absent = none. */
  properties?: PageProperty[];
  blocks: SpaceBlock[];
  isArchived: boolean;
  /** The page's own organization, as the database read it (absent in the memory store). */
  organizationId?: string;
  /** Integer row version — the optimistic-concurrency token (guardedUpdate), never updatedAt. */
  version: number;
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
  /** Whole-document save; refused when the stored `version` is no longer `expectedVersion`. */
  save(doc: SpaceDoc, expectedVersion: number): Promise<SpaceDoc>;
  move(id: SpaceId, parentId: SpaceId | null, position: string): Promise<void>;
  duplicate(id: SpaceId, options: { withChildren: boolean }): Promise<SpaceDoc>;
  archive(id: SpaceId): Promise<void>;
  restore(id: SpaceId): Promise<void>;
  /** Live changes from other people; returns unsubscribe. Memory store never fires. */
  subscribe(id: SpaceId, onChange: (doc: SpaceDoc) => void): () => void;
}


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
