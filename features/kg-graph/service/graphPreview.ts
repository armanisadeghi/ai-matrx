// features/kg-graph/service/graphPreview.ts
//
// Cached, deduped fetch of the top-N most-connected nodes for the mini graph
// CARD previews embedded on org / scope pages. The card must never hammer the
// (slow) /kg/graph handler on every page view, so:
//   - tiny limit (a card only needs the biggest dozen-ish nodes)
//   - module-level cache keyed by (filter, limit) with a TTL
//   - in-flight de-duplication (concurrent cards for the same filter share one call)
// One network call per (filter, limit) per TTL window across the whole session.
//
// If profiling shows even this is too heavy at scale, the next step is a
// precomputed summary RPC/table (docs/knowledge/05 §B5) — this module is the
// single seam to swap that in behind.

import { fetchKgGraph } from "./kgGraphService";
import type { GraphPayload } from "../types";

export type PreviewFilter =
  | { kind: "org"; id: string }
  | { kind: "scope"; id: string };

interface CacheEntry {
  ts: number;
  data: GraphPayload;
}

const TTL_MS = 5 * 60_000; // 5 minutes
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<GraphPayload>>();

function keyFor(f: PreviewFilter, limit: number): string {
  return `${f.kind}:${f.id}:${limit}`;
}

export async function fetchGraphPreview(
  f: PreviewFilter,
  limit = 14,
  opts: { signal?: AbortSignal } = {},
): Promise<GraphPayload> {
  const key = keyFor(f, limit);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.data;

  const existing = inflight.get(key);
  if (existing) return existing;

  const p = fetchKgGraph(
    f.kind === "org" ? { organizationId: f.id, limit } : { scopeId: f.id, limit },
    opts,
  )
    .then((data) => {
      cache.set(key, { ts: Date.now(), data });
      inflight.delete(key);
      return data;
    })
    .catch((e: unknown) => {
      inflight.delete(key);
      throw e;
    });

  inflight.set(key, p);
  return p;
}
