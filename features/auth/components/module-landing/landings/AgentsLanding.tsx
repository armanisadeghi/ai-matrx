import {
  Webhook,
  Compass,
  LayoutTemplate,
  Wrench,
  BookCheck,
  Zap,
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
    title: "Agents that finish the job",
    description:
      "Compose models, tools, scopes, and policies. Agents run multi-step workflows end-to-end — not just suggest next steps.",
  },
  {
    icon: LayoutTemplate,
    title: "Start from a template, or from scratch",
    description:
      "Browse a gallery of vetted agents — research, drafting, calculators, file review. Fork any one and make it yours in minutes.",
  },
  {
    icon: Wrench,
    title: "Tools, models, and data — wired together",
    description:
      "Plug in your file system, your knowledge bases, your APIs. Pick the model that fits the job. Swap pieces without rebuilding the agent.",
  },
  {
    icon: BookCheck,
    title: "Your playbook, in the agent",
    description:
      "Encode standard positions, output schemas, refusal rules. The agent enforces them on every run — no more inconsistent answers.",
  },
  {
    icon: Zap,
    title: "Shortcuts, apps, and shareable runs",
    description:
      "Wrap an agent in a shortcut, embed it as an app, or share a run by link. The same agent shows up everywhere your team works.",
  },
  {
    icon: Eye,
    title: "Replayable on every action",
    description:
      "Every model call, tool invocation, and output is traced. Hand the trajectory to a teammate or auditor — nothing is opaque.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Pick a template or start blank",
    description:
      "Browse the gallery, fork an existing agent, or compose from scratch. Templates carry tools + models + scopes already wired up.",
  },
  {
    number: "02",
    title: "Wire in your tools and data",
    description:
      "Add file access, knowledge bases, APIs, calculators. Set the model. Define the output schema. The builder does the plumbing.",
  },
  {
    number: "03",
    title: "Test and tune",
    description:
      "Run sample prompts in the sandbox. Inspect the trajectory. Tweak prompts, swap models, add guardrails — iterate quickly.",
  },
  {
    number: "04",
    title: "Ship it",
    description:
      "Pin to the sidebar, expose as a shortcut, embed as an app, or hand it to your team via share link. One agent, many surfaces.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Agent Gallery",
    status: "Live",
    href: "/agents/all",
    items: [
      "Browse your team's agents",
      "Fork, edit, share",
      "Versioning + lineage",
      "Permissions per agent",
    ],
  },
  {
    title: "Templates",
    status: "Live",
    href: "/agents/templates",
    items: [
      "Curated starter agents",
      "Research, draft, calc, review",
      "Fork to customize",
      "Stay updated as they improve",
    ],
  },
  {
    title: "Shortcuts",
    status: "Live",
    href: "/agents/shortcuts",
    items: [
      "One-keystroke agent runs",
      "Pin to sidebar or dock",
      "Configurable defaults",
      "Sync across devices",
    ],
  },
  {
    title: "Agent Apps",
    status: "Live",
    href: "/agent-apps",
    items: [
      "Wrap agents as UI surfaces",
      "Public share links",
      "Custom branding",
      "Embed anywhere",
    ],
  },
  {
    title: "Workflows",
    status: "Coming soon",
    items: [
      "Chain agents into pipelines",
      "Triggers + schedules",
      "Conditional branching",
      "Pause + resume",
    ],
  },
  {
    title: "Agent SDK",
    status: "Coming soon",
    items: [
      "Build agents in code",
      "Same brain, your repo",
      "CI-friendly tests",
      "Org-scoped registry",
    ],
  },
];

export default function AgentsLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:agents"
      eyebrow="AI Matrx Agents"
      eyebrowIcon={Webhook}
      headline="Build agents that"
      headlineGradient="finish the work."
      description="Compose tools, models, scopes, and policies into agents that run end-to-end workflows. Start from a template, customize in minutes, ship to chat, apps, or the API. Auditable on every run."
      primaryCtaHref="/sign-up?source=agents-landing"
      primaryCtaLabel="Start Building Free"
      workspaceHref="/agents/all"
      workspaceLabel="Agents"
      capabilitiesHeading="From chat to a digital workforce"
      capabilitiesDescription="Six capabilities under every agent — composition, grounding, enforcement, traceability. Built for teams, not just demos."
      capabilities={CAPABILITIES}
      stepsDescription="From an empty canvas to a shipped agent in four steps."
      steps={STEPS}
      subAreasHeading="Where agents show up"
      subAreasDescription="One agent, many surfaces. Build once, run from chat, shortcuts, apps, the API, or a public link."
      subAreas={SUB_AREAS}
      finalCtaHeading="Build the agents your team will actually use"
      finalCtaDescription="Templates, tools, models, output schemas — everything you need to ship a real agent. Free to start."
      relatedModules={["/chat", "/agent-apps", "/scopes"]}
    />
  );
}
