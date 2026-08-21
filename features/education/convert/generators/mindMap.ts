// features/education/convert/generators/mindMap.ts
//
// Converter generator: source text -> a mind map (diagram_spec, persisted to
// study_media). Wraps the Study Mind Map agent + studyMediaService.create, then
// links a `source` lineage edge to the ingest anchor file.
//
// COVERAGE (2026-08-21): one call over a 77-slide deck produced a 16-node map of
// its opening slides. A mind map of a long document is a map of its SECTIONS, so
// this now generates one sub-map per coverage section (`../coverage.ts`) and
// grafts each under a single document root.
//
// THE GRAFT: two independently generated sub-maps both name their nodes `n1`,
// `root`, `c2`. Merging them naively silently collapses distinct concepts into
// one node and rewires edges to the wrong place, which is worse than a small
// map. So every node id is namespaced by its section before the merge, edges are
// rewritten through the same map, and each section's own root is attached to a
// synthesized document root.

import { studyMediaService } from "@/features/education/media/service";
import { EDU_MEDIA_MANDATES } from "@/features/education/media/mindmap/mandates";
import { recordSourceLineage } from "../recordSourceLineage";
import { segmentedGenerate } from "../segmentedGenerate";
import { buildSourceTrust } from "../sourceTrust";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

interface DiagramNode extends Record<string, unknown> {
  id?: unknown;
  label?: unknown;
}
interface DiagramEdge extends Record<string, unknown> {
  source?: unknown;
  target?: unknown;
  from?: unknown;
  to?: unknown;
}
interface DiagramSpec {
  __kind: "diagram_spec";
  title: string;
  type?: string;
  description?: string | null;
  nodes: unknown[];
  edges: unknown[];
}

function isDiagramSpec(v: unknown): v is DiagramSpec {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { __kind?: unknown }).__kind === "diagram_spec" &&
    Array.isArray((v as { nodes?: unknown }).nodes)
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** A whole section's sub-map, already namespaced and ready to graft. */
interface SectionMap {
  index: number;
  label: string;
  rootId: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

/**
 * Namespace one section's sub-map. Returns its nodes/edges with prefixed ids and
 * the id of the node the section should hang from (its own root: the node with
 * no incoming edge, else the first node).
 */
function namespaceSection(
  spec: DiagramSpec,
  segmentId: string,
  label: string,
  index: number,
): SectionMap | null {
  const nodes = spec.nodes.filter(isRecord) as DiagramNode[];
  if (nodes.length === 0) return null;
  const edges = (Array.isArray(spec.edges) ? spec.edges : []).filter(
    isRecord,
  ) as DiagramEdge[];

  const ns = (id: unknown): string | null =>
    typeof id === "string" && id ? `${segmentId}_${id}` : null;

  const known = new Set<string>();
  const outNodes: DiagramNode[] = [];
  for (const n of nodes) {
    const id = ns(n.id);
    if (!id || known.has(id)) continue;
    known.add(id);
    outNodes.push({ ...n, id });
  }

  const targeted = new Set<string>();
  const outEdges: DiagramEdge[] = [];
  for (const e of edges) {
    const source = ns(e.source ?? e.from);
    const target = ns(e.target ?? e.to);
    // An edge to a node this section never declared would render as a dangling
    // arrow; drop it rather than invent the node.
    if (!source || !target || !known.has(source) || !known.has(target)) continue;
    targeted.add(target);
    const next: DiagramEdge = { ...e, source, target };
    delete next.from;
    delete next.to;
    outEdges.push(next);
  }

  const rootId =
    outNodes.find((n) => typeof n.id === "string" && !targeted.has(n.id))?.id ??
    outNodes[0].id;

  return {
    index,
    label,
    rootId: String(rootId),
    nodes: outNodes,
    edges: outEdges,
  };
}

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const baseTitle = source.title ?? "Study material";
  let agentTitle = "";
  let singleSpec: DiagramSpec | null = null;

  const covered = await segmentedGenerate<SectionMap>({
    ctx,
    source,
    targetKind: "mind_map",
    options,
    mandateKey: EDU_MEDIA_MANDATES.mindMap,
    surfaceKey: "education-ingest-mindmap",
    sourceFeature: "education-ingest",
    variables: (segment, plan) => ({
      source_content: segment.text,
      title:
        plan.segments.length > 1
          ? `${baseTitle} - section ${segment.index} of ${segment.total}: ${segment.label}`
          : baseTitle,
      focus: options?.focus ?? "",
    }),
    extract: (value, segment) => {
      if (!isDiagramSpec(value)) return [];
      if (!agentTitle && value.title) agentTitle = value.title;
      singleSpec = value;
      const section = namespaceSection(
        value,
        segment.id,
        segment.label || value.title || `Part ${segment.index}`,
        segment.index,
      );
      return section ? [section] : [];
    },
    // Sections are distinct sub-maps by construction; nothing to de-duplicate.
    identity: () => "",
  });

  if (covered.items.length === 0) {
    throw new Error("The mind map generator returned no usable diagram");
  }

  const title = covered.plan.singlePass
    ? agentTitle || source.title || "Mind map"
    : source.title || agentTitle || "Mind map";

  let spec: DiagramSpec;
  if (covered.plan.singlePass && singleSpec) {
    // A single-pass map is the agent's own spec, untouched — no namespacing, no
    // synthesized root, exactly what shipped before.
    spec = singleSpec;
  } else {
    const sections = [...covered.items].sort((a, b) => a.index - b.index);
    const ROOT = "kit_root";
    spec = {
      __kind: "diagram_spec",
      title,
      type: "mindmap",
      description: `A map of all ${sections.length} sections of ${title}.`,
      nodes: [
        { __kind: "diagram_node", id: ROOT, label: title, type: "root" },
        ...sections.flatMap((s) => s.nodes),
      ],
      edges: [
        ...sections.map((s) => ({
          __kind: "diagram_edge",
          source: ROOT,
          target: s.rootId,
          label: s.label,
        })),
        ...sections.flatMap((s) => s.edges),
      ],
    };
  }

  const trust = buildSourceTrust(source, title);

  const media = await studyMediaService.create({
    mediaKind: "mind_map",
    title,
    source: { kind: "topic", title: source.title ?? title },
    config: { diagramKind: "diagram_spec", hint: options?.focus || undefined },
    trust,
    irEnvelope: spec,
    diagramKind: "diagram_spec",
    status: "ready",
  });
  if (media.error || !media.data) {
    throw new Error(media.error ?? "Failed to save the mind map");
  }
  const id = media.data.id;

  const nodeCount = spec.nodes.length;
  const detail = `${nodeCount} node${nodeCount === 1 ? "" : "s"}`;
  const result: ConvertResult = {
    targetKind: "mind_map",
    artifactId: id,
    resourceType: "study_media",
    href: `/education/mind-maps/${id}`,
    title,
    trust,
    detail: covered.gapNote ? `${detail} - ${covered.gapNote}` : detail,
  };

  await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const mindMapGenerator: ConvertGenerator = {
  targetKind: "mind_map",
  label: "Mind map",
  available: true,
  capability: "education.mindmap_generate",
  run,
};
