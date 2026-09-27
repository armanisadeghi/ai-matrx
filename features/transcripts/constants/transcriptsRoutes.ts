import {
  Columns2,
  Eraser,
  FileText,
  List,
  Mic,
  Plus,
  type LucideIcon,
} from "lucide-react";

/** User-facing transcript sub-routes — mirrors `nav-data.ts` children. */
export type TranscriptsPageMode =
  | "all"
  | "new"
  | "processor"
  | "studio"
  | "scribe"
  | "cleanup";

export type TranscriptsMode = {
  id: TranscriptsPageMode;
  label: string;
  icon: LucideIcon;
  href: string;
  /** One line: what this surface is FOR. Shown in the header tooltip and the
   *  list-page surface guide, so a user never meets a name they can't decode. */
  blurb: string;
};

/**
 * THE surface register for /transcripts. Every consumer that names a
 * transcription surface reads it from here — the header mode nav, the empty-state
 * surface guide, the /transcripts/new picker. Adding a surface here makes it
 * reachable and self-explaining in every one of them at once.
 */
export const TRANSCRIPTS_MODES: TranscriptsMode[] = [
  {
    id: "all",
    label: "All",
    icon: List,
    href: "/transcripts",
    blurb:
      "Everything you've captured — transcripts, Studio sessions, Scribe recordings, and cleanups in one searchable list.",
  },
  {
    id: "new",
    label: "New",
    icon: Plus,
    href: "/transcripts/new",
    blurb: "Start here if you're not sure which surface you want.",
  },
  {
    id: "processor",
    label: "Process",
    icon: FileText,
    href: "/transcripts/processor",
    blurb:
      "Have a recording already? Drop in an audio or video file and get a finished transcript back with speakers and timecodes.",
  },
  {
    id: "studio",
    label: "Studio",
    icon: Columns2,
    href: "/transcripts/studio",
    blurb:
      "A live four-column workspace: raw text, AI-cleaned text, extracted concepts, and a pluggable module column — all on one timeline. Built for 1–3 hour sessions.",
  },
  {
    id: "scribe",
    label: "Scribe",
    icon: Mic,
    href: "/transcripts/scribe",
    blurb:
      "Talk to an assistant that builds a working document with you. Record takes, and the two of you draft and edit by voice or text.",
  },
  {
    id: "cleanup",
    label: "Clean",
    icon: Eraser,
    href: "/transcripts/cleanup",
    blurb:
      "A pad for one-off AI clean-ups: paste or import a rough transcript and get a readable one back.",
  },
];

export function getTranscriptsModeHref(mode: TranscriptsPageMode): string {
  return TRANSCRIPTS_MODES.find((m) => m.id === mode)?.href ?? "/transcripts";
}

export function deriveTranscriptsMode(pathname: string): TranscriptsPageMode {
  if (pathname === "/transcripts" || pathname === "/transcripts/") return "all";
  if (pathname.startsWith("/transcripts/new")) return "new";
  if (pathname.startsWith("/transcripts/processor")) return "processor";
  if (pathname.startsWith("/transcripts/studio")) return "studio";
  if (pathname.startsWith("/transcripts/scribe")) return "scribe";
  if (pathname.startsWith("/transcripts/cleanup")) return "cleanup";
  return "all";
}
