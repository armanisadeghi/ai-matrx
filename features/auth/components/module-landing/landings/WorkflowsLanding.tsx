// features/auth/components/module-landing/landings/WorkflowsLanding.tsx
//
// Public marketing landing for Workflows — served to guests at /workflows
// (signed-in visitors are sent straight to their library at /workflows/all).
//
// The pitch is the product that actually shipped, nothing more: a library of
// workflows you can run, a run page that names what you'll get before it
// starts, shows the whole plan up front, narrates the real work as it happens,
// and hands back finished pieces you can use — every run keeping its own link.
// Zero jargon: no "node", no "stream", no "kind", no "readout".

import {
  Activity,
  LayoutPanelTop,
  LifeBuoy,
  Link2,
  ListChecks,
  Map,
  Workflow,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "../ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: ListChecks,
    title: "You know what you'll get",
    description:
      "Before the first second of work, the page names every finished piece the run will hand back. No guessing what you paid for, no surprise at the end.",
  },
  {
    icon: Map,
    title: "The whole plan, up front",
    description:
      "Every step is on screen from the start — in plain language, in order, each one saying what it produces. You can see where the work is and what is still ahead.",
  },
  {
    icon: Activity,
    title: "Real work, not a spinner",
    description:
      "You watch what is actually happening: the step that is running, what it is doing right now, what it looked things up in, how long each one took, and what it cost.",
  },
  {
    icon: LayoutPanelTop,
    title: "Results you can use",
    description:
      "Finished pieces arrive as the real thing — cards you can flip, tables you can sort and filter, documents you can read — never a wall of raw output.",
  },
  {
    icon: Link2,
    title: "Every run keeps its link",
    description:
      "A run is a record with its own address. Close the tab mid-run, come back, and it picks up where it is. Send the link to someone and they see the same run.",
  },
  {
    icon: LifeBuoy,
    title: "Honest when it goes wrong",
    description:
      "If something fails you get plain language: which step, what it means, and the one thing to do next — with the technical cause one tap away if you want it.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Pick one",
    description:
      "Your library holds what you own, what your organization shares with you, what someone sent you, and what is public. Search it, sort it, filter it.",
  },
  {
    number: "02",
    title: "Tell it what this run is about",
    description:
      "A short form — the material, the topic, the settings that matter. Then start it.",
  },
  {
    number: "03",
    title: "Watch it work",
    description:
      "The promise at the top, the plan down the side, the real activity in the middle. Pause, resume, or stop it at any point.",
  },
  {
    number: "04",
    title: "Take the results",
    description:
      "Finished pieces land at the bottom as you go. The run stays at its own link with everything it produced.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Your workflow library",
    status: "Live",
    href: "/workflows/all",
    items: [
      "Yours, your organization's, shared with you, and public",
      "Search, sort, and filter on every column",
      "Table, card, and compact views",
      "One menu on every row with everything you can do",
    ],
  },
  {
    title: "The run page",
    status: "Live",
    items: [
      "What you'll get, named from the first second",
      "Every step visible before anything starts",
      "Live activity, per-step timing, and running cost",
      "Pause, resume, stop, retry, or answer a question mid-run",
    ],
  },
  {
    title: "Run records",
    status: "Live",
    items: [
      "Every run has its own permanent link",
      "Refresh or come back later and the run is still there",
      "Send the link and someone else sees the same run",
      "Finished pieces stay with the run that made them",
    ],
  },
  {
    title: "Design the run page",
    status: "Live",
    items: [
      "Choose what a watcher sees, and when it appears",
      "Build on the left, the real page live on the right",
      "Never run it yet? A sample run shows the page anyway",
      "Arrange by order and width — nothing to line up by hand",
    ],
  },
];

export default function WorkflowsLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:workflows"
      eyebrow="AI Matrx Workflows"
      eyebrowIcon={Workflow}
      headline="Long work you can"
      headlineGradient="actually watch."
      description="Some work takes many steps and several minutes. A workflow run shows you the finished pieces it will hand back before it starts, the whole plan while it works, what each step is really doing — and then gives you results you can use. Every run keeps its own link."
      primaryCtaHref="/sign-up?source=workflows-landing"
      primaryCtaLabel="Start Free"
      signInDestination="/workflows/all"
      workspaceHref="/workflows/all"
      workspaceLabel="Workflows"
      capabilitiesHeading="Work you can see, results you can trust"
      capabilitiesDescription="A long run is only worth starting if you can tell what it promised, what it is doing, and whether it delivered. That is the whole surface."
      capabilities={CAPABILITIES}
      stepsDescription="Four steps from picking one to holding the results."
      steps={STEPS}
      subAreasHeading="What's inside"
      subAreasDescription="A library, a run page built to be watched, permanent run records, and a way to design what watchers see."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop staring at a spinner"
      finalCtaDescription="Start a run, watch it work step by step, and take back finished pieces you can use — with a record of exactly what happened, every time."
      relatedModules={["/agents", "/tasks", "/masterwork"]}
    />
  );
}
