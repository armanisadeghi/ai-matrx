import {
  Mic,
  Captions,
  Users,
  Search,
  AlignJustify,
  Languages,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Captions,
    title: "Accurate, speaker-attributed transcripts",
    description:
      "Diarization keeps speakers separate; punctuation and capitalization stay readable. Audio recordings turn into something a human (or agent) can actually skim.",
  },
  {
    icon: Languages,
    title: "Multilingual + translation",
    description:
      "Transcribe in the source language, translate to whatever your team reads. Subtitles, summaries, and follow-ups in any language.",
  },
  {
    icon: Search,
    title: "Searchable + timestamped",
    description:
      "Full-text and semantic search across every transcript. Click a hit, jump to the exact moment in the audio.",
  },
  {
    icon: AlignJustify,
    title: "Summaries, action items, decisions",
    description:
      "Every transcript ships with a summary, a list of action items, and the decisions reached. Push them into tasks with one click.",
  },
  {
    icon: Users,
    title: "Meetings, calls, podcasts",
    description:
      "Upload, paste a URL, record in-app, or connect a meeting bot. Whatever the audio source, the pipeline handles it.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Bring the audio",
    description:
      "Upload a file, paste a YouTube/podcast URL, record from the browser, or connect a meeting bot to your next call.",
  },
  {
    number: "02",
    title: "Review the structured output",
    description:
      "Transcript with speakers, summary, action items. Edit anything; corrections improve future runs.",
  },
  {
    number: "03",
    title: "Push it forward",
    description:
      "Save as a note, create tasks from the action items, hand off to an agent to draft a follow-up email or report.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Processor",
    status: "Live",
    href: "/transcripts",
    items: ["Upload + paste URL", "Live transcription", "Speaker diarization", "Multi-language"],
  },
  {
    title: "Studio",
    status: "Live",
    href: "/transcripts/studio",
    items: [
      "Live 4-column workspace",
      "Raw → cleaned → concepts → modules",
      "Long-form (1-3 hr) safe",
      "Crash-safe via IndexedDB",
    ],
  },
  {
    title: "Scribe (mobile)",
    status: "Live",
    href: "/transcripts/scribe",
    items: [
      "Big record button + live strip",
      "AI assistant panel",
      "Cleanup sheet",
      "Per-session unsorted pool",
    ],
  },
  {
    title: "Meeting bot",
    status: "Coming soon",
    items: ["Auto-join calendar meetings", "Zoom / Meet / Teams", "Live transcripts", "Post-meeting summaries"],
  },
];

export default function TranscriptsLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:transcripts"
      eyebrow="AI Matrx Transcripts"
      eyebrowIcon={Mic}
      headline="Audio your team can"
      headlineGradient="search, summarize, act on."
      description="Meetings, calls, podcasts — turn every recording into a speaker-attributed transcript, an action-item list, and a searchable archive. Audio stops being something you have to relisten to."
      primaryCtaHref="/sign-up?source=transcripts-landing"
      primaryCtaLabel="Transcribe Your First Recording Free"
      workspaceHref="/transcripts"
      workspaceLabel="Transcripts"
      capabilitiesHeading="More than speech-to-text"
      capabilitiesDescription="Five capabilities turn raw audio into a structured artifact your team can actually use."
      capabilities={CAPABILITIES}
      stepsDescription="From an unwatched recording to a published summary in three steps."
      steps={STEPS}
      subAreasHeading="Transcript surfaces"
      subAreasDescription="Processor, library, meeting bot, podcast pipeline — every audio flow under one roof."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop re-listening to your own meetings"
      finalCtaDescription="Transcribe once, search forever, push to action. Free to start, no credit card."
      relatedModules={["/notes", "/tasks", "/chat"]}
    />
  );
}
