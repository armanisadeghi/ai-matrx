// features/war-room/service/associations.ts
//
// War Room ASSOCIATIONS — the MAPPER between the war-room vocabulary and the
// platform-wide unified edge `platform.associations`.
//
// A container (room = session, thread = tile) holds ANY resource type, M2M. In
// the unified model a "container holds entity" link is the edge
//     source = entity   →   target = container
// (member → container). The container is the TARGET; the resource is the SOURCE.
// `room` maps to the registry token `war_room`; `thread` maps to `thread`.
//
// `platform.associations` is NOT PostgREST-exposed, so the browser reaches it
// ONLY through the public SECURITY-DEFINER `assoc_*` RPCs — and per doctrine the
// SOLE chokepoint for those RPCs is `features/scopes/service/associationsService`.
// This file therefore NEVER touches the edge table directly: it calls the
// canonical service and maps its rows back to the war-room `WarRoomAssignment`
// shape so every selector/reducer over `assignmentsByContainer` is untouched.
//
// War-room specifics ride in the edge `metadata`: `is_active` (the focused member
// of a single-active type) and `position` (gallery order). `assoc_add` OVERWRITES
// metadata on conflict, so re-adding an edge updates these in place — that is how
// single-active demotion and active-pointer flips are done, idempotently.
//
// React → Supabase directly (no Next.js middle tier); RLS enforces access. Every
// mutation is loud on failure (throws) — callers wrap with reportWarRoomError.

import { supabase } from "@/utils/supabase/client";
import { workspaceDb } from "@/utils/supabase/workspaceDb";
import { requireUserId } from "@/utils/auth/getUserId";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { associationsService } from "@/features/scopes/service/associationsService";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  AssociationTargetEdge,
  AssociationTargetType,
  ScopesRpcError,
} from "@/features/scopes/types";
import type { Json } from "@/types/database.types";
import {
  SINGLE_ACTIVE_ENTITY_TYPES,
  type ContainerRef,
  type WarRoomAssignment,
  type WarRoomAssignmentEntityType,
  type WarRoomContainerType,
} from "../types";

// ── Vocabulary mapping ────────────────────────────────────────────────

/** war-room container → the `platform.associations` target token. */
const CONTAINER_TARGET: Record<WarRoomContainerType, AssociationTargetType> = {
  room: "war_room",
  thread: "thread",
};
function containerTargetType(
  type: WarRoomContainerType,
): AssociationTargetType {
  return CONTAINER_TARGET[type];
}

/**
 * War-room entity vocabulary ↔ the canonical `platform.associations` source
 * token. Only `user_file` differs — the platform/registry token for a `cld_files`
 * row is `file` (verified against `platform.entity_types`); everything else
 * passes through. The backfill mapped `user_file → file`, so writes MUST match or
 * a re-attach would create a second, divergent edge.
 */
function entityToSource(t: string): string {
  return t === "user_file" ? "file" : t;
}
function sourceToEntity(t: string): WarRoomAssignmentEntityType {
  return (t === "file" ? "user_file" : t) as WarRoomAssignmentEntityType;
}

/**
 * The platform SOURCE tokens a war-room container actually HOLDS as content. Used
 * to filter the incoming edges of a container: querying a `war_room` target also
 * returns the `thread → war_room` membership edges of its child threads, which are
 * NOT content assignments and must never enter an assignment bucket. These are
 * platform tokens (note `file`, not `user_file`) because they match the edge's raw
 * `source_type`.
 */
const CONTENT_SOURCE_TYPES: ReadonlySet<string> = new Set([
  "project",
  "task",
  "note",
  "conversation",
  "studio_session",
  "file",
  "document",
]);

/** A thrown error that preserves the canonical RPC's error code for callers. */
class WarRoomAssocError extends Error {
  readonly code?: string;
  constructor(e: ScopesRpcError) {
    super(e.message || "association RPC failed");
    this.name = "WarRoomAssocError";
    this.code = e.code;
  }
}

function isPlainObject(v: Json | null | undefined): v is Record<string, Json> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Merge a metadata patch onto an existing (possibly null/array) jsonb value. */
function mergeMeta(
  base: Json | null | undefined,
  patch: Record<string, Json>,
): Json {
  return { ...(isPlainObject(base) ? base : {}), ...patch };
}

