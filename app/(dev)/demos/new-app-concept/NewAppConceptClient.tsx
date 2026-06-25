"use client";

// app/(dev)/demos/new-app-concept/NewAppConceptClient.tsx
//
// Concept demo: a single adaptive creation composer.
//
// The shape is a NORMAL AI chat input — a real text area is the primary element
// — expanded a little at the bottom to hold a compact control strip. That strip
// (add-source, format dropdown, agent dropdown, send) stays well under ~35-40%
// of the box height, and its dropdowns open as SMALL popovers. All of it
// reconfigures when the user picks a workflow below (Brainstorm / Research /
// Plan / Write / Podcast): the input's label/placeholder, the format options,
// and the agent options all swap.
//
// Two handoffs are LIVE today and route into the real product flows:
//   • Podcast  → /podcast/studio/create  (reads topic / format / agent params)
//   • Research → /research/topics/new     (reads topic + mode=ai params)
// The remaining workflows are illustrative until their entry flows are wired.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ChevronDown,
  ClipboardList,
  Cpu,
  FileText,
  Grid2X2,
  LayoutGrid,
  Lightbulb,
  List,
  Mic,
  Pencil,
  Plus,
  Search,
  Star,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type WorkflowId = "brainstorm" | "research" | "plan" | "write" | "podcast";

interface FormatOption {
  id: string;
  label: string;
  helper: string;
  /** Value passed to the destination flow (e.g. PodcastFormat). */
  routeValue?: string;
}

interface AgentOption {
  id: string;
  label: string;
  helper: string;
  speed: string;
}

interface WorkflowConfig {
  id: WorkflowId;
  label: string;
  /** Eyebrow above the input — changes per workflow ("Enter Topic", …). */
  inputLabel: string;
  placeholder: string;
  sample: string;
  icon: LucideIcon;
  /** Decorative accent for the workflow card. */
  iconBubble: string;
  formats: FormatOption[];
  agents: AgentOption[];
}

