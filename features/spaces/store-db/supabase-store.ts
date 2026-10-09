// features/spaces/store-db/supabase-store.ts — the database SpacesStore (kind "database").
//
// A Space is a `content.document` (type `space`, format `spaces`). Its blocks and page settings live in
// `content.space_payload`: one full snapshot per content version = page history. Sub-pages are
// `document → document` associations labelled `sub_page` (the child is the source, the parent the
// target); their order is the edge `position`. Ruled design: common-docs/systems/content/spaces/STATE.md
// § Storage design.
//
// React talks to Supabase directly. The only doors are the database's own:
//   content.space_save  — compare-and-swap on `version`, writes title + icon + body projection + one snapshot
//   content.space_sidebar — the sidebar's first read: top-level pages + children of the open/expanded ones
//   content.space_children — one page's live sub-pages (a sidebar row expanding)
//   content.space_trash   — archived pages, read only when Trash opens
//   content.space_search  — the page search door (Cmd+K, Move to, Link to page)
//   content.space_list  — the WHOLE tree (scripts and the sample installer only; never the sidebar)
//   content.space_duplicate — a page or whole tree copied in one transaction
//   public.assoc_link / assoc_unlink — sub-page edges
// Archive = soft delete (`deleted_at`); the database carries it to sub-pages and back.

import type { SupabaseClient } from "@supabase/supabase-js";
import { guardedUpdate, readAllRows, type PagedReadResult } from "@ai-matrx/data/db";
import { defineChannelNamespace, subscribeToRealtimeManager } from "@ai-matrx/realtime";
import type { Database, Json } from "@/types/database.types";
import type { SpaceBlock, SpaceDoc, SpaceId, SpaceMedia, SpaceSummary, SpacesStore } from "../contract";

/** One open Space's stored row (content.document UPDATE): a save from another tab, person or page. */
const spacesDocumentChannel = defineChannelNamespace({
  namespace: "spaces-document",
  parts: ["spaceId"],
  description: "One open Space's stored document row: re-read when another tab, person or page saves it.",
});

type Db = SupabaseClient<Database>;
type DocumentRow = Database["content"]["Tables"]["document"]["Row"];

/** What one snapshot holds. `v` names the shape so a later reader can upgrade old snapshots. */
export interface SpaceSnapshot {
  v: 1;
  settings: SpaceDoc["settings"];
  icon: SpaceDoc["icon"];
  cover: SpaceDoc["cover"];
  properties?: SpaceDoc["properties"];
  blocks: SpaceBlock[];
}

/** One row of a page's history: the snapshot saved at that content version. */
export interface SpaceHistoryEntry {
  contentVersion: number;
  savedAt: string;
  savedBy: string | null;
  snapshot: SpaceSnapshot;
}

const DOC_COLUMNS =
  "id, organization_id, title, icon, format, version, content_version, created_at, updated_at, updated_by, deleted_at";
type DocHead = Pick<
  DocumentRow,
  | "id"
  | "organization_id"
  | "title"
  | "icon"
  | "format"
  | "version"
  | "content_version"
  | "created_at"
  | "updated_at"
  | "updated_by"
  | "deleted_at"
>;

const SUB_PAGE = "sub_page";

/** One row of content.space_sidebar / space_trash (same columns as space_list). */
interface TreeRow {
  id: string;
  parent_id: string | null;
  edge_position: number | null;
  title: string | null;
  icon: string | null;
  deleted_at: string | null;
  updated_at: string;
  created_at: string;
}
interface SearchRow {
  id: string;
  parent_id: string | null;
  title: string | null;
  icon: string | null;
  updated_at: string;
  path: string | null;
  snippet: string | null;
}
/** The round-35 read functions are newer than the generated types (a shared file outside the fence):
 *  they are called through this narrow typed shape until `pnpm db-types` next regenerates. */
