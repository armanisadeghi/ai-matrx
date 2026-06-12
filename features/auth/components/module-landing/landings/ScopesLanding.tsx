import {
  Layers,
  Building2,
  FolderTree,
  CheckCircle2,
  BookTemplate,
  Replace,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: FolderTree,
    title: "Model your org's real shape",
    description:
      "Clients, departments, repos, cases, patients — the dimensions YOUR team works in. Scopes are user-authored, not hard-coded.",
  },
  {
    icon: Replace,
    title: "Active scope = ambient context",
    description:
      "Set a scope from the sidebar; every agent run, every note, every task inherits it. Switch scope, switch context — zero re-typing.",
  },
  {
    icon: CheckCircle2,
    title: "Local + global resolution",
    description:
      "Tag an item with its own scope (a note about Client X). Global active scope is the fallback. Contradictions surface as warnings.",
  },
  {
    icon: BookTemplate,
    title: "Templates per scope",
    description:
      "Each scope can ship its own templates, snippets, and standard positions. Switch to Client B and your playbook follows.",
  },
  {
    icon: Building2,
    title: "Permission-aware",
    description:
      "Org admins decide who sees which scopes. Sensitive client data stays invisible to teammates who shouldn't see it.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Name the dimensions",
    description:
      "Add the scope types your team uses (Client, Project, Repo, Case). Each can have its own items and templates.",
  },
  {
    number: "02",
    title: "Pick the active one",
    description:
      "The sidebar's active scope flows into every action — agent runs, notes, tasks, even chat history filtering.",
  },
  {
    number: "03",
    title: "Tag items per-item when needed",
    description:
      "Override the active scope on a single item — useful when one note is about Client X while you're working on Client Y.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Scope types",
    status: "Live",
    href: "/scopes",
    items: ["Define dimensions", "Per-org config", "Templates per type", "Permission rules"],
  },
  {
    title: "Active scope picker",
    status: "Live",
    items: ["Sidebar control", "Keyboard shortcut", "Multi-scope mix", "Recent history"],
  },
  {
    title: "Per-item scope assignment",
    status: "Live",
    items: ["Override active scope", "Filter feeds by scope", "Soft warnings on conflict", "Audit log per item"],
  },
  {
    title: "Scope-aware agents",
    status: "Live",
    items: ["Agents read active scope", "Per-scope variables", "Per-scope tools", "Scope-restricted runs"],
  },
];

export default function ScopesLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:scopes"
      eyebrow="AI Matrx Scopes"
      eyebrowIcon={Layers}
      headline="Context your team"
      headlineGradient="actually uses, on every run."
      description="Define the dimensions your team works in — clients, departments, repos, cases — and AI Matrx wires them into every agent, every note, every task. Switch scope, switch context, zero re-typing."
      primaryCtaHref="/sign-up?source=scopes-landing"
      primaryCtaLabel="Map Your Org Free"
      workspaceHref="/scopes"
      workspaceLabel="Scopes"
      capabilitiesHeading="Context that scales with your team"
      capabilitiesDescription="Five capabilities that turn ad-hoc context into a structural feature of every action."
      capabilities={CAPABILITIES}
      stepsDescription="From flat task lists to scope-aware execution in three steps."
      steps={STEPS}
      subAreasHeading="Scope surfaces"
      subAreasDescription="Types, active picker, per-item assignment, scope-aware agents — the full surface."
      subAreas={SUB_AREAS}
      finalCtaHeading="Make context structural, not ad-hoc"
      finalCtaDescription="Define your org's dimensions once; AI Matrx threads them everywhere. Free to start, no credit card."
      relatedModules={["/agent-context", "/agents", "/tasks"]}
    />
  );
}
