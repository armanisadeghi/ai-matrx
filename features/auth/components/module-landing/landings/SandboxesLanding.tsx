import {
  Container,
  ShieldCheck,
  Boxes,
  Terminal,
  RefreshCw,
  Database,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Container,
    title: "A computer in the cloud, on demand",
    description:
      "Linux container, your runtimes pre-installed, shared by your team and your agents. Spin up in seconds, persist as long as needed.",
  },
  {
    icon: Boxes,
    title: "Tools, files, agents — all in one place",
    description:
      "Your code editor, your terminal, your file manager, and your agents share the same sandbox. No copy-paste between tabs.",
  },
  {
    icon: ShieldCheck,
    title: "Isolated by design",
    description:
      "Each sandbox is a sealed environment. Run untrusted code, install random packages, blow stuff up — your main machine stays clean.",
  },
  {
    icon: Database,
    title: "Persistent disk",
    description:
      "Files stay between sessions. Pause a sandbox overnight, resume in the morning. Your state survives — including agent memory.",
  },
  {
    icon: Terminal,
    title: "Real shell + real network",
    description:
      "Not a toy REPL. Run servers, hit APIs, clone repos, build images. The sandbox behaves like a real machine because it is one.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Spin one up",
    description:
      "Pick a template (Node + Python, full LAMP, blank), name it, hit Launch. The container is ready in under 30 seconds.",
  },
  {
    number: "02",
    title: "Hand the keys to an agent",
    description:
      "Drop an agent into the sandbox. It reads files, runs commands, edits code — every action logged and reversible.",
  },
  {
    number: "03",
    title: "Snapshot, share, or kill",
    description:
      "Save the sandbox as a template, share access with a teammate, or shut it down. You pay for what you keep alive.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Your sandboxes",
    status: "Live",
    href: "/sandbox",
    items: ["List + status", "Per-sandbox usage", "Pause / resume", "Snapshot to template"],
  },
  {
    title: "Sandbox launcher",
    status: "Live",
    href: "/sandbox",
    items: ["Curated templates", "Custom Dockerfile", "Per-sandbox env vars", "GPU options"],
  },
  {
    title: "Agent-driven runs",
    status: "Live",
    items: ["Drop agents in", "Replay every action", "Diff before apply", "Per-tool guardrails"],
  },
  {
    title: "Shared workspaces",
    status: "Coming soon",
    items: ["Multi-user editing", "Cursor presence", "Voice + chat", "Hand-off without copy"],
  },
];

export default function SandboxesLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:sandboxes"
      eyebrow="AI Matrx Sandboxes"
      eyebrowIcon={Container}
      headline="A cloud computer"
      headlineGradient="your agents already know."
      description="Real Linux containers your team and your agents share — code editors, terminals, files, agent runs, all in one persistent environment. Spin up in seconds; isolate everything you don't want to touch your laptop."
      primaryCtaHref="/sign-up?source=sandboxes-landing"
      primaryCtaLabel="Launch a Sandbox Free"
      workspaceHref="/sandbox"
      workspaceLabel="Sandboxes"
      capabilitiesHeading="A real machine, on demand, in your browser"
      capabilitiesDescription="Five capabilities under every sandbox — container, tooling, isolation, persistence, full networking."
      capabilities={CAPABILITIES}
      stepsDescription="From an idea to a running, agent-driven environment in three steps."
      steps={STEPS}
      subAreasHeading="Sandbox surfaces"
      subAreasDescription="Manage running sandboxes, launch new ones, hand them off to agents, share with your team."
      subAreas={SUB_AREAS}
      finalCtaHeading="Give your agents real hands"
      finalCtaDescription="Stop chaining agents through APIs. Drop them into a sandbox, watch them work. Free to start, no credit card."
      relatedModules={["/code", "/agents", "/files"]}
    />
  );
}
