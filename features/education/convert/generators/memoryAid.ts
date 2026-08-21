// features/education/convert/generators/memoryAid.ts
//
// Converter generator: source text -> a memory-aid set (persisted to study_media,
// media_kind='memory_aid'). Wraps the Study Memory Aid agent + studyMediaService
// .create, then links a `source` lineage edge to the ingest anchor via the shared
// recordSourceLineage helper. Lets note->memory-aid AND the /education/start
// upload-kit fan-out produce memory aids on the ONE converter dispatch.
//
// COVERAGE (2026-08-21): one call over a 77-slide deck produced 4 mnemonics and
// 3 analogies for the whole document. It now runs per coverage section
// (`../coverage.ts`), so the aids reach the material at the end of the deck too.
// The memory PALACE stays a single structure: a palace is one journey through
// one set of places, and stitching eight of them together would produce a
// building nobody can walk. The first section that proposes an applicable palace
// owns it, and its loci are extended with later sections' loci.

import { studyMediaService } from "@/features/education/media/service";
import { EDU_MEMORY_MANDATES } from "@/features/education/memory/mandates";
import {
  coerceMemoryAid,
  type MemoryAidPayload,
} from "@/features/content-ir/kinds/memory-aid";
import { memoryAidCounts } from "@/features/education/memory/types";
import { recordSourceLineage } from "../recordSourceLineage";
import { looseKey, segmentedGenerate } from "../segmentedGenerate";
import { buildSourceTrust } from "../sourceTrust";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

/**
 * One section's aids, flattened into a single stream so the shared segmented
 * runner can de-duplicate across sections with one identity function. They are
 * re-grouped into the payload after the fan-out.
 */
type AidItem =
  | { row: "mnemonic"; value: MemoryAidPayload["mnemonics"][number] }
  | { row: "analogy"; value: MemoryAidPayload["analogies"][number] }
  | { row: "locus"; value: MemoryAidPayload["memoryPalace"]["loci"][number] };

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const baseTitle = source.title ?? "Study material";

  let agentTitle = "";
  let strategyNote: string | null = null;
  let palaceTheme = "";
  let palaceApplicable = false;

  const covered = await segmentedGenerate<AidItem>({
    ctx,
    source,
    targetKind: "memory_aid",
    options,
    mandateKey: EDU_MEMORY_MANDATES.memoryAid,
    surfaceKey: "education-ingest-memory",
    sourceFeature: "education-ingest",
    variables: (segment, plan) => ({
      source_content: segment.text,
      title:
        plan.segments.length > 1
          ? `${baseTitle} - section ${segment.index} of ${segment.total}: ${segment.label}`
          : baseTitle,
      focus: options?.focus ?? "",
    }),
    extract: (value) => {
      const payload = coerceMemoryAid(value);
      if (!payload) return [];
      if (!agentTitle && payload.title) agentTitle = payload.title;
      if (strategyNote === null && payload.strategyNote) {
        strategyNote = payload.strategyNote;
      }
      if (!palaceApplicable && payload.memoryPalace.applicable) {
        palaceApplicable = true;
        palaceTheme = payload.memoryPalace.theme;
      }
      return [
        ...payload.mnemonics.map(
          (m): AidItem => ({ row: "mnemonic", value: m }),
        ),
        ...payload.analogies.map((a): AidItem => ({ row: "analogy", value: a })),
        ...payload.memoryPalace.loci.map(
          (l): AidItem => ({ row: "locus", value: l }),
        ),
      ];
    },
    // Sections that share a concept produce the same aid for it; keep one.
    identity: (item) =>
      item.row === "mnemonic"
        ? `m:${looseKey(item.value.target)}`
        : item.row === "analogy"
          ? `a:${looseKey(item.value.concept)}`
          : `l:${looseKey(item.value.item)}`,
  });

  const mnemonics = covered.items
    .filter((i) => i.row === "mnemonic")
    .map((i) => i.value as MemoryAidPayload["mnemonics"][number]);
  const analogies = covered.items
    .filter((i) => i.row === "analogy")
    .map((i) => i.value as MemoryAidPayload["analogies"][number]);
  const loci = covered.items
    .filter((i) => i.row === "locus")
    .map((i) => i.value as MemoryAidPayload["memoryPalace"]["loci"][number]);

  if (mnemonics.length === 0 && analogies.length === 0 && loci.length === 0) {
    throw new Error("The memory-aid generator returned no usable aids");
  }

  const title = covered.plan.singlePass
    ? agentTitle || source.title || "Memory aids"
    : source.title || agentTitle || "Memory aids";

  const payload: MemoryAidPayload = {
    __kind: "memory_aid",
    title,
    strategyNote,
    mnemonics,
    analogies,
    memoryPalace: {
      __kind: "memory_palace",
      applicable: palaceApplicable && loci.length > 0,
      theme: palaceTheme,
      loci,
    },
  };

  // The memory_aid agent returns structure (not a trust envelope) — build the
  // P0 envelope from the known source, exactly like the mind-map generator.
  const trust = buildSourceTrust(source, title);

  const media = await studyMediaService.create({
    mediaKind: "memory_aid",
    title,
    source: { kind: "topic", title: source.title ?? title },
    config: { focus: options?.focus || undefined, ...memoryAidCounts(payload) },
    trust,
    irEnvelope: payload,
    status: "ready",
  });
  if (media.error || !media.data) {
    throw new Error(media.error ?? "Failed to save the memory aids");
  }
  const id = media.data.id;

  const parts: string[] = [];
  if (mnemonics.length) {
    parts.push(`${mnemonics.length} mnemonic${mnemonics.length === 1 ? "" : "s"}`);
  }
  if (analogies.length) {
    parts.push(`${analogies.length} anal${analogies.length === 1 ? "ogy" : "ogies"}`);
  }
  if (payload.memoryPalace.applicable) parts.push("memory palace");
  const detail = parts.join(" · ") || undefined;

  const result: ConvertResult = {
    targetKind: "memory_aid",
    artifactId: id,
    resourceType: "study_media",
    href: `/education/memory/${id}`,
    title,
    trust,
    detail: covered.gapNote ? `${detail ?? "Memory aids"} - ${covered.gapNote}` : detail,
  };

  await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const memoryAidGenerator: ConvertGenerator = {
  targetKind: "memory_aid",
  label: "Memory aids",
  available: true,
  capability: "education.memory_generate",
  run,
};
