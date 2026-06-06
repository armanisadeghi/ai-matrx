import {
  MessageCircle,
  Compass,
  FileStack,
  Search,
  BookCheck,
  GitBranch,
  Eye,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Compass,
    title: "Agentic chat, end to end",
    description:
      "Multi-step workflows run inside the conversation — research, draft, calculate, summarize. Not a chat box you have to babysit.",
  },
  {
    icon: FileStack,
    title: "Drop in any file, get answers cited",
    description:
      "Paste in PDFs, spreadsheets, transcripts, images. Every answer pins back to the document, page, and paragraph you're asking about.",
  },
  {
    icon: Search,
    title: "Research grounded in real sources",
    description:
      "Web, docs, your knowledge bases — all searched together and synthesized into one cited answer. Every claim links to where it came from.",
  },
  {
    icon: BookCheck,
    title: "Your playbook, enforced",
    description:
      "Encode standard positions, brand voice, deal-breakers. Drafts and reviews flag deviations from your team's playbook automatically.",
  },
  {
    icon: GitBranch,
    title: "Branch, fork, replay",
    description:
      "Every conversation is a tree, not a transcript. Fork at any message, run variants in parallel, replay the trajectory for review.",
  },
  {
    icon: Eye,
    title: "Auditable on every action",
    description:
      "Every model call, tool invocation, document read, and edit is traced and replayable. Hand the trajectory to a colleague or auditor.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Start a chat",
    description:
      "Pick an agent from the gallery or start fresh. Bring your files, your scope, your context — Chat already knows them.",
  },
  {
    number: "02",
    title: "Talk like you would",
    description:
      "Plain English. Drop files into the conversation. The agent figures out which tools to run, which sources to cite, which steps to take.",
  },
  {
    number: "03",
    title: "Branch, refine, ship",
    description:
      "Fork off variants, run them in parallel, compare results. Save the best as a note, a task, a doc, or share by link.",
  },
  {
    number: "04",
    title: "Replay anything",
    description:
      "Every step recorded. Review what the agent did, override anything, regenerate the parts that matter. Nothing is a black box.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Default chat",
    status: "Live",
    href: "/chat/new",
    items: [
      "Multi-model agent picker",
      "File drop, image, audio",
      "Cited answers + tool runs",
      "Branch + fork + replay",
    ],
  },
  {
    title: "Voice chat",
    status: "Live",
    href: "/chat/new",
    items: [
      "Hands-free input",
      "Streaming transcription",
      "Read-aloud responses",
      "Mobile-friendly",
    ],
  },
  {
    title: "Quick Chat overlay",
    status: "Live",
    href: "/chat/new",
    items: [
      "Pops over any page",
      "Inherits page context",
      "Fast captures",
      "Save to notes/tasks",
    ],
  },
  {
    title: "Pinned agents",
    status: "Live",
    href: "/agents",
    items: [
      "Your favorite agents up top",
      "One-click to start a chat",
      "Sync across devices",
      "Reorder freely",
    ],
  },
  {
    title: "Team chat threads",
    status: "Coming soon",
    items: [
      "Shared conversations",
      "Mentions + handoffs",
      "Threaded replies",
      "Permission-aware",
    ],
  },
  {
    title: "Headless chat API",
    status: "Coming soon",
    items: [
      "Same brain, your UI",
      "Bring-your-own surface",
      "Webhooks + streams",
      "Org-scoped keys",
    ],
  },
];

export default function ChatLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:chat"
      eyebrow="AI Matrx Chat"
      eyebrowIcon={MessageCircle}
      headline="Chat with"
      headlineGradient="real agents, not a chat box."
      description="Drop in files, run agentic workflows, branch and fork, replay every step. Chat in AI Matrx is the front door to a digital workforce — cited, auditable, and tuned to the way you actually work."
      primaryCtaHref="/sign-up?source=chat-landing"
      primaryCtaLabel="Start Chatting Free"
      workspaceHref="/chat/new"
      workspaceLabel="Chat"
      capabilitiesHeading="From chat box to digital workforce"
      capabilitiesDescription="Six capabilities live under every conversation — agentic execution grounded in your files, your knowledge, and your playbook."
      capabilities={CAPABILITIES}
      stepsDescription="From an empty composer to a defensible, cited result in four steps."
      steps={STEPS}
      subAreasHeading="Chat surfaces"
      subAreasDescription="One brain, many surfaces. Chat shows up where you work — full page, overlay, voice, embedded."
      subAreas={SUB_AREAS}
      finalCtaHeading="Put a digital workforce in your chat box"
      finalCtaDescription="Research, drafting, calculations, file review — all in one chat, all auditable. Free to start, no credit card required."
      relatedModules={["/agents", "/notes", "/files"]}
    />
  );
}
