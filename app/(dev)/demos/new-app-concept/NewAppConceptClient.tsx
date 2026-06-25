"use client";

// app/(dev)/demos/new-app-concept/NewAppConceptClient.tsx
//
// Concept demo: a single adaptive "What are we creating today?" entryway.
//
// The three composer slots (topic / format / agent) are NOT static fields —
// each opens a different *kind* of picker, and all three reconfigure when the
// user picks a workflow at the bottom (Brainstorm / Research / Plan / Write /
// Podcast). Selecting "Podcast" fills the format dropdown with podcast formats,
// relabels the left slot to "Enter Topic", and swaps the agent list.
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
  /** Label shown above the left (topic) slot — changes per workflow. */
  inputLabel: string;
  placeholder: string;
  sample: string;
  icon: LucideIcon;
  /** Decorative accent for the workflow card + topic header bubble. */
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
  const [topicOpen, setTopicOpen] = useState(true);
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

  const handleWorkflowSelect = (next: WorkflowId) => {
    setWorkflowId(next);
    setTopicOpen(true);
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

          <div className="mt-10 w-full max-w-5xl rounded-2xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] dark:shadow-[0_24px_80px_rgba(0,0,0,0.35)]">
            <div className="mb-6 text-lg font-medium text-muted-foreground">
              Describe what you want to create
            </div>
            <div className="grid items-stretch gap-4 lg:grid-cols-[56px_minmax(220px,1.2fr)_minmax(240px,1.2fr)_minmax(220px,0.9fr)_56px]">
              {/* Add source — illustrative in this concept */}
              <button
                type="button"
                onClick={() =>
                  toast.info("Add a source — files, URLs, and notes plug in here.")
                }
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-border bg-background text-primary shadow-sm transition hover:border-primary/40 hover:bg-accent"
                aria-label="Add source"
              >
                <Plus className="h-6 w-6" />
              </button>

              {/* SLOT 1 — Topic: opens an inline text area below */}
              <button
                type="button"
                onClick={() => setTopicOpen((open) => !open)}
                aria-expanded={topicOpen}
                className="flex min-h-14 items-center justify-between rounded-xl border border-border bg-background px-5 text-left shadow-sm transition hover:border-primary/40 hover:bg-accent/60"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-muted-foreground">
                    {config.inputLabel}
                  </span>
                  <span className="block truncate text-base font-semibold text-foreground">
                    {selection.value || config.placeholder}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                    topicOpen && "rotate-180",
                  )}
                />
              </button>

              {/* SLOT 2 — Format: opens a grid popover of format tiles */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="grid min-h-14 grid-cols-[96px_1fr_auto] overflow-hidden rounded-xl border border-border bg-background text-left shadow-sm transition hover:border-primary/40 hover:bg-accent/60"
                  >
                    <span className="flex items-center justify-center border-r border-border bg-primary/5 text-primary">
                      <ActiveIcon className="h-7 w-7" />
                    </span>
                    <span className="min-w-0 px-5 py-3">
                      <span className="block text-sm font-medium text-muted-foreground">
                        Pick a Format
                      </span>
                      <span className="block truncate text-base font-semibold text-foreground">
                        {format.label}
                      </span>
                    </span>
                    <span className="flex items-center pr-4 text-muted-foreground">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(520px,calc(100vw-2rem))] rounded-2xl border-border bg-popover p-3 shadow-2xl">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {config.formats.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateSelection({ formatId: item.id })}
                        className={cn(
                          "rounded-xl border p-3 text-left transition",
                          item.id === selection.formatId
                            ? "border-primary/50 bg-primary/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:bg-accent/60 hover:text-foreground",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {item.label}
                          </span>
                          {item.id === selection.formatId && (
                            <Check className="h-4 w-4 text-primary" />
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {item.helper}
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              {/* SLOT 3 — Agent: opens a list popover of agent profiles */}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="grid min-h-14 grid-cols-[72px_1fr_auto] overflow-hidden rounded-xl border border-border bg-background text-left shadow-sm transition hover:border-primary/40 hover:bg-accent/60"
                  >
                    <span className="flex items-center justify-center border-r border-border bg-primary/5 text-primary">
                      <Cpu className="h-7 w-7" />
                    </span>
                    <span className="min-w-0 px-4 py-3">
                      <span className="block text-sm font-medium text-muted-foreground">
                        Agent
                      </span>
                      <span className="block truncate text-base font-semibold text-foreground">
                        {agent.label}
                      </span>
                    </span>
                    <span className="flex items-center pr-4 text-muted-foreground">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(390px,calc(100vw-2rem))] rounded-2xl border-border bg-popover p-2 shadow-2xl"
                >
                  <div className="space-y-1">
                    {config.agents.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateSelection({ agentId: item.id })}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-xl p-3 text-left transition",
                          item.id === selection.agentId
                            ? "bg-primary/10 text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-primary">
                          <Cpu className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                            {item.label}
                            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {item.speed}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {item.helper}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Button
                type="button"
                size="icon"
                onClick={submit}
                disabled={isPending}
                className="h-14 w-14 rounded-xl"
                aria-label="Submit workflow"
              >
                <ArrowUp className="h-6 w-6" />
              </Button>
            </div>

            {topicOpen && (
              <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-3">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    <span
                      className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg",
                        config.iconBubble,
                      )}
                    >
                      <ActiveIcon className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {config.inputLabel}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        This picker becomes the primary prompt for{" "}
                        {config.label.toLowerCase()}.
                      </div>
                    </div>
                  </div>
                  <Textarea
                    value={selection.value}
                    onChange={(event) => updateSelection({ value: event.target.value })}
                    placeholder={config.placeholder}
                    autoGrow
                    minHeight={112}
                    maxHeight={220}
                    wrapperClassName="rounded-xl bg-transparent"
                    className="rounded-xl border-border bg-background text-base text-foreground shadow-sm placeholder:text-muted-foreground"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[config.sample, "Patient-friendly overview", "Expert debate"].map(
                      (sample) => (
                        <button
                          key={sample}
                          type="button"
                          onClick={() => updateSelection({ value: sample })}
                          className="rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:border-primary/40 hover:text-primary"
                        >
                          {sample}
                        </button>
                      ),
                    )}
                  </div>
                </div>
              </div>
            )}
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
                  onClick={() => handleWorkflowSelect(id)}
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