interface RpcCall<Row> extends PromiseLike<{ data: Row[] | null; error: { message: string; code?: string } | null }> {
  order(column: string, options: { ascending: boolean }): RpcCall<Row>;
  range(from: number, to: number): PromiseLike<PagedReadResult<Row>>;
}
interface RpcDb {
  rpc<Row>(fn: string, args: Record<string, unknown>, options?: { count?: "exact" }): RpcCall<Row>;
}

/** One page found by content.space_search. `path` = the visible ancestors' titles, top first. */
export interface SpaceSearchHit {
  id: SpaceId;
  parentId: SpaceId | null;
  title: string;
  icon: SpaceMedia | null;
  updatedAt: string;
  path: string;
  snippet?: string;
}
/** Edge positions are gapped integers; a new last child lands this far after the previous one. */
const POSITION_GAP = 1024;
const POSITION_WIDTH = 12;

const DEFAULT_SETTINGS: SpaceDoc["settings"] = { font: "default", smallText: false, fullWidth: false, locked: false };

/** Edge position → the contract's sortable string (fixed-width digits compare like the numbers). */
function positionKey(position: number | null | undefined): string {
  return String(Math.max(0, position ?? 0)).padStart(POSITION_WIDTH, "0");
}

/** A tree row → summary: under a parent, order is the edge position; top level keeps created order. */
function treeSummary(r: TreeRow): SpaceSummary {
  return {
    id: r.id,
    parentId: r.parent_id ?? null,
    position: r.parent_id ? positionKey(r.edge_position) : positionKey(Date.parse(r.created_at)),
    title: r.title ?? "",
    icon: parseIcon(r.icon),
    isArchived: r.deleted_at != null,
    updatedAt: r.updated_at,
  };
}

export function parseIcon(raw: string | null | undefined): SpaceMedia | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as SpaceMedia;
  } catch {
    // A plain-text icon written by another surface (an emoji): show it as one.
  }
  return { icon: raw };
}

function readSnapshot(raw: Json | null | undefined): SpaceSnapshot {
  const s = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    v: 1,
    settings: { ...DEFAULT_SETTINGS, ...((s.settings as Partial<SpaceDoc["settings"]>) ?? {}) },
    icon: (s.icon as SpaceDoc["icon"]) ?? null,
    cover: (s.cover as SpaceDoc["cover"]) ?? null,
    ...(Array.isArray(s.properties) && s.properties.length ? { properties: s.properties as SpaceDoc["properties"] } : {}),
    blocks: Array.isArray(s.blocks) ? (s.blocks as SpaceBlock[]) : [],
  };
}

function toSnapshot(doc: Pick<SpaceDoc, "settings" | "icon" | "cover" | "blocks" | "properties">): SpaceSnapshot {
  return { v: 1, settings: doc.settings, icon: doc.icon ?? null, cover: doc.cover ?? null, ...(doc.properties?.length ? { properties: doc.properties } : {}), blocks: doc.blocks };
}

/** Plain-text copy of the page for search until the server's markdown regenerator exists. */
function projection(title: string, blocks: SpaceBlock[]): string {
  const lines: string[] = [];
  if (title) lines.push(`# ${title}`);
  const walk = (list: SpaceBlock[]) => {
    for (const b of list) {
      const text = (b.text ?? []).map((span) => span.text).join("");
      if (text) lines.push(text);
      if (b.children) walk(b.children);
    }
  };
  walk(blocks);
  return lines.join("\n\n");
}

/** The arguments of `content.space_save` — the one shape a save sends (page/leave-save.ts sends it too). */
export function spaceSaveArgs(doc: SpaceDoc, expectedVersion: number) {
  return {
    p_document_id: doc.id,
    p_expected_version: expectedVersion,
    p_snapshot: toSnapshot(doc) as unknown as Json,
    p_title: doc.title,
    p_projection: projection(doc.title, doc.blocks),
    p_origin: "manual",
  };
}

