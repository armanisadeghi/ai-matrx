// features/education/media/audio/audioGenerator.ts
//
// Converter generator: source text → an Audio Study artifact (an audio overview,
// podcast-style). This is the `audio` TargetKind P3 owns; registering it lights
// the "Audio overview" target up on the P9 ingest kit picker and the P4 one-click
// note→audio menu (they were showing "coming soon" behind a placeholder).
//
// Reuse-first: it drives the SAME canonical audio-create path the interactive
// tool uses (buildAudioRequest → studioRunsService.createRun → studyMediaService
// → pendingStart) rather than forking a second audio flow. Audio is a STREAMED
// pipeline (unlike the summary/notes single round-trip), so the generator creates
// the durable run + artifact (status 'generating', grounded TrustEnvelope) and
// returns its href; the Audio Study detail page streams it to completion with the
// same agent_run recovery every other audio study uses. TrustEnvelope is derived
// from the known source (the podcast pipeline returns audio, not citations).

import { studioRunsService } from "@/features/podcasts/studio/runs/service";
import { stashPendingStart } from "@/features/podcasts/studio/runs/pendingStart";
import { studyMediaService } from "../service";
import { buildAudioRequest } from "./audioBrief";
import { buildSourceTrust } from "@/features/education/convert/sourceTrust";
import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "@/features/education/convert/types";

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source } = request;
  if (!source.text.trim()) {
    throw new Error("The audio generator needs source text to narrate");
  }

  const title = `Audio overview · ${source.title ?? "Study material"}`;
  const trust = buildSourceTrust(source, title);

  // Same request shaping + run/artifact creation as useAudioStudyCreate — the
  // source is already-extracted content, so it rides as `note` (full_content).
  const podcastRequest = buildAudioRequest({
    format: "overview",
    sourceKind: "note",
    content: source.text,
  });

  const runRow = await studioRunsService.createRun({
    status: "running",
    input_data_type: podcastRequest.input_data_type,
    podcast_type: podcastRequest.podcast_type,
    request: podcastRequest,
    title,
  });

  const media = await studyMediaService.create({
    mediaKind: "audio",
    title,
    source: { kind: "note", title: source.title ?? "Study material" },
    config: {
      format: "overview",
      hostCount: podcastRequest.host_count ?? 2,
      adaptive: false,
      language: podcastRequest.language,
    },
    trust,
    audioFormat: "overview",
    runId: runRow.id,
    status: "generating",
  });
  if (media.error || !media.data) {
    throw new Error(media.error ?? "Failed to create the audio study");
  }
  const id = media.data.id;

  // Hand the request to the detail page for the same-tab streaming start; a
  // cold open resumes from the durable run instead (agent_run recovery).
  stashPendingStart(runRow.id, podcastRequest);

  const result: ConvertResult = {
    targetKind: "audio",
    artifactId: id,
    resourceType: "study_media",
    href: `/education/audio-study/${id}`,
    title,
    trust,
    detail: "Audio overview",
  };

  // Lineage: link the artifact → its origin (ingest anchor file or entity source).
  await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const audioStudyGenerator: ConvertGenerator = {
  targetKind: "audio",
  label: "Audio overview",
  available: true,
  capability: "education.audio_generate",
  run,
};
