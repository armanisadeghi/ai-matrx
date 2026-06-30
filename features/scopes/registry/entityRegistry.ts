// features/scopes/registry/entityRegistry.ts
//
// THE single resolver that turns an entity token into everything a generic
// association UI needs to RENDER it and QUERY for it — with ZERO hardcoding in
// the components themselves.
//
//   const info = getEntityInfo("task");
//   info.label / info.labelPlural / info.Icon            ← display
//   info.schema / info.table / info.titleColumn          ← candidate query
//
// Two inputs, merged:
//   1. The GENERATED registry `ENTITY_TYPE_METADATA` (mirrored 1:1 from
//      `platform.entity_types`) — the source of truth for `schema`, `table`,
//      `label`, `scopeable`, `category`. NEVER hand-maintained.
//   2. A thin FE-only OVERLAY below for the two things the DB can't carry: a
//      Lucide `Icon` (a React component) and the human-friendly `titleColumn` /
//      `ownerColumn` used to read picker candidates. Add a token here ONCE and
//      every association card, picker and count grid picks it up.
//
// This is the canonical replacement for the bespoke, duplicated
// `features/organizations/resource-catalogue.ts` — that file re-lists schema /
// table / label / icon per kind by hand and drifts from the registry. New
// association surfaces consume THIS resolver, not that catalogue.

import type { LucideIcon } from "lucide-react";
import {
  AppWindow,
  AudioLines,
  Boxes,
  Building2,
  FileText,
  FolderKanban,
  Layers,
  ListTodo,
  MessagesSquare,
  NotebookText,
  Tag,
  Webhook,
} from "lucide-react";
import {
  ENTITY_TYPE_METADATA,
  isEntityTypeToken,
  type EntityTypeToken,
} from "@/types/generated/entity-types.generated";

/**
 * FE-only presentation + query hints for an entity token. Everything here is
 * what `platform.entity_types` structurally cannot hold (a React icon) or does
 * not yet carry (which column reads as a human title / who owns a row).
 */
export interface EntityOverlay {
  /** Lucide icon for tiles, chips and picker rows. */
  Icon: LucideIcon;
  /** Plural display label. Defaults to `${label}s` when omitted. */
  labelPlural?: string;
  /**
   * Column on the backing table that reads as a human title in the picker.
   * Omit when the entity has no single obvious title column — the candidate
   * picker then falls back to the row id and (for now) such tokens are not
   * listed as attachable until a column is supplied here.
   */
  titleColumn?: string;
  /**
   * Ownership column used to scope "records I can attach" to the current user
   * (e.g. `user_id`). RLS is always the real gate; this just narrows the list
   * to the user's own rows. Omit to list everything RLS allows.
   */
  ownerColumn?: string;
  /** Build a route to open one record of this type (new-tab navigation). */
  hrefFor?: (id: string) => string;
}

// ─── The overlay table ──────────────────────────────────────────────────────
// Keyed by canonical token. Keep entries terse; only add a token when a real
// surface needs it. `schema` / `table` / `label` come from the generated
// metadata — do NOT duplicate them here.
const ENTITY_OVERLAY: Partial<Record<EntityTypeToken, EntityOverlay>> = {
  task: {
    Icon: ListTodo,
    labelPlural: "Tasks",
    titleColumn: "title",
    ownerColumn: "user_id",
    hrefFor: (id) => `/tasks/${id}`,
  },
  file: {
    Icon: FileText,
    labelPlural: "Files",
    titleColumn: "file_name",
    ownerColumn: "user_id",
  },
  note: {
    Icon: NotebookText,
    labelPlural: "Notes",
    titleColumn: "label",
    ownerColumn: "user_id",
    hrefFor: (id) => `/notes?active=${id}`,
  },
  agent: {
    Icon: Webhook,
    labelPlural: "Agents",
    titleColumn: "name",
    ownerColumn: "user_id",
  },
  app: {
    Icon: AppWindow,
    labelPlural: "Agent Apps",
    titleColumn: "name",
    ownerColumn: "user_id",
  },
  conversation: {
    Icon: MessagesSquare,
    labelPlural: "Conversations",
    titleColumn: "title",
    ownerColumn: "user_id",
  },
  project: {
    Icon: FolderKanban,
    labelPlural: "Projects",
    titleColumn: "name",
    ownerColumn: "user_id",
  },
  transcript: {
    Icon: AudioLines,
    labelPlural: "Transcripts",
    titleColumn: "title",
    ownerColumn: "user_id",
  },
  scope: { Icon: Tag, labelPlural: "Scopes" },
  scope_type: { Icon: Layers, labelPlural: "Scope Types" },
  organization: { Icon: Building2, labelPlural: "Organizations" },
};

/** Fallback icon when a token has no overlay entry yet. */
const DEFAULT_ICON: LucideIcon = Boxes;

/**
 * Fully-resolved entity descriptor — generated metadata + FE overlay, with safe
 * fallbacks so an un-overlaid token still renders (generic icon, derived
 * plural) even if it can't be queried for candidates yet.
 */
export interface EntityInfo {
  token: EntityTypeToken;
  label: string;
  labelPlural: string;
  /** Postgres schema of the backing table (from the generated registry). */
  schema: string;
  /** Backing table name (from the generated registry). */
  table: string;
  /** Title column for the picker, or null when none is registered. */
  titleColumn: string | null;
  /** Ownership column to scope candidate reads, or null. */
  ownerColumn: string | null;
  Icon: LucideIcon;
  hrefFor: ((id: string) => string) | null;
  scopeable: boolean;
  category: string | null;
  /** True when a picker can list real candidates (needs a title column). */
  canListCandidates: boolean;
}

/**
 * Resolve a token to its full descriptor. Throws only for a non-token string —
 * callers should pass `EntityTypeToken` values; the runtime guard catches
 * accidental raw strings loudly rather than rendering garbage.
 */
export function getEntityInfo(token: EntityTypeToken): EntityInfo {
  const meta = ENTITY_TYPE_METADATA[token];
  const overlay = ENTITY_OVERLAY[token];
  const labelPlural = overlay?.labelPlural ?? `${meta.label}s`;
  const titleColumn = overlay?.titleColumn ?? null;
  return {
    token,
    label: meta.label,
    labelPlural,
    schema: meta.schema,
    table: meta.table,
    titleColumn,
    ownerColumn: overlay?.ownerColumn ?? null,
    Icon: overlay?.Icon ?? DEFAULT_ICON,
    hrefFor: overlay?.hrefFor ?? null,
    scopeable: meta.scopeable,
    category: meta.category,
    canListCandidates: titleColumn !== null,
  };
}

/** Safe variant for raw strings (e.g. an edge's `otherType`). */
export function tryGetEntityInfo(token: string): EntityInfo | null {
  return isEntityTypeToken(token) ? getEntityInfo(token) : null;
}

/** Tokens that currently have a picker-ready overlay (title column present). */
export function listableTokens(): EntityTypeToken[] {
  return (Object.keys(ENTITY_OVERLAY) as EntityTypeToken[]).filter(
    (t) => ENTITY_OVERLAY[t]?.titleColumn != null,
  );
}