function fail(action: string, error: { message: string } | null | undefined): never {
  throw new Error(`We couldn't ${action}: ${error?.message ?? "no answer from the database"}`);
}

export class SupabaseSpacesStore implements SpacesStore {
  readonly kind = "database" as const;
  private typeId: Promise<string> | null = null;

  /**
   * @param db  a signed-in Supabase client
   * @param organizationId  the organization a new top-level Space belongs to (the active organization
   *   for writes). A sub-page always belongs to its parent's organization.
   */
  constructor(
    private readonly db: Db,
    private readonly organizationId: string,
  ) {}

  private spaceTypeId(): Promise<string> {
    this.typeId ??= (async () => {
      const { data, error } = await this.db
        .schema("platform")
        .from("categories")
        .select("id")
        .eq("dimension", "document_type")
        .eq("slug", "space")
        .is("deleted_at", null)
        .maybeSingle();
      if (error || !data) fail("find the Space document type", error ?? { message: "not registered" });
      return data.id;
    })();
    return this.typeId;
  }

  private async head(id: SpaceId): Promise<DocHead | null> {
    const { data, error } = await this.db.schema("content").from("document").select(DOC_COLUMNS).eq("id", id).maybeSingle();
    if (error) fail("open this Space", error);
    return data;
  }

  /** The live sub_page edge of a page (null = top level, or a parent this reader cannot see). */
  private async parentEdge(id: SpaceId): Promise<{ parentId: SpaceId; position: number | null } | null> {
    const { data, error } = await this.db
      .schema("platform")
      .from("associations")
      .select("target_id, position")
      .eq("source_type", "document")
      .eq("source_id", id)
      .eq("target_type", "document")
      .eq("label", SUB_PAGE)
      .is("deleted_at", null)
      .maybeSingle();
    if (error) fail("read where this Space sits", error);
    return data ? { parentId: data.target_id, position: data.position } : null;
  }