function metaNumber(md: Json, key: string, fallback: number): number {
  if (isPlainObject(md) && typeof md[key] === "number")
    return md[key] as number;
  return fallback;
}
function metaBool(md: Json, key: string, fallback: boolean): boolean {
  if (isPlainObject(md) && typeof md[key] === "boolean")
    return md[key] as boolean;
  return fallback;
}

/** Reconstruct a `WarRoomAssignment` row from one incoming platform edge. */
function edgeToAssignment(
  edge: AssociationTargetEdge,
  containerType: WarRoomContainerType,
): WarRoomAssignment {
  const md = edge.metadata ?? {};
  return {
    id: edge.id,
    container_type: containerType,
    container_id: edge.targetId,
    entity_type: sourceToEntity(edge.sourceType),
    entity_id: edge.sourceId,
    position: metaNumber(md, "position", 0),
    is_active: metaBool(md, "is_active", true),
    label: edge.label,
    metadata: edge.metadata,
    created_by: null,
    created_at: edge.createdAt,
  } as WarRoomAssignment;
}

function byPosition(a: WarRoomAssignment, b: WarRoomAssignment): number {
  const pa = a.position ?? 0;
  const pb = b.position ?? 0;
  if (pa !== pb) return pa - pb;
  return (a.created_at ?? "").localeCompare(b.created_at ?? "");
}

function isContentEdge(edge: AssociationTargetEdge): boolean {
  return CONTENT_SOURCE_TYPES.has(edge.sourceType);
}

/**
 * Resolve the org that an edge into this container must carry. The container's
 * own `organization_id` is authoritative; a NULL org (a tile minted before
 * org-on-create, say) falls back to the user's personal org. We NEVER write a
 * NULL-org edge — `platform.associations` fails closed, so a NULL org would make
 * the link invisible.
 */
async function resolveContainerOrgId(ref: ContainerRef): Promise<string> {
  // War-room tables live in the `workspace` schema (war_rooms / threads).
  const table = ref.type === "room" ? "war_rooms" : "threads";
  const { data, error } = await workspaceDb(supabase)
    .from(table)
    .select("organization_id")
    .eq("id", ref.id)
    .maybeSingle();
  if (error) {
    console.error("[war-room] resolveContainerOrgId failed:", error);
    throw error;
  }
  const orgId = data?.organization_id ?? null;
  // Canonical session-cached personal-org fallback — no per-call RPC.
  return ensureOrgId(orgId);
}

// ── Reads ─────────────────────────────────────────────────────────────

/** All assignment rows for a set of containers (room + its threads), batched. */
export async function listAssignmentsForContainers(
  refs: ContainerRef[],
): Promise<WarRoomAssignment[]> {
  if (refs.length === 0) return [];
  const threadIds = refs.filter((r) => r.type === "thread").map((r) => r.id);
  const roomIds = refs.filter((r) => r.type === "room").map((r) => r.id);

  // One RPC per container type (1-2 round-trips total), run in parallel.
  const [threadRes, roomRes] = await Promise.all([
    threadIds.length > 0
      ? associationsService.listForTargets("thread", threadIds)
      : null,
    roomIds.length > 0
      ? associationsService.listForTargets("war_room", roomIds)
      : null,
  ]);

  const out: WarRoomAssignment[] = [];
  if (threadRes) {
    if (isScopesRpcErr(threadRes)) throw new WarRoomAssocError(threadRes.error);
    for (const e of threadRes.data.edges) {
      if (isContentEdge(e)) out.push(edgeToAssignment(e, "thread"));
    }
  }
  if (roomRes) {
    if (isScopesRpcErr(roomRes)) throw new WarRoomAssocError(roomRes.error);
    for (const e of roomRes.data.edges) {
      if (isContentEdge(e)) out.push(edgeToAssignment(e, "room"));
    }
  }
  return out.sort(byPosition);
}

/** Assignment rows for one container. */
export async function listAssignmentsForContainer(
  ref: ContainerRef,
): Promise<WarRoomAssignment[]> {
  const res = await associationsService.listForTargets(
    containerTargetType(ref.type),
    [ref.id],
  );
  if (isScopesRpcErr(res)) throw new WarRoomAssocError(res.error);
  return res.data.edges
    .filter(isContentEdge)
    .map((e) => edgeToAssignment(e, ref.type))
    .sort(byPosition);
}

// ── Writes ────────────────────────────────────────────────────────────

