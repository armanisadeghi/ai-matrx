// features/agents/org-chart/orgChartService.ts
//
// Recorded org chart links between boxes (agents, people, teams, positions).
// A THIN layer over the canonical association chokepoint (associationsService →
// assoc_* RPCs) — it owns no mutation path and no table. Orchestra links are
// member edges and are read and written by orchestrasService, never here.
//
// Every id in and out of this module is a BOX id (`type:entityId`, constants.ts).
// Every method returns a AssociationsRpcResult and never throws.

"use client";

import { isAssociationsRpcErr, type AssociationsRpcResult } from "@ai-matrx/associations";
import { associationsService } from "@/features/scopes/service/associationsService";
import { err, ok } from "@/features/scopes/service/rpcResult";
import { MEMBER_ROLE } from "@/features/agents/orchestras/constants";
import {
  ORG_CHART_READ_CHUNK,
  ORG_CHART_ROLE,
  ORG_LINK_KIND_KEY,
  ORG_LINK_KIND_META,
  boxId,
  isOrgBoxType,
  parseBoxId,
  recordedLinkKindOf,
  type OrgBoxType,
  type RecordedLinkKind,
} from "./constants";
import type { ManualOrgEdge } from "./buildAgentOrgForest";

/** PostgREST answers at most this many rows and says nothing when it stops. */
const ROW_CAP = 1000;

interface RawEdge {
  id: string;
  from: string; // box id
  to: string; // box id
  role: string | null;
  metadata: unknown;
}

type Read = AssociationsRpcResult<RawEdge[]>;

/** Group box ids by type: { agent: [...], user: [...] }. */
function byType(boxIds: readonly string[]): Map<OrgBoxType, string[]> {
  const out = new Map<OrgBoxType, string[]>();
  for (const b of new Set(boxIds)) {
    if (!b) continue;
    const { type, id } = parseBoxId(b);
    out.set(type, [...(out.get(type) ?? []), id]);
  }
  return out;
}

const overCap = () => err("quota_exceeded", `One box has ${ROW_CAP} or more links; the org chart can't read them all.`);

/**
 * Every edge OUT of (or INTO) these entities of one type. A read that comes back
 * AT the row cap may have been cut short, so it is split and re-read until each
 * answer is provably whole; a single entity over the cap fails loudly instead of lying.
 */
async function readWhole(type: OrgBoxType, ids: string[], direction: "out" | "in"): Promise<Read> {
  if (direction === "out") {
    const res = await associationsService.listForSources(type, ids);
    if (isAssociationsRpcErr(res)) return res;
    if (res.data.edges.length < ROW_CAP) {
      return ok(
        res.data.edges
          .filter((e) => isOrgBoxType(e.targetType))
          .map((e) => ({
            id: e.id,
            from: boxId(type, e.sourceId),
            to: boxId(e.targetType as OrgBoxType, e.targetId),
            role: e.role,
            metadata: e.metadata,
          })),
      );
    }
  } else {
    const res = await associationsService.listForTargets(type, ids);
    if (isAssociationsRpcErr(res)) return res;
    if (res.data.edges.length < ROW_CAP) {
      return ok(
        res.data.edges
          .filter((e) => isOrgBoxType(e.sourceType))
          .map((e) => ({
            id: e.id,
            from: boxId(e.sourceType as OrgBoxType, e.sourceId),
            to: boxId(type, e.targetId),
            role: e.role,
            metadata: e.metadata,
          })),
      );
    }
  }
  if (ids.length === 1) return overCap();
  const mid = Math.ceil(ids.length / 2);
  const [a, b] = await Promise.all([
    readWhole(type, ids.slice(0, mid), direction),
    readWhole(type, ids.slice(mid), direction),
  ]);
  if (isAssociationsRpcErr(a)) return a;
  if (isAssociationsRpcErr(b)) return b;
  return ok([...a.data, ...b.data]);
}

async function readAll(boxIds: readonly string[], direction: "out" | "in"): Promise<Read> {
  const out: RawEdge[] = [];
  for (const [type, ids] of byType(boxIds)) {
    for (let i = 0; i < ids.length; i += ORG_CHART_READ_CHUNK) {
      const res = await readWhole(type, ids.slice(i, i + ORG_CHART_READ_CHUNK), direction);
      if (isAssociationsRpcErr(res)) return res;
      out.push(...res.data);
    }
  }
  return ok(out);
}

const toManual = (e: RawEdge): ManualOrgEdge => ({
  edgeId: e.id,
  managerId: e.from,
  reportId: e.to,
  kind: recordedLinkKindOf(e.metadata),
});

const isRecorded = (e: RawEdge) => e.role === ORG_CHART_ROLE && e.from !== e.to;
const isTree = (e: RawEdge) => ORG_LINK_KIND_META[recordedLinkKindOf(e.metadata)].tree;

export const orgChartService = {
  /**
   * Every recorded link touching these boxes. `direction: "both"` also reads
   * links INTO them — how a person or team that only appears above an agent is
   * discovered.
   */
  async listManualEdges(
    boxIds: readonly string[],
    direction: "out" | "both" = "out",
  ): Promise<AssociationsRpcResult<ManualOrgEdge[]>> {
    const out = await readAll(boxIds, "out");
    if (isAssociationsRpcErr(out)) return out;
    const edges = out.data.filter(isRecorded);
    if (direction === "both") {
      const into = await readAll(boxIds, "in");
      if (isAssociationsRpcErr(into)) return into;
      edges.push(...into.data.filter(isRecorded));
    }
    const seen = new Set<string>();
    return ok(edges.filter((e) => !seen.has(e.id) && Boolean(seen.add(e.id))).map(toManual));
  },

  /**
   * Everyone directly under these boxes by a TREE link (Orchestra or reports to),
   * read fresh from the server, so a loop check never trusts a half-loaded chart.
   */
  async listChildren(boxIds: readonly string[]): Promise<AssociationsRpcResult<Array<{ parentId: string; childId: string }>>> {
    const res = await readAll(boxIds, "out");
    if (isAssociationsRpcErr(res)) return res;
    return ok(
      res.data
        .filter((e) => e.from !== e.to && (e.role === MEMBER_ROLE || (e.role === ORG_CHART_ROLE && isTree(e))))
        .map((e) => ({ parentId: e.from, childId: e.to })),
    );
  },

  /** The recorded TREE links that currently place this box under someone. */
  async listManagersOf(reportBoxId: string): Promise<AssociationsRpcResult<ManualOrgEdge[]>> {
    const res = await readAll([reportBoxId], "in");
    if (isAssociationsRpcErr(res)) return res;
    return ok(res.data.filter((e) => isRecorded(e) && isTree(e)).map(toManual));
  },

  /** Record (or re-type) the one link between this pair — the edge is unique per pair. */
  async add(fromBox: string, toBox: string, kind: RecordedLinkKind = "reports_to"): Promise<AssociationsRpcResult<{ id: string }>> {
    const from = parseBoxId(fromBox);
    const to = parseBoxId(toBox);
    return associationsService.add({
      sourceType: from.type,
      sourceId: from.id,
      targetType: to.type,
      targetId: to.id,
      role: ORG_CHART_ROLE,
      metadata: { [ORG_LINK_KIND_KEY]: kind },
    });
  },

  async remove(fromBox: string, toBox: string): Promise<AssociationsRpcResult<null>> {
    const from = parseBoxId(fromBox);
    const to = parseBoxId(toBox);
    return associationsService.remove({
      sourceType: from.type,
      sourceId: from.id,
      targetType: to.type,
      targetId: to.id,
      role: ORG_CHART_ROLE,
    });
  },
};