  private async latestSnapshot(id: SpaceId): Promise<SpaceSnapshot> {
    const { data, error } = await this.db
      .schema("content")
      .from("space_payload")
      .select("snapshot")
      .eq("document_id", id)
      .order("content_version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) fail("read this Space's content", error);
    return readSnapshot(data?.snapshot);
  }

  private compose(head: DocHead, snapshot: SpaceSnapshot, edge: { parentId: SpaceId; position: number | null } | null): SpaceDoc {
    return {
      id: head.id,
      parentId: edge?.parentId ?? null,
      position: positionKey(edge?.position),
      title: head.title,
      icon: snapshot.icon,
      cover: snapshot.cover,
      ...(snapshot.properties ? { properties: snapshot.properties } : {}),
      settings: snapshot.settings,
      blocks: snapshot.blocks,
      isArchived: head.deleted_at != null,
      organizationId: head.organization_id,
      version: head.version,
      createdAt: head.created_at,
      updatedAt: head.updated_at,
      updatedBy: head.updated_by,
    };
  }

  async list(options?: { includeArchived?: boolean }): Promise<SpaceSummary[]> {
    const rows = await readAllRows(
      ({ from, to }) =>
        this.db
          .schema("content")
          .rpc("space_list", { p_include_archived: options?.includeArchived ?? false }, { count: "exact" })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "content.space_list" },
    );
    // Under a parent, order is the edge position; top-level Spaces have no edge and keep created order.
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id ?? null,
      position: r.parent_id ? positionKey(r.edge_position) : positionKey(Date.parse(r.created_at)),
      title: r.title ?? "",
      icon: parseIcon(r.icon),
      isArchived: r.deleted_at != null,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * The sidebar's tree read (round 35, Notion's lazy tree): live top-level pages, plus the live children of
   * every page in `expand` and of every ancestor of each page in `reveal` (the open page, favorites).
   * Never archived pages, never the whole tree — deeper levels come from `children` on expand.
   */
  async sidebar(input: { expand: SpaceId[]; reveal: SpaceId[] }): Promise<SpaceSummary[]> {
    const rows = await readAllRows(
      ({ from, to }) =>
        (this.db.schema("content") as unknown as RpcDb)
          .rpc<TreeRow>("space_sidebar", { p_expand: input.expand, p_reveal: input.reveal }, { count: "exact" })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "content.space_sidebar" },
    );
    return rows.map(treeSummary);
  }

  /**
   * The pages a Space links to (page links, sub-page rows, mentions), by id, in ONE read (round 40): title,
   * icon, trash state and parent. Pages the person cannot open are simply absent. Was one full page read
   * (`get`: head + snapshot + edge) per link — about 40 reads x 3 on the admin sample.
   */
  async summaries(ids: readonly SpaceId[]): Promise<SpaceSummary[]> {
    const unique = [...new Set(ids)];
    if (!unique.length) return [];
    const { data, error } = await (this.db.schema("content") as unknown as RpcDb).rpc<Omit<TreeRow, "created_at">>("space_summaries", { p_ids: unique });
    if (error) fail("read the pages this Space links to", error);
    return (data ?? []).map((r) => ({
      id: r.id,
      parentId: r.parent_id ?? null,
      position: positionKey(r.edge_position),
      title: r.title ?? "",
      icon: parseIcon(r.icon),
      isArchived: r.deleted_at != null,
      updatedAt: r.updated_at,
    }));
  }

  /** Trash: the person's archived pages, read when Trash opens (never with the tree). */
  async trash(): Promise<SpaceSummary[]> {
    const rows = await readAllRows(
      ({ from, to }) =>
        (this.db.schema("content") as unknown as RpcDb)
          .rpc<TreeRow>("space_trash", {}, { count: "exact" })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "content.space_trash" },
    );
    return rows.map(treeSummary);
  }

  /** Page search on the server: title (then body) matches among the pages the person can open; "" = recently edited. */
  async search(query: string, limit = 50): Promise<SpaceSearchHit[]> {
    const { data, error } = await (this.db.schema("content") as unknown as RpcDb).rpc<SearchRow>("space_search", { p_query: query, p_limit: limit });
    if (error) fail("search your pages", error);
    return (data ?? []).map((r) => ({
      id: r.id,
      parentId: r.parent_id ?? null,
      title: r.title ?? "",
      icon: parseIcon(r.icon),
      updatedAt: r.updated_at,
      path: r.path ?? "",
      snippet: r.snippet ?? undefined,
    }));
  }

  /**
   * A page's live sub-pages the person can open — the sidebar expands a share root through this.
   * Filtered by access, never by organization, so a page shared from another organization expands.
   */
  async children(parentId: SpaceId): Promise<SpaceSummary[]> {
    const rows = await readAllRows(
      ({ from, to }) =>
        this.db
          .schema("content")
          .rpc("space_children", { p_parent_id: parentId }, { count: "exact" })
          .order("edge_position", { ascending: true })
          .order("id", { ascending: true })
          .range(from, to),
      { label: "content.space_children" },
    );
    return rows.map((r) => ({
      id: r.id,
      parentId: r.parent_id ?? parentId,
      position: positionKey(r.edge_position),
      title: r.title ?? "",
      icon: parseIcon(r.icon),
      isArchived: r.deleted_at != null,
      updatedAt: r.updated_at,
    }));
  }

  async get(id: SpaceId): Promise<SpaceDoc | null> {
    // All three at once (round 34): the page's first paint waits on the slowest, not on their sum.
    const [head, snapshot, edge] = await Promise.all([this.head(id), this.latestSnapshot(id), this.parentEdge(id)]);
    if (!head || head.format !== "spaces") return null;
    return this.compose(head, snapshot, edge);
  }

  /** Page history: every saved snapshot, newest first. */
  async history(id: SpaceId): Promise<SpaceHistoryEntry[]> {
    const rows = await readAllRows(
      ({ from, to }) =>
        this.db
          .schema("content")
          .from("space_payload")
          .select("content_version, created_at, created_by, snapshot", { count: "exact" })
          .eq("document_id", id)
          .order("content_version", { ascending: false })
          .range(from, to),
      { label: "content.space_payload history" },
    );
    return rows.map((r) => ({
      contentVersion: r.content_version,
      savedAt: r.created_at,
      savedBy: r.created_by,
      snapshot: readSnapshot(r.snapshot),
    }));
  }

  /** Sibling edges under a parent, ordered: the slots `move`/`create` place a page between. */
  private async siblings(parentId: SpaceId): Promise<Array<{ id: SpaceId; position: number }>> {
    const rows = await readAllRows(
      ({ from, to }) =>
        this.db
          .schema("platform")
          .from("associations")
          .select("source_id, position", { count: "exact" })
          .eq("target_type", "document")
          .eq("target_id", parentId)
          .eq("source_type", "document")
          .eq("label", SUB_PAGE)
          .is("deleted_at", null)
          .order("source_id", { ascending: true })
          .range(from, to),
      { label: "sub_page siblings" },
    );
    return rows
      .map((r) => ({ id: r.source_id, position: r.position ?? 0 }))
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  }

  private async link(childId: SpaceId, parentId: SpaceId, position: number): Promise<void> {
    const { error } = await this.db.rpc("assoc_link", {
      p_source_type: "document",
      p_source_id: childId,
      p_target_type: "document",
      p_target_id: parentId,
      p_role: SUB_PAGE,
      p_label: SUB_PAGE,
      p_position: position,
    });
    if (error) fail("place this Space under its parent", error);
  }

  private async unlink(childId: SpaceId, parentId: SpaceId): Promise<void> {
    const { error } = await this.db.rpc("assoc_unlink", {
      p_source_type: "document",
      p_source_id: childId,
      p_target_type: "document",
      p_target_id: parentId,
      p_role: SUB_PAGE,
    });
    if (error) fail("take this Space out of its parent", error);
  }

  /**
   * An integer slot for `childId` among `parentId`'s children: right after `afterId`, or at the
   * `key` the UI asked for (a fractional key compared against the siblings' keys), or last. When the
   * neighbours leave no gap, the siblings are renumbered first.
   */
  private async slot(parentId: SpaceId, childId: SpaceId, at: { afterId?: SpaceId; key?: string }): Promise<number> {
    let sibs = (await this.siblings(parentId)).filter((s) => s.id !== childId);
    const indexOf = () => {
      if (at.afterId) {
        const i = sibs.findIndex((s) => s.id === at.afterId);
        return i < 0 ? sibs.length : i + 1;
      }
      if (at.key !== undefined) {
        const i = sibs.findIndex((s) => positionKey(s.position) > at.key!);
        return i < 0 ? sibs.length : i;
      }
      return sibs.length;
    };
    let i = indexOf();
    const lo = sibs[i - 1]?.position ?? 0;
    const hi = sibs[i]?.position;
    if (hi === undefined) return lo + POSITION_GAP;
    if (hi - lo > 1) return Math.floor((lo + hi) / 2);
    // No room: renumber the siblings on a fresh gap, then place between.
    for (const [n, s] of sibs.entries()) await this.link(s.id, parentId, (n + 1) * POSITION_GAP);
    sibs = sibs.map((s, n) => ({ ...s, position: (n + 1) * POSITION_GAP }));
    i = indexOf();
    return (sibs[i - 1]?.position ?? 0) + POSITION_GAP / 2;
  }

  async create(input: { parentId: SpaceId | null; title?: string; blocks?: SpaceBlock[]; afterId?: SpaceId }): Promise<SpaceDoc> {
    // A new top-level Space is Organization (`internal`): defaults lean open. A sub-page inherits its
    // parent's organization and visibility; "Private" is a person choosing `personal` (hidden from lists).
    let organizationId = this.organizationId;
    let visibility: DocumentRow["visibility"] = "internal";
    let web: { web_include_sub_pages: boolean; web_allow_duplicate: boolean } | null = null;
    if (input.parentId) {
      const { data: parent, error: parentError } = await this.db
        .schema("content")
        .from("document")
        .select("organization_id, visibility, web_include_sub_pages, web_allow_duplicate")
        .eq("id", input.parentId)
        .maybeSingle();
      if (parentError) fail("open the parent Space", parentError);
      if (!parent) throw new Error("The parent Space no longer exists, or you cannot open it.");
      organizationId = parent.organization_id;
      // J1: a sub-page of a page on the web is on the web only when that page includes its sub-pages.
      visibility = parent.visibility === "public" && !parent.web_include_sub_pages ? "internal" : parent.visibility;
      web = { web_include_sub_pages: parent.web_include_sub_pages, web_allow_duplicate: parent.web_allow_duplicate };
    }
    const row = {
      organization_id: organizationId,
      document_type_id: await this.spaceTypeId(),
      format: "spaces",
      title: input.title ?? "",
      visibility,
      ...(web ?? {}),
    };
    const { data, error } = await this.db
      .schema("content")
      .from("document")
      // content_hash and data_class are computed by the database (a client write of content_hash is
      // refused 42501); the generated Insert type still lists them as required — same as documentSource.ts.
      .insert(row as never)
      .select(DOC_COLUMNS)
      .single();
    if (error || !data) fail("create the Space", error);
    if (input.parentId) {
      const position = await this.slot(input.parentId, data.id, { afterId: input.afterId });
      await this.link(data.id, input.parentId, position);
    }
    if (input.blocks?.length) {
      const fresh = this.compose(data, readSnapshot(null), null);
      return this.save({ ...fresh, blocks: input.blocks }, data.version);
    }
    const doc = await this.get(data.id);
    if (!doc) throw new Error("The new Space was created but could not be read back.");
    return doc;
  }

  async save(doc: SpaceDoc, expectedVersion: number): Promise<SpaceDoc> {
    const result = await guardedUpdate<DocHead>({
      expectedVersion,
      applyUpdate: async ({ expectedVersion: version }) => {
        const { data, error } = await this.db.schema("content").rpc("space_save", spaceSaveArgs(doc, version));
        // PT409 (HTTP 409) is the door's compare-and-swap miss: hand guardedUpdate "no row" so it classifies it.
        if (error?.code === "PT409") return { data: null, error: null, count: null, status: 200, statusText: "OK" };
        if (error) return { data: null, error, count: null, status: 400, statusText: "Bad Request" };
        return { data: data as DocHead, error: null, count: null, status: 200, statusText: "OK" };
      },
      fetchCurrent: async () => {
        const { data, error, count, status, statusText } = await this.db
          .schema("content")
          .from("document")
          .select(DOC_COLUMNS)
          .eq("id", doc.id)
          .is("deleted_at", null)
          .maybeSingle();
        return error
          ? { data: null, error, count, status, statusText }
          : { data, error: null, count, status, statusText };
      },
    });
    if (result.status === "not_found") throw new Error("This Space no longer exists, or you cannot edit it.");
    if (result.status === "conflict") {
      throw new Error(
        `This Space changed since it was opened (you had version ${expectedVersion}; it is now ${result.currentVersion}).`,
      );
    }
    const edge = await this.parentEdge(doc.id);
    return this.compose(result.row, toSnapshot(doc), edge);
  }

  async move(id: SpaceId, parentId: SpaceId | null, position: string): Promise<void> {
    if (parentId === id) throw new Error("A Space cannot move inside itself.");
    const current = await this.parentEdge(id);
    // One live parent per page (database unique slot): take it out of the old parent first.
    if (current && current.parentId !== parentId) await this.unlink(id, current.parentId);
    if (parentId) {
      const slot = await this.slot(parentId, id, { key: position });
      await this.link(id, parentId, slot);
    }
  }

  async duplicate(id: SpaceId, options: { withChildren: boolean }): Promise<SpaceDoc> {
    // One transaction in the database (content.space_duplicate): the page, and with `withChildren` its
    // whole sub-page tree in the same order, in-tree page mentions pointing at the copies. The copy sits
    // right after the original, in the original's organization when it is a sub-page.
    const source = await this.head(id);
    if (!source || source.deleted_at) throw new Error("This Space no longer exists.");
    const edge = await this.parentEdge(id);
    // Not in the generated types until the next regeneration: a typed local shape for this one door.
    const content = this.db.schema("content") as unknown as {
      rpc(fn: "space_duplicate", args: Record<string, unknown>): PromiseLike<{ data: string | null; error: { message: string } | null }>;
    };
    const { data, error } = await content.rpc("space_duplicate", {
      p_space_id: id,
      p_organization_id: edge ? source.organization_id : this.organizationId,
      p_parent_id: edge?.parentId,
      p_position: edge ? await this.slot(edge.parentId, id, { afterId: id }) : undefined,
      p_with_children: options.withChildren,
    });
    if (error || !data) fail("duplicate this Space", error);
    const copy = await this.get(data);
    if (!copy) throw new Error("The copy was made but could not be opened.");
    return copy;
  }

  /**
   * Trash and restore go through `content.space_set_trashed`: who may is who may update the row (its creator
   * or editor access). A plain UPDATE of `deleted_at` is refused (42501) for a full-access editor who is not
   * the page's creator, because the owner-only trash rule hides the trashed row from them and Postgres checks
   * the new row against the read policy.
   */
  private async setTrashed(id: SpaceId, trashed: boolean, action: string): Promise<void> {
    // Not in the generated types until the next regeneration: a typed local shape for this one door.
    const content = this.db.schema("content") as unknown as {
      rpc(fn: "space_set_trashed", args: { p_document_id: string; p_trashed: boolean }): PromiseLike<{ error: { message: string } | null }>;
    };
    const { error } = await content.rpc("space_set_trashed", { p_document_id: id, p_trashed: trashed });
    if (error) throw new Error(`We couldn't ${action}. ${error.message}`);
  }

  async archive(id: SpaceId): Promise<void> {
    await this.setTrashed(id, true, "move this page to Trash");
  }

  async restore(id: SpaceId): Promise<void> {
    await this.setTrashed(id, false, "restore this page");
    // A restored page whose parent is still in Trash comes back at the top level, as in Notion.
    const edge = await this.parentEdge(id);
    if (edge) {
      const parent = await this.head(edge.parentId);
      if (parent?.deleted_at) await this.unlink(id, edge.parentId);
    }
  }

  subscribe(id: SpaceId, onChange: (doc: SpaceDoc) => void): () => void {
    // On the app's one realtime manager (supabase-realtime skill): a namespace-built topic, reconnect and
    // tab-wake handled by the package, and a backfill that re-reads the page so a save made while the
    // socket was down still arrives. The row carries ids only; the page is always re-read through `get`.
    const reread = () =>
      void this.get(id).then(
        (doc) => {
          if (doc) onChange(doc);
        },
        () => undefined,
      );
    return subscribeToRealtimeManager(() => ({
      topic: spacesDocumentChannel.topic({ spaceId: id }),
      postgresChanges: [
        {
          event: "UPDATE",
          schema: "content",
          table: "document",
          filter: `id=eq.${id}`,
          rowId: (row) => (typeof row.id === "string" ? row.id : undefined),
          onChange: reread,
        },
      ],
      onBackfill: reread,
    }));
  }
}
