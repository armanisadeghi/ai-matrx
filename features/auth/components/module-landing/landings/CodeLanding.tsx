import {
  Code2,
  Terminal,
  GitBranch,
  Container,
  PlayCircle,
  FileCode2,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: FileCode2,
    title: "Full editor, in the browser",
    description:
      "Monaco / VSCode-style editor with syntax highlighting, multi-file projects, file tree, and find-in-files. Open a project, start editing.",
  },
  {
    icon: Terminal,
    title: "Live terminal and agents",
    description:
      "Real shell access to a running container. Drop an agent into the same workspace — it reads your code, edits files, runs tests.",
  },
  {
    icon: Container,
    title: "Backed by sandboxes",
    description:
      "Every workspace runs in a real Linux container with your runtimes installed. Node, Python, Rust, Go — start and they're ready.",
  },
  {
    icon: PlayCircle,
    title: "Run anything live",
    description:
      "Servers, scripts, notebooks. Preview HTTP services on a generated URL. Iterate without leaving the editor.",
  },
  {
    icon: GitBranch,
    title: "Git, GitHub, branches",
    description:
      "Connect a repo, branch, commit, push, open a PR. Agents make commits like your teammates — every change attributable.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Open or clone a project",
    description:
      "Start from a blank workspace, a template, or your GitHub repo. The container spins up in seconds.",
  },
  {
    number: "02",
    title: "Edit, run, iterate",
    description:
      "Code in the editor, run in the terminal, preview HTTP services in the browser. Agents help when you ask, stay out of the way otherwise.",
  },
  {
    number: "03",
    title: "Ship",
    description:
      "Commit and push to your repo, deploy with one command, or hand off to an agent to finish and PR.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Editor + terminal",
    status: "Live",
    href: "/code",
    items: ["Monaco editor", "Multi-file projects", "Shared terminal", "Live preview URL"],
  },
  {
    title: "Sandbox runtime",
    status: "Live",
    href: "/sandbox",
    items: ["Linux container", "Pre-installed runtimes", "Persistent disk", "Resource caps"],
  },
  {
    title: "Agent collaboration",
    status: "Live",
    items: ["Agents read + edit code", "Attributable commits", "Replay every change", "Diff before apply"],
  },
  {
    title: "Git + GitHub",
    status: "Live",
    items: ["Clone, branch, push", "PR from inside the editor", "Tracked OAuth scopes", "Per-org connections"],
  },
];

export default function CodeLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:code"
      eyebrow="AI Matrx Code"
      eyebrowIcon={Code2}
      headline="A VSCode-style workspace"
      headlineGradient="with agents that pull their weight."
      description="Edit files, run code, preview servers — in a real Linux container, in your browser. Drop an agent into the same workspace and it works the codebase like your teammates do, with commits and PRs to match."
      primaryCtaHref="/sign-up?source=code-landing"
      primaryCtaLabel="Start Coding Free"
      workspaceHref="/code"
      workspaceLabel="Code"
      capabilitiesHeading="A real dev environment, not a chat box"
      capabilitiesDescription="Five capabilities under every workspace — editor, terminal, runtime, preview, git."
      capabilities={CAPABILITIES}
      stepsDescription="From an empty workspace to a deployed change in three steps."
      steps={STEPS}
      subAreasHeading="Workspace surfaces"
      subAreasDescription="Editor, sandbox runtime, agent collaboration, and git — all in one place."
      subAreas={SUB_AREAS}
      finalCtaHeading="Code where your agents code"
      finalCtaDescription="A workspace where humans and agents both contribute, both leave a trail. Free to start, no credit card."
    />
  );
}
