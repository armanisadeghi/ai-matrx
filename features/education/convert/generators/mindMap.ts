// features/education/convert/generators/mindMap.ts
//
// Converter generator: source text → a mind map (diagram_spec, persisted to
// study_media). Wraps the Study Mind Map agent + studyMediaService.create, then
// links a `source` lineage edge to the ingest anchor file.

import { studyMediaService } from "@/features/education/media/service";
import { EDU_MEDIA_AGENTS } from "@/features/education/media/mindmap/agents";
import { associationsService } from "@/features/scopes/service/associationsService";
import { runAgentExtraction } from "../runAgentExtraction";
import { buildSourceTrust } from "../sourceTrust";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

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

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;

  const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
    agentId: EDU_MEDIA_AGENTS.mindMap,
    surfaceKey: "education-ingest-mindmap",
    sourceFeature: "education-ingest",
    variables: {
      source_content: source.text,
      title: source.title ?? "Study material",
      focus: options?.focus ?? "",
    },
    timeoutMs: 120_000,
    onRequestId: ctx.onRequestId,
  });

  if (!isDiagramSpec(extracted.value)) {
    throw new Error("The mind map generator returned no usable diagram");
  }
  const spec = extracted.value;
  const title = spec.title || source.title || "Mind map";
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

  if (source.ref?.fileId) {
    const edge = await associationsService.add({
      sourceType: "study_media",
      sourceId: id,
      targetType: "file",
      targetId: source.ref.fileId,
      role: "source",
      orgId: ctx.orgId,
    });
    if (!edge.ok) console.error("[convert/mindMap] source edge failed:", edge);
  }

  const nodeCount = spec.nodes.length;
  return {
    targetKind: "mind_map",
    artifactId: id,
    resourceType: "study_media",
    href: `/education/mind-maps/${id}`,
    title,
    trust,
    detail: `${nodeCount} node${nodeCount === 1 ? "" : "s"}`,
  };
}

export const mindMapGenerator: ConvertGenerator = {
  targetKind: "mind_map",
  label: "Mind map",
  available: true,
  capability: "education.mindmap_generate",
  run,
};
