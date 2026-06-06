import {
  ListTodo,
  Workflow,
  Users,
  GitBranch,
  Bell,
  Calendar,
  Forward,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "@/features/auth/components/module-landing/ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: Forward,
    title: "Hand any task to an agent",
    description:
      "Assign a task to an agent the same way you'd assign it to a teammate. The agent picks it up, runs the plan, and reports back with results.",
  },
  {
    icon: Workflow,
    title: "Multi-step plans, not flat lists",
    description:
      "Break work into checklists, sub-tasks, dependencies. Tasks become workflows that agents and humans can both execute.",
  },
  {
    icon: GitBranch,
    title: "Branch, fork, parallelize",
    description:
      "Run variations of the same task in parallel — three drafts, three approaches, three model calls. Compare results side by side.",
  },
  {
    icon: Calendar,
    title: "Schedule and recur",
    description:
      "Run a task once, daily, weekly, or on a cron. Tasks become reliable jobs your agents own — no more remembering to run things.",
  },
  {
    icon: Users,
    title: "Assignment and handoff",
    description:
      "Assign to a person, a team, or an agent. Hand off mid-run. Every action is logged so the next assignee picks up cleanly.",
  },
  {
    icon: Bell,
    title: "Completion and replay",
    description:
      "Notifications on completion, failure, or stall. Every run is replayable — diagnose what an agent did and re-run from any step.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Capture the work",
    description:
      "Create a task from chat, from a note, from an agent's output, or from scratch. Tag it with project, scope, and priority.",
  },
  {
    number: "02",
    title: "Decide who owns it",
    description:
      "Assign to yourself, a teammate, or an agent. Agents pick up assigned tasks automatically and start executing.",
  },
  {
    number: "03",
    title: "Run, monitor, intervene",
    description:
      "Watch progress live. Step in mid-run to redirect, override, or hand off. Every action is logged and reversible.",
  },
  {
    number: "04",
    title: "Ship and review",
    description:
      "Completed tasks generate a summary, link out to artifacts, and roll up to the project. Re-run any task with one click.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Personal tasks",
    status: "Live",
    href: "/tasks",
    items: [
      "Lightweight checklist view",
      "Group by project / scope",
      "Filter by status",
      "Pinned + recurring",
    ],
  },
  {
    title: "Agent-executed tasks",
    status: "Live",
    href: "/tasks",
    items: [
      "Assign agents like teammates",
      "Live progress + intervention",
      "Per-step logging",
      "Re-run from any step",
    ],
  },
  {
    title: "Projects",
    status: "Live",
    href: "/projects",
    items: [
      "Group related tasks",
      "Roll-up status + progress",
      "Shared with team",
      "Templates supported",
    ],
  },
  {
    title: "Scheduled tasks",
    status: "Live",
    items: [
      "One-shot, recurring, cron",
      "Time-zone aware",
      "Failure alerts + retries",
      "Audit trail",
    ],
  },
  {
    title: "Team tasks",
    status: "Live",
    href: "/tasks",
    items: [
      "Org-wide assignment",
      "Handoff between members",
      "Permission-aware",
      "Comment threads",
    ],
  },
  {
    title: "Headless tasks API",
    status: "Coming soon",
    items: [
      "Trigger from anywhere",
      "Webhooks on completion",
      "Org-scoped keys",
      "Replay endpoint",
    ],
  },
];

export default function TasksLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:tasks"
      eyebrow="AI Matrx Tasks"
      eyebrowIcon={ListTodo}
      headline="Tasks your agents"
      headlineGradient="can actually do."
      description="Capture work, hand it off to an agent (or a teammate), watch it run, intervene if needed. Tasks in AI Matrx are checklists, jobs, and workflows in one — owned by humans, executed by agents."
      primaryCtaHref="/sign-up?source=tasks-landing"
      primaryCtaLabel="Start Running Tasks Free"
      workspaceHref="/tasks"
      workspaceLabel="Tasks"
      capabilitiesHeading="A task list with execution baked in"
      capabilitiesDescription="Six capabilities under every task — assignment, planning, parallel runs, scheduling, handoff, and replay."
      stepsDescription="From a captured idea to a shipped, audited result in four steps."
      steps={STEPS}
      capabilities={CAPABILITIES}
      subAreasHeading="Task surfaces"
      subAreasDescription="One queue, many ways to drive it — personal, team, agent-run, scheduled."
      subAreas={SUB_AREAS}
      finalCtaHeading="Put your task list to work"
      finalCtaDescription="Tasks that run themselves, with the audit trail to prove it. Free to start, no credit card required."
      relatedModules={["/agents", "/notes", "/agent-apps"]}
    />
  );
}
