// features/education/media/audio/useAudioStudyCreate.ts
//
// Owns the "start a new audio study" action: build the podcast request, create
// the durable run row (pc_studio_runs — the recovery spine), create the
// education artifact row (study_media), hand the request to the run page via
// the podcast pendingStart channel, and navigate. The run page (AudioStudyDetail
// → useStudioRun) picks up the pending request and streams — reusing the entire
// podcast generation + recovery machinery unchanged.

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { studioRunsService } from "@/features/podcasts/studio/runs/service";
import { stashPendingStart } from "@/features/podcasts/studio/runs/pendingStart";
import { studyMediaService } from "../service";
import { buildAudioRequest } from "./audioBrief";
import {
  resolveDeckAudioSource,
  resolveTopicAudioSource,
} from "./resolveAudioSource";
import type { EduAudioFormat } from "../types";

export interface AudioStudyCreateInput {
  format: EduAudioFormat;
  /** 'deck' → deckId required; 'topic' → topic required. */
  sourceKind: "deck" | "topic";
  deckId?: string;
  topic?: string;
  hostCount?: number;
  adaptive?: boolean;
  language?: string;
}

const FORMAT_LABEL: Record<EduAudioFormat, string> = {
  overview: "Audio overview",
  debate: "Debate",
  panel: "Panel",
  review: "Audio review",
};

export function useAudioStudyCreate() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  // Returns true only when the run + artifact were created and we navigated —
  // the caller meters the entitlement on that success (a failed/early-returned
  // generation returns false and never burns quota).
  async function create(input: AudioStudyCreateInput): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    try {
      // 1. Resolve the source → content + trust + adaptive weak-area note.
      const resolved =
        input.sourceKind === "deck"
          ? (await resolveDeckAudioSource(input.deckId ?? "", {
              adaptive: Boolean(input.adaptive),
            })).data
          : resolveTopicAudioSource(input.topic ?? "");

      if (!resolved) {
        toast.error("Couldn't load that source — pick a deck with cards, or type a topic.");
        return false;
      }
      if (input.sourceKind === "deck" && (resolved as { truncated?: boolean }).truncated) {
        toast.info("This deck is large — the audio covers the first 80 cards.");
      }

      // 2. Build the podcast request for this format + adaptivity.
      const request = buildAudioRequest({
        format: input.format,
        sourceKind: resolved.source.kind === "topic" ? "topic" : "deck",
        content: resolved.content,
        hostCount: input.hostCount,
        language: input.language,
        weakAreaNote: resolved.weakAreaNote,
      });

      const title = `${FORMAT_LABEL[input.format]} · ${resolved.source.title}`;

      // 3. Create the durable run row (the recovery spine).
      const run = await studioRunsService.createRun({
        status: "running",
        input_data_type: request.input_data_type,
        podcast_type: request.podcast_type,
        request,
        title,
      });

      // 4. Create the education artifact row (points at the run).
      const media = await studyMediaService.create({
        mediaKind: "audio",
        title,
        source: resolved.source,
        config: {
          format: input.format,
          hostCount: request.host_count ?? 2,
          adaptive: Boolean(input.adaptive),
          language: request.language,
        },
        trust: resolved.trust,
        audioFormat: input.format,
        runId: run.id,
        status: "generating",
      });
      if (media.error || !media.data) {
        toast.error(media.error ?? "Couldn't create the audio study");
        return false;
      }

      // 5. Hand the request to the run page + navigate. A refresh clears the
      //    pending map → the durable run replays from the DB instead of
      //    re-generating (no duplicate work).
      stashPendingStart(run.id, request);
      router.push(`/education/audio-study/${media.data.id}`);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start generation");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return { create, busy };
}
