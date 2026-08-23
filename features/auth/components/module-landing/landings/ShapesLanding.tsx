import {
  Blocks,
  Braces,
  Database,
  Eye,
  GitBranch,
  Shapes,
  ShieldCheck,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "../ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Braces,
    title: "One structure, everywhere",
    description:
      "Define the data once. Agents, workflows, tools, chat, and apps all speak the same named, versioned shape.",
  },
  {
    icon: Blocks,
    title: "Real interfaces for AI output",
    description:
      "A shape can render as an interactive component instead of a blob of JSON or a wall of generated text.",
  },
  {
    icon: ShieldCheck,
    title: "Validated before it goes live",
    description:
      "Canonical examples prove the schema and renderer together. Incomplete shapes stay safely inactive until every required leg passes.",
  },
  {
    icon: Eye,
    title: "Preview with real examples",
    description:
      "Open any shape, inspect its schema, fill its input form, and see the exact component every product surface will use.",
  },
  {
    icon: GitBranch,
    title: "Versioned without drift",
    description:
      "Shape versions preserve the contract consumers were built against while new work advances on the current definition.",
  },
  {
    icon: Database,
    title: "A shared registry, not scattered code",
    description:
      "System, organization, shared, and public shapes live in one governed catalog with one detection and rendering pipeline.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Describe the result you need",
    description:
      "Tell the Shape Creator what the data means and show it an example. It drafts the named fields and structure with you.",
  },
  {
    number: "02",
    title: "Generate the interface",
    description:
      "Use the generic viewer immediately or have the agent build a dedicated component for the way people should explore the result.",
  },
  {
    number: "03",
    title: "Test the real contract",
    description:
      "Fill the canonical form, validate the payload, and render it through the same route used by live agent and workflow output.",
  },
  {
    number: "04",
    title: "Activate and reuse",
    description:
      "Once schema, sample, and renderer pass together, activate the shape and bind it anywhere structured output belongs.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Shape library",
    status: "Live",
    href: "/shapes/all",
    items: [
      "Mine, my organizations, shared with me, and public",
      "System and community origins shown clearly",
      "Server-ranked search, sort, filters, and pagination",
      "Open, test, inspect, copy, attach, and share from every row",
    ],
  },
  {
    title: "Shape Creator",
    status: "Live",
    href: "/shapes/new",
    items: [
      "Describe a result in plain language",
      "Start from real sample data",
      "Agent-authored schema and component",
      "Safe handoff into the Shape Studio",
    ],
  },
  {
    title: "Preview and test",
    status: "Live",
    items: [
      "Canonical examples through the real renderer",
      "Schema-aware input form",
      "Saved result instances",
      "Version and activation controls for owners",
    ],
  },
];

export default function ShapesLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:shapes"
      eyebrow="AI Matrx Shapes"
      eyebrowIcon={Shapes}
      headline="Give AI output a"
      headlineGradient="real shape."
      description="Shapes turn generated data into a named, validated contract with a real interface. Define a result once, then let agents, workflows, tools, chat, and apps produce and render it consistently everywhere."
      primaryCtaHref="/sign-up?source=shapes-landing"
      primaryCtaLabel="Create Your First Shape"
      signInDestination="/shapes/all"
      workspaceHref="/shapes/all"
      workspaceLabel="Shapes"
      capabilitiesHeading="Structured output that becomes product"
      capabilitiesDescription="A schema alone is not enough. Shapes connect the contract, the examples, the renderer, the version, and the surfaces that consume it."
      capabilities={CAPABILITIES}
      stepsDescription="From an idea to a reusable, live structured-output contract in four steps."
      steps={STEPS}
      subAreasHeading="The complete Shape System"
      subAreasDescription="Browse the governed registry, create with an agent, and prove the result through the production renderer."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop shipping raw AI output"
      finalCtaDescription="Turn the result your team needs into a reusable contract and a polished interface that works everywhere."
      relatedModules={["/agents", "/workflows", "/data"]}
    />
  );
}
