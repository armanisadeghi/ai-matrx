import {
  MessageSquare,
  AtSign,
  UserPlus,
  Shield,
  Globe,
  Mic,
  ArrowRightLeft,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: AtSign,
    title: "DMs and mentions in one inbox",
    description:
      "Direct messages, group threads, and @-mentions from across the platform — chat, notes, tasks, projects — all in a single, searchable inbox.",
  },
  {
    icon: UserPlus,
    title: "Agents in the thread",
    description:
      "Agents you've built or subscribed to join conversations as first-class members. Hand off work, ask for analysis, get drafted replies without leaving the thread.",
  },
  {
    icon: ArrowRightLeft,
    title: "Cross-tool handoff",
    description:
      "Convert a message into a task, a note, or an agent run — preserving context. The conversation becomes the audit trail of what was decided and what got built.",
  },
  {
    icon: Shield,
    title: "Permission-aware",
    description:
      "Org-scoped, scope-aware, role-respecting. Sensitive threads stay invisible to people who shouldn't see them — without manual moderation.",
  },
  {
    icon: Globe,
    title: "External collaborators",
    description:
      "Invite clients and contractors into a single thread without giving them full workspace access. Magic-link sign-in, no app install required.",
  },
  {
    icon: Mic,
    title: "Voice and async",
    description:
      "Send voice messages, get auto-transcribed summaries. Async-by-default — your team can collaborate without being online at the same time.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Start a conversation",
    description:
      "DM a teammate, kick off a group thread, or invite an external collaborator. Pull in an agent if the conversation needs one.",
  },
  {
    number: "02",
    title: "Bring the work in",
    description:
      "Attach notes, tasks, files, or live agent runs to a thread. Discussion happens where the artifacts live — no context-switching.",
  },
  {
    number: "03",
    title: "Hand off to action",
    description:
      "Convert a decision into a task, a draft into a note, a question into an agent run. The conversation becomes the record of what was decided.",
  },
  {
    number: "04",
    title: "Search and revisit",
    description:
      "Full-text and semantic search across every conversation you have access to. Find the message that changed the plan in seconds.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Direct messages",
    status: "Live",
    href: "/messages",
    items: [
      "1:1 conversations",
      "Voice + file + image",
      "Read receipts",
      "Searchable history",
    ],
  },
  {
    title: "Group threads",
    status: "Live",
    href: "/messages",
    items: [
      "Multi-party threads",
      "@-mentions + notifications",
      "Permission-aware",
      "Pin important messages",
    ],
  },
  {
    title: "Agent threads",
    status: "Live",
    href: "/messages",
    items: [
      "Invite agents into chats",
      "Hand off work mid-thread",
      "Inline citations + sources",
      "Replay agent reasoning",
    ],
  },
  {
    title: "External invites",
    status: "Live",
    items: [
      "Magic-link external access",
      "Scoped to specific threads",
      "No app install required",
      "Revoke any time",
    ],
  },
  {
    title: "Voice + async",
    status: "Live",
    items: [
      "Voice memos with transcripts",
      "Async-first workflow",
      "Daily digest summaries",
      "Mobile push notifications",
    ],
  },
  {
    title: "Messages API",
    status: "Coming soon",
    items: [
      "Programmatic sending",
      "Webhooks + streams",
      "Cross-system bridges",
      "Org-scoped keys",
    ],
  },
];

export default function MessagesLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:messages"
      eyebrow="AI Matrx Messages"
      eyebrowIcon={MessageSquare}
      headline="Conversations where"
      headlineGradient="agents pull their weight."
      description="Direct messages, group threads, external collaborators, agents — all in one inbox. Decisions become tasks, drafts become notes, questions become agent runs. The conversation IS the audit trail."
      primaryCtaHref="/sign-up?source=messages-landing"
      primaryCtaLabel="Start Messaging Free"
      workspaceHref="/messages"
      workspaceLabel="Messages"
      capabilitiesHeading="More than a chat inbox"
      capabilitiesDescription="Six capabilities under every conversation — agent participation, permission-aware threading, voice + async, external collaboration."
      stepsDescription="From a quick DM to a shipped artifact in four steps — without leaving the thread."
      steps={STEPS}
      capabilities={CAPABILITIES}
      subAreasHeading="Conversation surfaces"
      subAreasDescription="One inbox covers it all — peer DMs, team threads, agent-driven conversations, and external collaborators."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop losing decisions in DMs"
      finalCtaDescription="A messaging system where conversations turn into work — tracked, replayable, agent-assisted. Free to start, no credit card."
    />
  );
}
