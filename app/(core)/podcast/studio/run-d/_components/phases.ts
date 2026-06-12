// app/(core)/podcast/studio/run-d/_components/phases.ts
//
// Humanizes the raw, underscore-y backend stage keys into a clean four-phase
// production pipeline for Studio D's run view. The backend emits ~9 granular
// stages (prepare_content, prepare_content_researcher, create_script,
// generate_metadata, image_n, video_n, create_audio). Users don't think in
// those terms — they think "Research → Write → Visualize → Voice". We map the
// granular stages onto those phases and derive each phase's status from the
// underlying StageRows, so the rail reads like a production timeline, not a log.

import {
  Telescope,
  PenLine,
  Clapperboard,
  AudioLines,
  type LucideIcon,
} from "lucide-react";
import type { PodcastRunState, StageRow } from "@/features/podcasts/generator/types";

export type PhaseStatus = "pending" | "active" | "done" | "failed";

export interface PhaseDef {
  id: string;
  label: string;
  /** One-line description of what happens in this phase. */
  blurb: string;
  icon: LucideIcon;
  /** Predicate matching the raw backend stage keys that belong to this phase. */
  match: (stage: string) => boolean;
}

export const PHASES: PhaseDef[] = [
  {
    id: "research",
    label: "Research",
    blurb: "Gathering and distilling the source material",
    icon: Telescope,
    match: (s) => s.startsWith("prepare_content") || s.includes("research"),
  },
  {
    id: "script",
    label: "Script",
    blurb: "Writing the two-host conversation",
    icon: PenLine,
    match: (s) => s === "create_script" || s === "generate_metadata",
  },
  {
    id: "visuals",
    label: "Visuals",
    blurb: "Rendering cover art and the video clip",
    icon: Clapperboard,
    match: (s) => s.startsWith("image") || s.startsWith("video"),
  },
  {
    id: "voice",
    label: "Voice",
    blurb: "Producing the studio-quality audio",
    icon: AudioLines,
    match: (s) => s === "create_audio",
  },
];

export interface PhaseView {
  def: PhaseDef;
  status: PhaseStatus;
  /** Friendly sub-steps inside this phase, in order. */
  steps: { label: string; status: StageRow["status"] }[];
}

/** Friendlier labels for the substep rows under each phase. */
const SUBSTEP_LABEL: Record<string, string> = {
  prepare_content: "Reading the source",
  prepare_content_researcher: "Researching the topic",
  prepare_content_extractor: "Extracting key points",
  create_script: "Drafting the dialogue",
  generate_metadata: "Title, art & video concepts",
  create_audio: "Mixing the final audio",
};

function substepLabel(row: StageRow): string {
  if (SUBSTEP_LABEL[row.stage]) return SUBSTEP_LABEL[row.stage];
  if (row.stage.startsWith("image_")) {
    return `Cover art ${Number(row.stage.split("_")[1]) + 1}`;
  }
  if (row.stage.startsWith("video_")) {
    return `Video clip ${Number(row.stage.split("_")[1]) + 1}`;
  }
  return row.label;
}

export function buildPhases(state: PodcastRunState): PhaseView[] {
  return PHASES.map((def) => {
    const rows = state.stages.filter((r) => def.match(r.stage));
    const steps = rows.map((r) => ({
      label: substepLabel(r),
      status: r.status,
    }));

    let status: PhaseStatus = "pending";
    if (rows.length > 0) {
      const anyFailed = rows.some((r) => r.status === "failed");
      const anyRunning = rows.some((r) => r.status === "running");
      const allDone = rows.every((r) => r.status === "done");
      if (anyRunning) status = "active";
      else if (allDone) status = "done";
      else if (anyFailed) status = "failed";
      else status = "active";
    }
    // When the run is fully complete, force all phases terminal.
    if (state.status === "done" && status === "pending") status = "done";

    return { def, status, steps };
  });
}

/** The single human sentence describing what's happening right now. */
export function liveHeadline(state: PodcastRunState): string {
  if (state.status === "done") return "Your episode is ready";
  if (state.status === "error") return "Generation hit a snag";
  const running = state.stages.find((s) => s.status === "running");
  if (!running) return "Spinning up the studio…";
  const phase = PHASES.find((p) => p.match(running.stage));
  return phase?.blurb ?? running.label;
}