const workflowConfigs: Record<WorkflowId, WorkflowConfig> = {
  brainstorm: {
    id: "brainstorm",
    label: "Brainstorm",
    inputLabel: "Seed idea",
    placeholder: "What should we brainstorm?",
    sample: "Launch ideas for a patient education hub",
    icon: Lightbulb,
    iconBubble: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    formats: [
      { id: "idea-map", label: "Idea Map", helper: "Clustered directions" },
      { id: "names", label: "Naming Sprint", helper: "Fast naming set" },
      { id: "angles", label: "Creative Angles", helper: "Campaign hooks" },
    ],
    agents: [
      { id: "spark", label: "Matrx Spark", helper: "Fast divergent thinking", speed: "Fast" },
      { id: "ultra", label: "Matrx Ultra", helper: "Deeper strategy pass", speed: "Deep" },
      { id: "studio", label: "Matrx Studio", helper: "Brand and content aware", speed: "Balanced" },
    ],
  },
  research: {
    id: "research",
    label: "Research",
    inputLabel: "Research subject",
    placeholder: "What should we research?",
    sample: "Huntington's disease treatment landscape",
    icon: Search,
    iconBubble: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    formats: [
      { id: "topic", label: "Research Topic", helper: "Create a research pipeline" },
      { id: "brief", label: "Source Brief", helper: "Find and rank sources" },
      { id: "report", label: "Evidence Report", helper: "Synthesis-ready framing" },
    ],
    agents: [
      { id: "research-oracle", label: "Research Oracle", helper: "Best for source discovery", speed: "Deep" },
      { id: "matrx-ultra", label: "Matrx Ultra", helper: "General high-reasoning agent", speed: "Deep" },
      { id: "matrx-mini", label: "Matrx Mini", helper: "Quick scoping pass", speed: "Fast" },
    ],
  },
  plan: {
    id: "plan",
    label: "Plan",
    inputLabel: "Plan goal",
    placeholder: "What are we planning?",
    sample: "Clinical content calendar for Q3",
    icon: ClipboardList,
    iconBubble: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    formats: [
      { id: "project-plan", label: "Project Plan", helper: "Milestones and owners" },
      { id: "checklist", label: "Checklist", helper: "Actionable task list" },
      { id: "roadmap", label: "Roadmap", helper: "Sequenced phases" },
    ],
    agents: [
      { id: "matrx-pm", label: "Matrx PM", helper: "Operations-focused planner", speed: "Balanced" },
      { id: "matrx-ultra", label: "Matrx Ultra", helper: "Complex dependencies", speed: "Deep" },
      { id: "matrx-mini", label: "Matrx Mini", helper: "Quick outline", speed: "Fast" },
    ],
  },
  write: {
    id: "write",
    label: "Write",
    inputLabel: "Writing brief",
    placeholder: "What should we write?",
    sample: "Plain-language explainer for caregivers",
    icon: Pencil,
    iconBubble: "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300",
    formats: [
      { id: "article", label: "Article", helper: "Structured long-form" },
      { id: "email", label: "Email Sequence", helper: "Multi-touch copy" },
      { id: "script", label: "Script", helper: "Voice-ready draft" },
    ],
    agents: [
      { id: "matrx-writer", label: "Matrx Writer", helper: "Editorial polish", speed: "Balanced" },
      { id: "matrx-ultra", label: "Matrx Ultra", helper: "Complex subject matter", speed: "Deep" },
      { id: "matrx-mini", label: "Matrx Mini", helper: "Fast first draft", speed: "Fast" },
    ],
  },
  podcast: {
    id: "podcast",
    label: "Podcast",
    inputLabel: "Enter Topic",
    placeholder: "What should the episode cover?",
    sample: "Huntington's Disease",
    icon: Mic,
    iconBubble: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
    formats: [
      { id: "episode", label: "Podcast Episode", helper: "Full generated episode", routeValue: "educational" },
      { id: "interview", label: "Interview", helper: "Host and guest Q&A", routeValue: "interview" },
      { id: "debate", label: "Debate", helper: "Opposing perspectives", routeValue: "debate" },
    ],
    agents: [
      { id: "matrx-ultra", label: "Matrx Ultra", helper: "Best overall quality", speed: "Deep" },
      { id: "podcast-studio", label: "Podcast Studio", helper: "Production-tuned profile", speed: "Balanced" },
      { id: "matrx-mini", label: "Matrx Mini", helper: "Faster test run", speed: "Fast" },
    ],
  },
};

const workflowOrder: WorkflowId[] = ["brainstorm", "research", "plan", "write", "podcast"];

/** Workflows whose handoff is wired into a real product flow today. */
const LIVE_WORKFLOWS = new Set<WorkflowId>(["podcast", "research"]);

function initialSelection(workflowId: WorkflowId) {
  const config = workflowConfigs[workflowId];
  return {
    value: config.sample,
    formatId: config.formats[0].id,
    agentId: config.agents[0].id,
  };
}

const NAV_ITEMS: { label: string; icon: LucideIcon; href?: string }[] = [
  { label: "Projects", icon: FileText, href: "/projects" },
  { label: "Agents", icon: Cpu, href: "/agents" },
  { label: "Workflows", icon: WandSparkles },
  { label: "Knowledge Base", icon: BookOpen, href: "/rag" },
  { label: "Apps", icon: LayoutGrid, href: "/apps" },
];

