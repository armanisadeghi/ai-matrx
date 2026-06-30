// features/scopes/service/associationHelpers.ts
//
// TYPED convenience wrappers over the canonical `associationsService` chokepoint
// for the common COMPOSITE shapes — "attach one thing to many", "attach many
// things to one", "create N edges in one call", "replace a whole set". They add
// NO new DB access: every wrapper composes the same `assoc_*` primitives, so the
// single-chokepoint + runtime-guard guarantees still hold.
//
// Why wrappers (not more RPCs): per-entity / per-shape SQL functions are an
// N-explosion and each copy reintroduces bugs (the buggy `create_task_with_*`
// taught us this). Composition belongs in typed app helpers; the DB layer stays
// generic and dumb.
//
// Type safety: a `source` is any registered entity (`EntityTypeToken`, the full
// generated set); a `target` is one of the deliberate container types
// (`AssociationTargetType`). Bad tokens / non-UUID ids are caught by the base
// service's guards and surface as `invalid_argument` — before any RPC fires.

"use client";

import { associationsService } from "@/features/scopes/service/associationsService";
import { ok, err } from "@/features/scopes/service/rpcResult";
import { isScopesRpcErr } from "@/features/scopes/types";
import type {
  AssociationTargetType,
  EntityTypeToken,
  ScopesRpcError,
  ScopesRpcResult,
} from "@/features/scopes/types";
import type { Json } from "@/types/database.types";

/** A typed reference to a single row — `{ type, id }`. */
export interface EntityRef {
  type: EntityTypeToken;
  id: string;
}

/** A container reference — the deliberate set an edge may point at. */
export interface ContainerRef {
  type: AssociationTargetType;
  id: string;
}

/** Per-edge attributes shared by the link helpers. */
interface EdgeAttrs {
  orgId?: string;
  label?: string;
  metadata?: Json;
  role?: string;
  position?: number;
}

/** One fully-specified edge for {@link linkEdges}. */
export interface EdgeSpec extends EdgeAttrs {
  source: EntityRef;
  target: ContainerRef;
}

/** Combine many per-edge errors into one loud, described result error. */
function combine(failures: ScopesRpcError[], total: number): ScopesRpcError {
  const first = failures[0];
  return {
    code: failures.every((f) => f.code === first.code)
      ? first.code
      : "internal",
    message: `${failures.length}/${total} association edge(s) failed: ${first.message}`,
    detail: failures,
  };
}

/**
 * Add an arbitrary batch of edges in one call (idempotent per edge). Best-effort:
 * every edge is attempted; the result is `ok` with the created ids only when ALL
 * succeed, otherwise `err` whose `detail` lists every failure (the edges that DID
 * succeed remain applied — re-running is safe via ON CONFLICT).
 */
export async function linkEdges(
  edges: EdgeSpec[],
): Promise<ScopesRpcResult<{ ids: string[] }>> {
  if (edges.length === 0) return ok({ ids: [] });
  const results = await Promise.all(
    edges.map((e) =>
      associationsService.add({
        sourceType: e.source.type,
        sourceId: e.source.id,
        targetType: e.target.type,
        targetId: e.target.id,
        orgId: e.orgId,
        label: e.label,
        metadata: e.metadata,
        role: e.role,
        position: e.position,
      }),
    ),
  );
  const ids: string[] = [];
  const failures: ScopesRpcError[] = [];
  for (const r of results) {
    if (isScopesRpcErr(r)) failures.push(r.error);
    else ids.push(r.data.id);
  }
  if (failures.length > 0) return err(...errArgs(combine(failures, edges.length)));
  return ok({ ids });
}

function errArgs(
  e: ScopesRpcError,
): [ScopesRpcError["code"], string, unknown] {
  return [e.code, e.message, e.detail];
}

/**
 * Attach ONE source to MANY containers in a single shot (e.g. tag one note onto
 * several tasks/projects). Each `(source → target)` edge shares the passed attrs.
 */
export async function linkOneToMany(args: {
  source: EntityRef;
  targets: ContainerRef[];
  attrs?: EdgeAttrs;
}): Promise<ScopesRpcResult<{ ids: string[] }>> {
  const { source, targets, attrs } = args;
  return linkEdges(
    targets.map((target) => ({ source, target, ...attrs })),
  );
}

/**
 * Attach MANY sources to ONE container in a single shot (e.g. drop several files
 * onto a task, or a batch of cards into a set). Each `(source → target)` edge
 * shares the passed attrs.
 */
export async function linkManyToOne(args: {
  sources: EntityRef[];
  target: ContainerRef;
  attrs?: EdgeAttrs;
}): Promise<ScopesRpcResult<{ ids: string[] }>> {
  const { sources, target, attrs } = args;
  return linkEdges(sources.map((source) => ({ source, target, ...attrs })));
}

/**
 * REPLACE the full set of a source's edges of one container type (adds missing,
 * removes extras) in one DB transaction — the set-semantics one-shot. Thin,
 * named pass-through to the canonical `assoc_set_targets` so callers reach for
 * an intent-named helper rather than the low-level service.
 */
export async function replaceTargets(args: {
  source: EntityRef;
  targetType: AssociationTargetType;
  targetIds: string[];
  orgId?: string;
  role?: string;
}): Promise<ScopesRpcResult<null>> {
  return associationsService.setTargets({
    sourceType: args.source.type,
    sourceId: args.source.id,
    targetType: args.targetType,
    targetIds: args.targetIds,
    orgId: args.orgId,
    role: args.role,
  });
}

/**
 * Wire edges onto a JUST-CREATED entity. The caller inserts its own row (entity
 * tables are feature-owned — defaults like status/priority are product decisions
 * that belong in TS, not SQL), then passes the new id here to attach it to any
 * number of containers atomically-enough for this domain (orphan-on-partial-fail
 * is harmless and re-runnable). Returns the created edge ids.
 *
 * `created` is the new entity (its own row); `edges` are the containers to link
 * it INTO (created entity is the SOURCE).
 */
export async function linkCreated(args: {
  created: EntityRef;
  targets: ContainerRef[];
  attrs?: EdgeAttrs;
}): Promise<ScopesRpcResult<{ ids: string[] }>> {
  return linkOneToMany({
    source: args.created,
    targets: args.targets,
    attrs: args.attrs,
  });
}

/** Remove an arbitrary batch of edges (best-effort; no-op per missing edge). */
export async function unlinkEdges(
  edges: { source: EntityRef; target: ContainerRef; role?: string }[],
): Promise<ScopesRpcResult<null>> {
  if (edges.length === 0) return ok(null);
  const results = await Promise.all(
    edges.map((e) =>
      associationsService.remove({
        sourceType: e.source.type,
        sourceId: e.source.id,
        targetType: e.target.type,
        targetId: e.target.id,
        role: e.role,
      }),
    ),
  );
  const failures: ScopesRpcError[] = [];
  for (const r of results) if (isScopesRpcErr(r)) failures.push(r.error);
  if (failures.length > 0)
    return err(...errArgs(combine(failures, edges.length)));
  return ok(null);
}
