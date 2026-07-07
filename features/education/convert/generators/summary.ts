// features/education/convert/generators/summary.ts
//
// Converter generator: source text → a grounded study summary (persisted to
// education.study_media, media_kind='summary'). The summary agent emits
// { title, summary_markdown, key_points[], trust }; we persist the markdown +
// key points in ir_envelope (kind 'study_summary') and the TrustEnvelope in the
// trust column, then link a `source` lineage edge to the ingest anchor file.

import { studyMediaService } from "@/features/education/media/service";
import { associationsService } from "@/features/scopes/service/associationsService";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { CONVERT_AGENTS } from "../agents";
import { runAgentExtraction } from "../runAgentExtraction";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

/** The persisted summary envelope (rides study_media.ir_envelope). */
export interface StudySummaryEnvelope {
  __kind: "study_summary";
  title: string;
  markdown: string;
  key_points: string[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coerceSummary(value: unknown): {
  title: string;
  markdown: string;
  keyPoints: string[];
  trust: TrustEnvelope | null;
} {
  const obj = isRecord(value) ? value : {};
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const markdown =
    typeof obj.summary_markdown === "string" ? obj.summary_markdown.trim() : "";
  const keyPoints = Array.isArray(obj.key_points)
    ? obj.key_points.filter((k): k is string => typeof k === "string" && !!k.trim())
    : [];
  return { title, markdown, keyPoints, trust: coerceTrustEnvelope(obj) };
}

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;

  const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
    agentId: CONVERT_AGENTS.summarize,
    surfaceKey: "education-ingest-summary",
    sourceFeature: "education-ingest",
    variables: {
      source_content: source.text,
      title: source.title ?? "",
      focus: options?.focus ?? "",
    },
    timeoutMs: 120_000,
    onRequestId: ctx.onRequestId,
  });

  const { title, markdown, keyPoints, trust } = coerceSummary(extracted.value);
  if (!markdown) {
    throw new Error("The summary generator returned no usable summary");
  }
  const finalTitle = title || source.title || "Study summary";

  const envelope: StudySummaryEnvelope = {
    __kind: "study_summary",
    title: finalTitle,
    markdown,
    key_points: keyPoints,
  };

  const media = await studyMediaService.create({
    mediaKind: "summary",
    title: finalTitle,
    description: keyPoints[0] ?? null,
    source: { kind: "topic", title: source.title ?? finalTitle },
    irEnvelope: envelope,
    trust,
    status: "ready",
  });
  if (media.error || !media.data) {
    throw new Error(media.error ?? "Failed to save the summary");
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
    if (!edge.ok) console.error("[convert/summary] source edge failed:", edge);
  }

  return {
    targetKind: "summary",
    artifactId: id,
    resourceType: "study_media",
    href: `/education/summaries/${id}`,
    title: finalTitle,
    trust,
    detail: keyPoints.length
      ? `${keyPoints.length} key point${keyPoints.length === 1 ? "" : "s"}`
      : "Summary",
  };
}

export const summaryGenerator: ConvertGenerator = {
  targetKind: "summary",
  label: "Study summary",
  available: true,
  capability: "education.ingest_document",
  run,
};