export function NewAppConceptClient() {
  const router = useRouter();
  const [workflowId, setWorkflowId] = useState<WorkflowId>("podcast");
  const [selections, setSelections] = useState(() => {
    const entries = workflowOrder.map((id) => [id, initialSelection(id)]);
    return Object.fromEntries(entries) as Record<
      WorkflowId,
      ReturnType<typeof initialSelection>
    >;
  });
  const [activeNav, setActiveNav] = useState("Projects");
  const [isPending, startTransition] = useTransition();

  const config = workflowConfigs[workflowId];
  const selection = selections[workflowId];
  const format =
    config.formats.find((item) => item.id === selection.formatId) ?? config.formats[0];
  const agent =
    config.agents.find((item) => item.id === selection.agentId) ?? config.agents[0];
  const ActiveIcon = config.icon;

  const updateSelection = (patch: Partial<ReturnType<typeof initialSelection>>) => {
    setSelections((prev) => ({
      ...prev,
      [workflowId]: { ...prev[workflowId], ...patch },
    }));
  };

  const submit = () => {
    const topic = selection.value.trim();
    if (!topic) {
      toast.error("Add a topic before submitting.");
      return;
    }

    const params = new URLSearchParams();
    params.set("topic", topic);
    params.set("source", "new-app-concept");
    params.set("agent", agent.label);

    if (workflowId === "podcast") {
      params.set("format", format.routeValue ?? "educational");
      startTransition(() => router.push(`/podcast/studio/create?${params.toString()}`));
      return;
    }

    if (workflowId === "research") {
      params.set("mode", "ai");
      startTransition(() => router.push(`/research/topics/new?${params.toString()}`));
      return;
    }

    toast.info(`${config.label} isn't wired yet — Podcast and Research are live in this demo.`);
  };

  const startFromScratch = () => {
    startTransition(() => router.push("/chat"));
  };

  const navItems = useMemo(
    () => NAV_ITEMS.map((item) => ({ ...item, active: item.label === activeNav })),
    [activeNav],
  );

  return (
    <div className="w-full overflow-x-hidden bg-textured text-foreground">
      <div className="mx-auto flex min-h-[calc(100dvh-var(--header-height,2.5rem))] w-full max-w-7xl flex-col px-4 pb-8 pt-8 sm:px-6 lg:px-10">
        <section className="flex flex-1 flex-col items-center">
          <h1 className="mt-2 text-center font-serif text-4xl font-semibold tracking-tight text-foreground sm:text-5xl md:text-6xl">
            What are we creating today?
          </h1>

          {/* The composer — a normal AI input. Text area is the primary element;
              the control strip below it stays small (well under ~40% height). */}
          <div className="mt-10 w-full max-w-3xl rounded-3xl border border-border bg-card p-2.5 shadow-[0_20px_70px_rgba(15,23,42,0.10)] focus-within:border-primary/40 dark:shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
            <div className="px-3 pt-2.5">
              <label
                htmlFor="concept-input"
                className="mb-1 block text-xs font-medium text-muted-foreground"
              >
                {config.inputLabel}
              </label>
              <Textarea
                id="concept-input"
                value={selection.value}
                onChange={(event) => updateSelection({ value: event.target.value })}
                placeholder={config.placeholder}
                autoGrow
                minHeight={92}
                maxHeight={240}
                wrapperClassName="bg-transparent"
                className="resize-none border-0 bg-transparent px-0 py-0 text-base text-foreground shadow-none placeholder:text-muted-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            <div className="flex items-center gap-2 px-2 pb-1.5 pt-1.5">
              {/* Add source — illustrative in this concept */}
              <button
                type="button"
                onClick={() =>
                  toast.info("Add a source — files, URLs, and notes plug in here.")
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-primary"
                aria-label="Add source"
              >
                <Plus className="h-4 w-4" />
              </button>

              {/* Format — small dropdown popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-2.5 text-sm shadow-sm transition hover:border-primary/40 hover:bg-accent"
                  >
                    <ActiveIcon className="h-4 w-4 shrink-0 text-primary" />
                    <span className="max-w-[160px] truncate font-medium text-foreground">
                      {format.label}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-64 rounded-xl border-border bg-popover p-1.5 shadow-xl"
                >
                  <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Format
                  </div>
                  {config.formats.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateSelection({ formatId: item.id })}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition",
                        item.id === selection.formatId
                          ? "bg-primary/10"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-foreground">
                          {item.label}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.helper}
                        </span>
                      </span>
                      {item.id === selection.formatId && (
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      )}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Agent — small dropdown popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-9 min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-2.5 text-sm shadow-sm transition hover:border-primary/40 hover:bg-accent"
                  >
                    <Cpu className="h-4 w-4 shrink-0 text-primary" />
                    <span className="max-w-[140px] truncate font-medium text-foreground">
                      {agent.label}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="w-72 rounded-xl border-border bg-popover p-1.5 shadow-xl"
                >
                  <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Agent
                  </div>
                  {config.agents.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateSelection({ agentId: item.id })}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition",
                        item.id === selection.agentId
                          ? "bg-primary/10"
                          : "hover:bg-accent",
                      )}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary">
                        <Cpu className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                          <span className="truncate">{item.label}</span>
                          <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {item.speed}
                          </span>
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.helper}
                        </span>
                      </span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                size="icon"
                onClick={submit}
                disabled={isPending}
                className="ml-auto h-9 w-9 shrink-0 rounded-xl"
                aria-label="Submit"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="mt-12 text-center text-lg font-semibold text-foreground/80">
            Start with a workflow...
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-3 sm:gap-4">
            {workflowOrder.map((id, index) => {
              const item = workflowConfigs[id];
              const Icon = item.icon;
              const active = id === workflowId;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setWorkflowId(id)}
                  className={cn(
                    "flex h-36 w-32 flex-col items-center justify-center gap-4 rounded-xl border border-border bg-card text-foreground shadow-sm transition hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg",
                    index % 2 === 0 ? "rotate-[-2deg]" : "rotate-[1.5deg]",
                    active &&
                      "border-primary/50 shadow-[0_20px_50px_rgba(37,99,235,0.18)] ring-2 ring-primary/30",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-16 w-16 items-center justify-center rounded-full",
                      item.iconBubble,
                    )}
                  >
                    <Icon className="h-8 w-8" />
                  </span>
                  <span className="text-lg font-semibold">{item.label}</span>
                  {!LIVE_WORKFLOWS.has(id) && (
                    <span className="sr-only">(preview)</span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={startFromScratch}
            disabled={isPending}
            className="mt-9 inline-flex items-center gap-2 text-base font-semibold text-foreground/80 transition hover:text-primary"
          >
            ...or start from scratch
            <ArrowRight className="h-5 w-5 text-primary" />
          </button>
        </section>

        <section className="mt-12 border-t border-border pt-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap items-center gap-4 sm:gap-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setActiveNav(item.label);
                      if (item.href) {
                        startTransition(() => router.push(item.href!));
                      } else {
                        toast.info(`${item.label} — coming to the entryway.`);
                      }
                    }}
                    className={cn(
                      "relative flex h-10 items-center gap-2 text-sm font-medium transition",
                      item.active
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                    {item.active && (
                      <span className="absolute inset-x-0 -bottom-3 h-0.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <div className="flex h-10 w-full min-w-[220px] items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm text-muted-foreground shadow-sm lg:w-64">
                <Search className="h-4 w-4" />
                Search
              </div>
              <button
                type="button"
                className="hidden h-10 w-10 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground shadow-sm hover:text-foreground sm:flex"
                aria-label="Favorites"
              >
                <Star className="h-5 w-5" />
              </button>
              <div className="hidden items-center rounded-lg border border-border bg-background p-1 shadow-sm sm:flex">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary"
                  aria-label="Grid view"
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex w-full max-w-xl items-center overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex h-16 w-24 items-center justify-center bg-primary/5 text-primary">
              <BookOpen className="h-8 w-8" />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-5">
              <span className="truncate text-base font-semibold text-foreground">
                Learn about AI Matrx
              </span>
              <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-primary sm:inline-flex">
                Quick start guide
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
