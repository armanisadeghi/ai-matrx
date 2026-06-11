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

export const TRANSCRIPTS_MODES: {
  id: TranscriptsPageMode;
  label: string;
  icon: LucideIcon;
  href: string;
}[] = [
  { id: "all", label: "All", icon: List, href: "/transcripts" },
  { id: "new", label: "New", icon: Plus, href: "/transcripts/new" },
  {
    id: "processor",
    label: "Process",
    icon: FileText,
    href: "/transcripts/processor",
  },
  {
    id: "studio",
    label: "Studio",
    icon: Columns2,
    href: "/transcripts/studio",
  },
  { id: "scribe", label: "Scribe", icon: Mic, href: "/transcripts/scribe" },
  {
    id: "cleanup",
    label: "Clean",
    icon: Eraser,
    href: "/transcripts/cleanup",
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