interface CreateAssignmentInput {
  ref: ContainerRef;
  entityType: WarRoomAssignmentEntityType;
  entityId: string;
  /** Make this the active/focused member of its type (demotes same-type siblings). */
  makeActive?: boolean;
  label?: string | null;
  metadata?: Json | null;
}

/**
 * Attach a resource to a container. For single-active types (task/project/note/
 * studio_session) `makeActive` (default true) demotes the prior active one. The
 * UNIQUE (source,target) edge makes re-attaching the same resource idempotent —
 * it updates the edge's metadata in place rather than erroring.
 */
export async function createAssignment(
  input: CreateAssignmentInput,
): Promise<WarRoomAssignment> {
  const userId = requireUserId();
  const { ref, entityType, entityId } = input;
  const single = SINGLE_ACTIVE_ENTITY_TYPES.has(entityType);
  const makeActive = input.makeActive ?? true;
  const targetType = containerTargetType(ref.type);

  const existing = await listAssignmentsForContainer(ref);
  const already = existing.find(
    (a) => a.entity_type === entityType && a.entity_id === entityId,
  );
  // True no-op ONLY when nothing would change: already linked, already in the
  // desired active state, same label, and no metadata override passed. If a new
  // label/metadata or an activation IS requested, fall through to the upsert so
  // it actually applies (assoc_add coalesces label, overwrites metadata).
  if (already) {
    const wantActive = single ? makeActive : true;
    const activeMatches = (already.is_active ?? true) === wantActive;
    const labelMatches = (input.label ?? null) === (already.label ?? null);
    const metaProvided =
      isPlainObject(input.metadata) && Object.keys(input.metadata).length > 0;
    if (activeMatches && labelMatches && !metaProvided) return already;
  }

  const orgId = await resolveContainerOrgId(ref);
  const sameType = existing.filter((a) => a.entity_type === entityType);
  const position = already?.position ?? sameType.length;
  const isActive = single ? makeActive : true;

  // Demote prior active siblings of a single-active type (assoc_add overwrites
  // metadata on conflict, so this updates each existing edge in place).
  if (single && makeActive) {
    const demote = sameType.filter(
      (a) => a.is_active && a.entity_id !== entityId,
    );
    await Promise.all(
      demote.map((a) =>
        associationsService.add({
          sourceType: entityToSource(a.entity_type),
          sourceId: a.entity_id,
          targetType,
          targetId: ref.id,
          orgId,
          label: a.label ?? undefined,
          metadata: mergeMeta(a.metadata, { is_active: false }),
        }),
      ),
    );
  }

  const metadata: Json = mergeMeta(
    isPlainObject(input.metadata) ? input.metadata : {},
    { is_active: isActive, position },
  );
  const res = await associationsService.add({
    sourceType: entityToSource(entityType),
    sourceId: entityId,
    targetType,
    targetId: ref.id,
    orgId,
    label: input.label ?? undefined,
    metadata,
  });
  if (isScopesRpcErr(res)) throw new WarRoomAssocError(res.error);

  return {
    id: res.data.id,
    container_type: ref.type,
    container_id: ref.id,
    entity_type: entityType,
    entity_id: entityId,
    position,
    is_active: isActive,
    label: input.label ?? null,
    metadata,
    created_by: userId,
    created_at: new Date().toISOString(),
  } as WarRoomAssignment;
}

/** Mark one resource as the active member of its type within the container. */
export async function setActiveAssignment(
  ref: ContainerRef,
  entityType: WarRoomAssignmentEntityType,
  entityId: string,
): Promise<void> {
  const targetType = containerTargetType(ref.type);
  const orgId = await resolveContainerOrgId(ref);
  const sameType = (await listAssignmentsForContainer(ref)).filter(
    (a) => a.entity_type === entityType,
  );
  // Re-write is_active on every same-type edge (chosen → true, the rest → false).
  const results = await Promise.all(
    sameType.map((a) =>
      associationsService.add({
        sourceType: entityToSource(a.entity_type),
        sourceId: a.entity_id,
        targetType,
        targetId: ref.id,
        orgId,
        label: a.label ?? undefined,
        metadata: mergeMeta(a.metadata, {
          is_active: a.entity_id === entityId,
        }),
      }),
    ),
  );
  for (const r of results) {
    if (isScopesRpcErr(r)) throw new WarRoomAssocError(r.error);
  }
}

