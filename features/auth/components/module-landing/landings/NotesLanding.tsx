import {
  StickyNote,
  PenTool,
  Search,
  Link2,
  Tag,
  Share2,
  History,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: PenTool,
    title: "Markdown that feels like a doc",
    description:
      "Rich markdown editor with live preview, code blocks, tables, and inline images. Write fast, read clean — your notes look the way you'd ship them.",
  },
  {
    icon: Search,
    title: "Search across every note instantly",
    description:
      "Full-text and semantic search across your entire note library. Find the snippet you wrote three months ago in under a second.",
  },
  {
    icon: Link2,
    title: "Pin notes to the work",
    description:
      "Anchor a note to a scope, project, client, or task. The right notes surface in the right context — no more digging through folders.",
  },
  {
    icon: Tag,
    title: "Tag, group, and filter",
    description:
      "Lightweight tagging that doesn't get in the way. Filter and group by tag, scope, or author — your library stays organized as it grows.",
  },
  {
    icon: Share2,
    title: "Share by link, comment in place",
    description:
      "Public or private share links. Collaborators can read or comment without an account — perfect for client-facing drafts.",
  },
  {
    icon: History,
    title: "Versioned by default",
    description:
      "Every edit is captured. Roll back to any prior version, diff between revisions, restore deleted notes from the trash.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Capture anything",
    description:
      "Hit the global Quick Note shortcut, drop a thought, paste a snippet from chat — saves instantly to your library.",
  },
  {
    number: "02",
    title: "Organize with context",
    description:
      "Tag it, pin it to a scope or project, link related notes. Your structure builds itself as you work, not the other way around.",
  },
  {
    number: "03",
    title: "Pull into chat or agents",
    description:
      "Reference any note as context for an agent. The relevant background is already in the room before you ask the question.",
  },
  {
    number: "04",
    title: "Share and revisit",
    description:
      "Send a clean link to a client, embed in a doc, or fork a template. Your notes outlive the chat that produced them.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Personal notes",
    status: "Live",
    href: "/notes",
    items: [
      "Markdown editor + preview",
      "Quick capture from anywhere",
      "Pin to scopes / projects",
      "Full-text + semantic search",
    ],
  },
  {
    title: "Shared notes",
    status: "Live",
    href: "/notes",
    items: [
      "Org-wide visibility",
      "Comment + suggestion threads",
      "Permission-aware",
      "Activity feed",
    ],
  },
  {
    title: "Note → chat handoff",
    status: "Live",
    href: "/chat/new",
    items: [
      "Attach notes as agent context",
      "Inline drag from sidebar",
      "Auto-cite in agent answers",
      "Round-trip edits back to notes",
    ],
  },
  {
    title: "Templates library",
    status: "Live",
    href: "/notes",
    items: [
      "Reusable note structures",
      "Org-shared and personal",
      "Variable substitution",
      "Fork to customize",
    ],
  },
  {
    title: "Public note share",
    status: "Live",
    items: [
      "Read-only link sharing",
      "Custom branded preview",
      "Optional comment access",
      "Revoke any time",
    ],
  },
  {
    title: "Notes API",
    status: "Coming soon",
    items: [
      "REST + webhooks",
      "Bulk import / export",
      "External tool sync",
      "Org-scoped keys",
    ],
  },
];

export default function NotesLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:notes"
      eyebrow="AI Matrx Notes"
      eyebrowIcon={StickyNote}
      headline="Notes that travel"
      headlineGradient="everywhere your work goes."
      description="Capture drafts, snippets, reference material, and shared docs in one searchable library. Your notes link to scopes, feed into agents, and ship as clean public pages — without copy-paste."
      primaryCtaHref="/sign-up?source=notes-landing"
      primaryCtaLabel="Start Taking Notes Free"
      workspaceHref="/notes"
      workspaceLabel="Notes"
      capabilitiesHeading="A notebook that knows your work"
      capabilitiesDescription="Six capabilities under every note — search, structure, sharing, and version history that just works."
      stepsDescription="From a stray thought to a referenced agent answer in four steps."
      steps={STEPS}
      capabilities={CAPABILITIES}
      subAreasHeading="Note surfaces"
      subAreasDescription="One library, many surfaces — personal capture, shared workspaces, agent context, and public publishing."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop losing the good ideas"
      finalCtaDescription="A note system that captures fast, organizes with context, and powers your agents. Free to start, no credit card."
    />
  );
}
