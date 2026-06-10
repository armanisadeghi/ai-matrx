// app/(core)/podcast/studio/run-f/_components/acts.ts
//
// The humanization layer for the production booth. The backend emits ugly,
// underscored stage keys (prepare_content_researcher, generate_metadata, image_0…);
// this maps them into five human-readable "acts" — the way a person thinks about
// making an episode — each with a verb, a one-line plain-English description, and
// a Lucide icon + semantic accent. The booth stages the run as these five acts.

import {
  FileSearch,
  PenLine,
  Palette,
  AudioLines,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";

export type ActId = "source" | "script" | "art" | "voice" | "publish";

export type AccentKey = "sky" | "violet" | "pink" | "emerald" | "primary";

export interface ActDef {
  id: ActId;
  /** Big stage title, present-tense verb. */
  title: string;
  /** One plain-English line shown under the title while the act runs. */
  blurb: string;
  /** Past-tense label used once the act is complete. */
  done: string;
  icon: LucideIcon;
  /** Semantic accent — a Tailwind color family used consistently for this act. */
  accent: AccentKey;
}

export const ACTS: ActDef[] = [
  {
    id: "source",
    title: "Gathering the material",
    blurb: "Reading your source and researching the topic in depth.",
    done: "Material gathered",
    icon: FileSearch,
    accent: "sky",
  },
  {
    id: "script",
    title: "Writing the conversation",
    blurb: "Turning the research into a natural two-host dialogue.",
    done: "Script written",
    icon: PenLine,
    accent: "violet",
  },
  {
    id: "art",
    title: "Designing the visuals",
    blurb: "Generating the title, cover art, and a motion clip.",
    done: "Visuals designed",
    icon: Palette,
    accent: "pink",
  },
  {
    id: "voice",
    title: "Recording the voices",
    blurb: "Giving each host a voice and producing the final audio.",
    done: "Audio recorded",
    icon: AudioLines,
    accent: "emerald",
  },
  {
    id: "publish",
    title: "Finishing up",
    blurb: "Assembling the episode and getting it ready to play.",
    done: "Episode ready",
    icon: PackageCheck,
    accent: "primary",
  },
];

/** Map a raw backend stage key onto one of the five human acts. */
export function actForStage(stage: string): ActId {
  if (stage.startsWith("image") || stage.startsWith("video") || stage === "generate_metadata")
    return "art";
  if (stage === "create_audio") return "voice";
  if (stage === "create_script") return "script";
  if (stage.startsWith("prepare_content")) return "source";
  return "publish";
}

/** Accent → concrete semantic-token classes (kept in one place so every booth
 *  surface tints an act identically). These are Tailwind color utilities that
 *  resolve through the app's palette; structural color stays in our tokens. */
export const ACCENT: Record<
  AccentKey,
  { text: string; bg: string; ring: string; glow: string; bar: string }
> = {
  sky: {
    text: "text-sky-500",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/40",
    glow: "shadow-[0_0_60px_-12px] shadow-sky-500/40",
    bar: "bg-sky-500",
  },
  violet: {
    text: "text-violet-500",
    bg: "bg-violet-500/10",
    ring: "ring-violet-500/40",
    glow: "shadow-[0_0_60px_-12px] shadow-violet-500/40",
    bar: "bg-violet-500",
  },
  pink: {
    text: "text-pink-500",
    bg: "bg-pink-500/10",
    ring: "ring-pink-500/40",
    glow: "shadow-[0_0_60px_-12px] shadow-pink-500/40",
    bar: "bg-pink-500",
  },
  emerald: {
    text: "text-emerald-500",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/40",
    glow: "shadow-[0_0_60px_-12px] shadow-emerald-500/40",
    bar: "bg-emerald-500",
  },
  primary: {
    text: "text-primary",
    bg: "bg-primary/10",
    ring: "ring-primary/40",
    glow: "shadow-[0_0_60px_-12px] shadow-primary/40",
    bar: "bg-primary",
  },
};
