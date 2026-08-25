// features/education/convert/generators/summary.ts
//
// Converter generator: source text -> a grounded study summary (persisted to
// education.study_media, media_kind='summary'). The summary agent emits
// { title, summary_markdown, key_points[], trust }; we persist the markdown +
// key points in ir_envelope (kind 'study_summary') and the TrustEnvelope in the
// trust column, then link a `source` lineage edge to the ingest anchor file.
//
// COVERAGE (2026-08-21): one call over a 77-slide chemistry deck returned five
// key points and under half a page of prose. A summary of a long document is not
// one paragraph — it is a section per part of the document. It now runs per
// coverage section (`../coverage.ts`) and stitches the sections into one
// summary, so the length tracks the material instead of the model's instinct
// about how long a summary should be.

import { studyMediaService } from "@/features/education/media/service";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { CONVERT_MANDATES } from "../mandates";
import { recordSourceLineage } from "../recordSourceLineage";
import { looseKey, segmentedGenerate } from "../segmentedGenerate";
import { mergeTrustEnvelopes } from "../trustMerge";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

/**
 * The persisted summary envelope (rides study_media.ir_envelope).
 *
 * Since 2026-08-25 `study_summary` is a REGISTERED platform kind (system org,
 * public) whose shape is the summarize agent's real contract —
 * `summary_markdown`, not the fabricated `markdown` spelling this file used
 * to invent client-side. Old rows persisted the fabricated spelling;
 * SummaryDetail reads `summary_markdown ?? markdown`.
 */
export interface StudySummaryEnvelope {
  __kind: "study_summary";
  title: string;
  summary_markdown: string;
  key_points: string[];
  trust?: TrustEnvelope | null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** One section's contribution: its prose and its key points, kept together so
 *  the merged summary keeps the document's own order. */
interface SummaryPiece {
  section: string;
  index: number;
  markdown: string;
  keyPoint: string | null;
  trust: TrustEnvelope | null;
}

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const baseTitle = source.title ?? "";

  let agentTitle = "";
  const proseBySection = new Map<number, { label: string; markdown: string }>();

  const covered = await segmentedGenerate<SummaryPiece>({
    ctx,
    source,
    targetKind: "summary",
    options,
    mandateKey: CONVERT_MANDATES.summarize,
    surfaceKey: "education-ingest-summary",
    sourceFeature: "education-ingest",
    variables: (segment, plan) => ({
      source_content: segment.text,
      title:
        plan.segments.length > 1
          ? `${baseTitle || "Study material"} - section ${segment.index} of ${segment.total}: ${segment.label}`
          : baseTitle,
      focus: options?.focus ?? "",
    }),
    extract: (value, segment) => {
      const obj = isRecord(value) ? value : {};
      const title = typeof obj.title === "string" ? obj.title.trim() : "";
      if (!agentTitle && title) agentTitle = title;
      const markdown =
        typeof obj.summary_markdown === "string"
          ? obj.summary_markdown.trim()
          : "";
      if (markdown) {
        proseBySection.set(segment.index, {
          // The section's own heading is what a student recognises; the agent's
          // per-section title is about the same text and adds nothing.
          label: segment.label || title || `Part ${segment.index}`,
          markdown,
        });
      }
      const trust = coerceTrustEnvelope(obj);
      const keyPoints = Array.isArray(obj.key_points)
        ? obj.key_points.filter(
            (k): k is string => typeof k === "string" && !!k.trim(),
          )
        : [];
      // Every key point rides as its own item so the shared runner can
      // de-duplicate across sections; the prose is collected above, keyed by
      // section, and re-assembled in document order below.
      if (keyPoints.length === 0) {
        return markdown
          ? [
              {
                section: segment.label,
                index: segment.index,
                markdown,
                keyPoint: null,
                trust,
              },
            ]
          : [];
      }
      return keyPoints.map((kp) => ({
        section: segment.label,
        index: segment.index,
        markdown,
        keyPoint: kp,
        trust,
      }));
    },
    identity: (piece) => (piece.keyPoint ? looseKey(piece.keyPoint) : ""),
  });

  const keyPoints = covered.items
    .map((p) => p.keyPoint)
    .filter((k): k is string => !!k);

  // Re-assemble the prose in the document's own order. A multi-section summary
  // gets a heading per section so it reads as a revision sheet for the whole
  // document rather than eight paragraphs run together.
  const ordered = [...proseBySection.entries()].sort((a, b) => a[0] - b[0]);
  const markdown = covered.plan.singlePass
    ? (ordered[0]?.[1].markdown ?? "")
    : ordered
        .map(([, part]) => `## ${part.label}\n\n${part.markdown}`)
        .join("\n\n");

  if (!markdown) {
    throw new Error("The summary generator returned no usable summary");
  }

  const finalTitle = covered.plan.singlePass
    ? agentTitle || source.title || "Study summary"
    : source.title || agentTitle || "Study summary";

  const trust = mergeTrustEnvelopes(covered.items.map((p) => p.trust));

  const envelope: StudySummaryEnvelope = {
    __kind: "study_summary",
    title: finalTitle,
    summary_markdown: markdown,
    key_points: keyPoints,
    trust,
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

  const detail = keyPoints.length
    ? `${keyPoints.length} key point${keyPoints.length === 1 ? "" : "s"}`
    : "Summary";

  const result: ConvertResult = {
    targetKind: "summary",
    artifactId: id,
    resourceType: "study_media",
    href: `/education/summaries/${id}`,
    title: finalTitle,
    trust,
    detail: covered.gapNote ? `${detail} - ${covered.gapNote}` : detail,
  };

  await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const summaryGenerator: ConvertGenerator = {
  targetKind: "summary",
  label: "Study summary",
  available: true,
  capability: "education.ingest_document",
  run,
};