/** Remove a resource from a container by its (type, entity) tuple. */
export async function removeAssignmentByEntity(
  ref: ContainerRef,
  entityType: WarRoomAssignmentEntityType,
  entityId: string,
): Promise<void> {
  const res = await associationsService.remove({
    sourceType: entityToSource(entityType),
    sourceId: entityId,
    targetType: containerTargetType(ref.type),
    targetId: ref.id,
  });
  if (isScopesRpcErr(res)) throw new WarRoomAssocError(res.error);
}

/**
 * Copy every assignment of one container onto another (thread IMPORT: duplicate
 * a thread's resource links into a new room without removing the originals).
 * Idempotent via the unique edge.
 */
export async function copyContainerAssignments(
  from: ContainerRef,
  to: ContainerRef,
): Promise<WarRoomAssignment[]> {
  const source = await listAssignmentsForContainer(from);
  if (source.length === 0) return [];
  const orgId = await resolveContainerOrgId(to);
  const targetType = containerTargetType(to.type);
  const copied: WarRoomAssignment[] = [];
  for (const a of source) {
    const res = await associationsService.add({
      sourceType: entityToSource(a.entity_type),
      sourceId: a.entity_id,
      targetType,
      targetId: to.id,
      orgId,
      label: a.label ?? undefined,
      metadata: a.metadata ?? {},
    });
    if (isScopesRpcErr(res)) throw new WarRoomAssocError(res.error);
    copied.push({
      ...a,
      id: res.data.id,
      container_type: to.type,
      container_id: to.id,
    });
  }
  return copied;
}

// ── Thread ↔ room membership ────────────────────────────────────────────
//
// Room membership is a `thread → war_room` edge. Orphan = no edge.

const MEMBERSHIP_META: Json = { membership: true };

/** Room ids linked to a thread via `thread → war_room` membership edges. */
export async function listRoomIdsForThread(
  threadId: string,
): Promise<string[]> {
  const res = await associationsService.listForEntity("thread", threadId);
  if (isScopesRpcErr(res)) throw new WarRoomAssocError(res.error);
  return res.data.edges
    .filter(
      (e) =>
        e.direction === "outgoing" &&
        e.otherType === "war_room" &&
        isPlainObject(e.metadata) &&
        e.metadata.membership === true,
    )
    .map((e) => e.otherId);
}

/** Attach a thread to a room (idempotent). */
export async function attachThreadToRoom(
  threadId: string,
  roomId: string,
): Promise<void> {
  const orgId = await resolveContainerOrgId({ type: "room", id: roomId });
  const res = await associationsService.add({
    sourceType: "thread",
    sourceId: threadId,
    targetType: "war_room",
    targetId: roomId,
    orgId,
    metadata: MEMBERSHIP_META,
  });
  if (isScopesRpcErr(res)) throw new WarRoomAssocError(res.error);
}

/**
 * Re-point a thread's room-membership edge from `fromRoomId` to `toRoomId`.
 * Pass `fromRoomId: null` when attaching an orphan.
 */
export async function moveThreadMembership(
  threadId: string,
  fromRoomId: string | null,
  toRoomId: string,
): Promise<void> {
  if (fromRoomId === toRoomId) return;
  const orgId = await resolveContainerOrgId({ type: "room", id: toRoomId });
  if (fromRoomId) {
    const removed = await associationsService.remove({
      sourceType: "thread",
      sourceId: threadId,
      targetType: "war_room",
      targetId: fromRoomId,
    });
    if (isScopesRpcErr(removed)) throw new WarRoomAssocError(removed.error);
  }
  const added = await associationsService.add({
    sourceType: "thread",
    sourceId: threadId,
    targetType: "war_room",
    targetId: toRoomId,
    orgId,
    metadata: MEMBERSHIP_META,
  });
  if (isScopesRpcErr(added)) throw new WarRoomAssocError(added.error);
}

/**
 * Purge EVERY association edge touching a container (both directions) — its
 * content edges (entity → container, as target), its membership edge
 * (thread → war_room, as source), and its reversed context-scope edges (as
 * source). Call when a thread/room is soft-deleted so no edge is orphaned: a
 * dangling `thread → war_room` membership edge would otherwise surface a deleted
 * thread as a live member the moment room reads move off `session_id` onto the
 * edge ("no edge = unassigned").
 */
export async function purgeContainerEdges(ref: ContainerRef): Promise<void> {
  const res = await associationsService.removeForEntity(
    containerTargetType(ref.type),
    ref.id,
  );
  if (isScopesRpcErr(res)) throw new WarRoomAssocError(res.error);
}
