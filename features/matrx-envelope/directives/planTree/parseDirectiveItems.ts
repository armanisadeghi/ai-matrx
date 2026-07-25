import type { MatrxEnvelope } from "@/features/matrx-envelope/envelope";

import type {
  PlanNodePatchItem,
  PlanTreeDirectiveItem,
  PlanTreeNodeSpec,
} from "./types";

const NODE_TYPES = new Set(["home", "pillar", "cluster", "article", "index"]);

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function asStringArray(v: unknown): string[] | undefined {
  return Array.isArray(v)
    ? v.filter((s): s is string => typeof s === "string")
    : undefined;
}

function parseNode(raw: unknown): PlanTreeNodeSpec | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const label = asString(record.label);
  const nodeType = asString(record.node_type);
  if (!label || !nodeType || !NODE_TYPES.has(nodeType)) return null;
  const children = Array.isArray(record.children)
    ? record.children
        .map(parseNode)
        .filter((node): node is PlanTreeNodeSpec => node !== null)
    : undefined;
  return {
    label,
    node_type: nodeType as PlanTreeNodeSpec["node_type"],
    slug: asString(record.slug) ?? null,
    status: asString(record.status) ?? null,
    priority: typeof record.priority === "number" ? record.priority : null,
    brief: asStringArray(record.brief),
    topics: asStringArray(record.topics),
    children,
  };
}

/** Tolerant parse of `plan_tree` envelope items — never throws. */
export function parsePlanTreeItems(
  envelope: MatrxEnvelope,
): PlanTreeDirectiveItem[] {
  if (!Array.isArray(envelope.items)) return [];
  const items: PlanTreeDirectiveItem[] = [];
  for (const raw of envelope.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const siteId = asString(record.site_id);
    if (!siteId) continue;
    const nodes = Array.isArray(record.nodes)
      ? record.nodes
          .map(parseNode)
          .filter((node): node is PlanTreeNodeSpec => node !== null)
      : [];
    items.push({
      site_id: siteId,
      default_status: asString(record.default_status) ?? null,
      nodes,
    });
  }
  return items;
}

/** Tolerant parse of `plan_node_patch` envelope items — never throws. */
export function parsePlanNodePatchItems(
  envelope: MatrxEnvelope,
): PlanNodePatchItem[] {
  if (!Array.isArray(envelope.items)) return [];
  const items: PlanNodePatchItem[] = [];
  for (const raw of envelope.items) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const record = raw as Record<string, unknown>;
    const nodeId = asString(record.node_id);
    const siteId = asString(record.site_id);
    const route = asString(record.route);
    // Addressable by node_id OR site_id+route — otherwise unrenderable.
    if (!nodeId && !(siteId && route)) continue;
    items.push({
      node_id: nodeId ?? null,
      site_id: siteId ?? null,
      route: route ?? null,
      label: asString(record.label) ?? null,
      slug: asString(record.slug) ?? null,
      status: asString(record.status) ?? null,
      priority: typeof record.priority === "number" ? record.priority : null,
      brief: asStringArray(record.brief) ?? null,
    });
  }
  return items;
}
