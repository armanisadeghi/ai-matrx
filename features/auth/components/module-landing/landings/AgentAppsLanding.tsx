import {
  AppWindow,
  LayoutGrid,
  Wrench,
  Share2,
  Lock,
  Workflow,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Wrench,
    title: "Wrap any agent as an app",
    description:
      "Take a powerful agent, expose only the right controls, ship it as a one-click app. Your team gets a button — not a chat prompt to learn.",
  },
  {
    icon: LayoutGrid,
    title: "Forms, not freeform",
    description:
      "Apps render with structured inputs, validated fields, and clear actions. The agent handles the reasoning; the user fills in the form.",
  },
  {
    icon: Workflow,
    title: "Multi-step flows",
    description:
      "Chain agents together — extract, summarize, classify, route — into a single app. The user sees one button; you ship five steps.",
  },
  {
    icon: Share2,
    title: "Share inside or outside your org",
    description:
      "Publish to your team, your client, or the public marketplace. Permission-aware, branded, embeddable on your own site.",
  },
  {
    icon: Lock,
    title: "Guardrails built in",
    description:
      "Rate limits, allowed tools, allowed models, output validation — all configured at the app level. End-users can't blow the budget.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Pick the agent that does the work",
    description:
      "Start from your agent library or fork a template. The app inherits the agent's tools, knowledge, and playbook.",
  },
  {
    number: "02",
    title: "Design the form",
    description:
      "Drop in the inputs your users need — text, file upload, dropdown, scope picker. Map them to the agent's variables.",
  },
  {
    number: "03",
    title: "Ship it as a link",
    description:
      "Publish to your team, embed on your site, or share with a single client. Brand it, gate it, monitor it.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "My apps",
    status: "Live",
    href: "/agent-apps",
    items: ["Build and edit", "Live preview", "Version history", "Org-shared"],
  },
  {
    title: "App marketplace",
    status: "Live",
    href: "/agent-apps",
    items: ["Public templates", "Fork to customize", "Featured by category", "Usage stats"],
  },
  {
    title: "Embed + share",
    status: "Live",
    items: ["Public share links", "iFrame embeds", "Custom domains", "Webhook callbacks"],
  },
  {
    title: "Headless app API",
    status: "Coming soon",
    items: ["Programmatic runs", "Bulk inputs", "Org-scoped keys", "Stream + replay"],
  },
];

export default function AgentAppsLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:agent-apps"
      eyebrow="AI Matrx Agent Apps"
      eyebrowIcon={AppWindow}
      headline="Agents in"
      headlineGradient="app-shaped clothing."
      description="Take a complex agent, wrap it in a clean form, ship it as a one-click tool your team and clients can actually use. Apps in AI Matrx turn agents into shippable products."
      primaryCtaHref="/sign-up?source=agent-apps-landing"
      primaryCtaLabel="Build Your First App Free"
      workspaceHref="/agent-apps"
      workspaceLabel="Agent Apps"
      capabilitiesHeading="From prompt to product"
      capabilitiesDescription="Five capabilities that turn a powerful agent into a tool your users won't need a manual to operate."
      capabilities={CAPABILITIES}
      stepsDescription="From a working agent to a shareable app in three steps."
      steps={STEPS}
      subAreasHeading="App surfaces"
      subAreasDescription="Build apps, browse the marketplace, share with whomever."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop teaching colleagues to prompt"
      finalCtaDescription="Wrap the agent. Ship the app. Watch adoption climb. Free to start, no credit card."
    />
  );
}
