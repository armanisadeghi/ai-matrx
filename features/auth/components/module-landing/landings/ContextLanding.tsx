import {
  BookOpen,
  Variable,
  FolderTree,
  Replace,
  Brackets,
  Sigma,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Brackets,
    title: "Brokers: typed variable slots",
    description:
      "Declare the variables an agent needs — text, file, scope, table row — and Context fills them at invocation time from scopes, user input, or upstream tool results.",
  },
  {
    icon: Replace,
    title: "Resolution that actually resolves",
    description:
      "Local-first, global as fallback. A note's tags beat the sidebar's active scope. Conflicts surface as warnings, never silent overrides.",
  },
  {
    icon: FolderTree,
    title: "Hierarchies for inheritance",
    description:
      "Org → project → task. Each level can override or extend the level above. Set a default at the top; tweak per task without re-typing.",
  },
  {
    icon: Variable,
    title: "Templates with placeholders",
    description:
      "Reusable prompt blocks with `{{variables}}` that fill from context. Build a playbook once; every invocation gets the right values.",
  },
  {
    icon: Sigma,
    title: "Inspect before you ship",
    description:
      "See what the agent will actually receive before you hit Run. Debug missing slots, contradictory values, scope mismatches.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Declare the slots",
    description:
      "Add brokers to your agent or template. Each one names a piece of context the runtime will fill.",
  },
  {
    number: "02",
    title: "Connect the sources",
    description:
      "Wire slots to scopes, user inputs, file pickers, or prior tool results. Defaults handle the common case; overrides handle the rest.",
  },
  {
    number: "03",
    title: "Run with confidence",
    description:
      "The runtime resolves every slot, shows you what filled in, warns about conflicts. Never wonder \"what did the agent actually see?\"",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Context items",
    status: "Live",
    href: "/agent-context/items",
    items: ["Per-broker config", "Default sources", "Type-safe slots", "Inspect at runtime"],
  },
  {
    title: "Hierarchies",
    status: "Live",
    href: "/agent-context/hierarchy",
    items: ["Org → project → task", "Inherit + override", "Per-level templates", "Diff between levels"],
  },
  {
    title: "Templates",
    status: "Live",
    href: "/agent-context/templates",
    items: ["Reusable prompt blocks", "Variable placeholders", "Share inside org", "Version + fork"],
  },
  {
    title: "Resolution analytics",
    status: "Live",
    href: "/agent-context/analytics",
    items: ["Per-run resolution", "Slot-fill stats", "Missing-slot alerts", "Audit log"],
  },
];

export default function ContextLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:context"
      eyebrow="AI Matrx Context"
      eyebrowIcon={BookOpen}
      headline="Agent context that"
      headlineGradient="fills in the right blanks."
      description="Declare what an agent needs — typed slots, named variables, scoped defaults — and Context resolves them at invocation time. Templates fill in. Hierarchies override. Conflicts warn. Never wonder what the agent actually saw."
      primaryCtaHref="/sign-up?source=context-landing"
      primaryCtaLabel="Wire Up Context Free"
      workspaceHref="/agent-context"
      workspaceLabel="Context"
      capabilitiesHeading="Beyond static prompts"
      capabilitiesDescription="Five capabilities that turn ad-hoc context into a typed, inspectable, debuggable resource."
      capabilities={CAPABILITIES}
      stepsDescription="From a blank agent to a fully-grounded invocation in three steps."
      steps={STEPS}
      subAreasHeading="Context surfaces"
      subAreasDescription="Items, hierarchies, templates, analytics — full visibility into what agents are working with."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop guessing what the agent saw"
      finalCtaDescription="Typed slots, scoped defaults, full resolution traces. Free to start, no credit card."
      relatedModules={["/scopes", "/agents", "/knowledge"]}
    />
  );
}
