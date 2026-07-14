// features/education/convert/generators/memoryAid.ts
//
// Converter generator: source text → a memory-aid set (persisted to study_media,
// media_kind='memory_aid'). Wraps the Study Memory Aid agent + studyMediaService
// .create, then links a `source` lineage edge to the ingest anchor via the shared
// recordSourceLineage helper. Lets note→memory-aid AND the /education/start
// upload-kit fan-out produce memory aids on the ONE converter dispatch.

import { studyMediaService } from "@/features/education/media/service";
import { EDU_MEMORY_AGENTS } from "@/features/education/memory/agents";
import {
  coerceMemoryAid,
  memoryAidCounts,
} from "@/features/education/memory/types";
import { runAgentExtraction } from "../runAgentExtraction";
import { recordSourceLineage } from "../recordSourceLineage";
import { buildSourceTrust } from "../sourceTrust";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;

  const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
    agentId: EDU_MEMORY_AGENTS.memoryAid,
    surfaceKey: "education-ingest-memory",
    sourceFeature: "education-ingest",
    variables: {
      source_content: source.text,
      title: source.title ?? "Study material",
      focus: options?.focus ?? "",
    },
    timeoutMs: 120_000,
    onRequestId: ctx.onRequestId,
  });

  const payload = coerceMemoryAid(extracted.value);
  if (!payload) {
    throw new Error("The memory-aid generator returned no usable aids");
  }
  const title = payload.title || source.title || "Memory aids";
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
  if (payload.mnemonics.length) {
    parts.push(
      `${payload.mnemonics.length} mnemonic${payload.mnemonics.length === 1 ? "" : "s"}`,
    );
  }
  if (payload.analogies.length) {
    parts.push(
      `${payload.analogies.length} anal${payload.analogies.length === 1 ? "ogy" : "ogies"}`,
    );
  }
  if (payload.memoryPalace.applicable) parts.push("memory palace");

  const result: ConvertResult = {
    targetKind: "memory_aid",
    artifactId: id,
    resourceType: "study_media",
    href: `/education/memory/${id}`,
    title,
    trust,
    detail: parts.join(" · ") || undefined,
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
