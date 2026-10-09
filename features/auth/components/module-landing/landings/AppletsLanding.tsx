import {
  AppWindow,
  Database,
  LayoutTemplate,
  MessagesSquare,
  Radio,
  Share2,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: MessagesSquare,
    title: "Built by talking",
    description: "Describe the Applet. It builds the pages.",
  },
  {
    icon: AppWindow,
    title: "Your own pages",
    description: "Dashboards, forms and portals in your layout.",
  },
  {
    icon: Database,
    title: "On your own data",
    description: "Works with the lists and records you already keep.",
  },
  {
    icon: Radio,
    title: "AI built in",
    description: "Ask it to do a task and watch the answer arrive.",
  },
  {
    icon: Share2,
    title: "Shared by link",
    description: "Open it to your team, a client or the public.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Say what you need",
    description: "Describe the Applet in plain words.",
  },
  {
    number: "02",
    title: "Review the pages",
    description: "Ask for changes until it fits.",
  },
  {
    number: "03",
    title: "Share the link",
    description: "Send it to the people who need it.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Browse every template",
    status: "Live",
    href: "/templates/applets",
    items: ["Client portals", "Sales pipelines", "Time tracking"],
  },
];

export default function AppletsLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:applets"
      eyebrow="AI Matrx Applets"
      eyebrowIcon={LayoutTemplate}
      headline="Custom Applets,"
      headlineGradient="built by talking."
      description="Say what you need in plain words. You get an app with its own pages, working on your own data, with AI built in."
      primaryCtaHref="/sign-up?source=applets-landing"
      primaryCtaLabel="Build your first Applet"
      workspaceHref="/applets"
      workspaceLabel="Applets"
      capabilitiesHeading="What an Applet is"
      capabilitiesDescription="Pages, data and AI in one Applet."
      capabilities={CAPABILITIES}
      stepsDescription="From idea to a shared Applet."
      steps={STEPS}
      subAreasHeading="Start from a template"
      subAreasDescription="Ready-made Applets with sample data."
      subAreas={SUB_AREAS}
      finalCtaHeading="Describe it. Share it."
      finalCtaDescription="Free to start."
      relatedModules={["/agents", "/data", "/chat"]}
    />
  );
}
