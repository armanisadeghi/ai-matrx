"use client";

import { useMemo, useState, useTransition } from "react";
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
  Hexagon,
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
  inputLabel: string;
  placeholder: string;
  sample: string;
  icon: LucideIcon;
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
    iconBubble: "bg-amber-100 text-amber-700",
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
    iconBubble: "bg-sky-100 text-sky-700",
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
    iconBubble: "bg-emerald-100 text-emerald-700",
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
    iconBubble: "bg-violet-100 text-violet-700",
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
    iconBubble: "bg-cyan-100 text-cyan-800",
    formats: [
      {
        id: "episode",
        label: "Podcast Episode",
        helper: "Full generated episode",
        routeValue: "educational",
      },
      {
        id: "interview",
        label: "Interview",
        helper: "Host and guest Q&A",
        routeValue: "interview",
      },
      {
        id: "debate",
        label: "Debate",
        helper: "Opposing perspectives",
        routeValue: "debate",
      },
    ],
    agents: [
      { id: "matrx-ultra", label: "Matrx Ultra", helper: "Best overall quality", speed: "Deep" },
      { id: "podcast-studio", label: "Podcast Studio", helper: "Production-tuned profile", speed: "Balanced" },
      { id: "matrx-mini", label: "Matrx Mini", helper: "Faster test run", speed: "Fast" },
    ],
  },
};

const workflowOrder: WorkflowId[] = [
  "brainstorm",
  "research",
  "plan",
  "write",
  "podcast",
];

function initialSelection(workflowId: WorkflowId) {
  const config = workflowConfigs[workflowId];
  return {
    value: config.sample,
    formatId: config.formats[0].id,
    agentId: config.agents[0].id,
  };
}

export function MatrxEntryDemoClient() {
  const [workflowId, setWorkflowId] = useState<WorkflowId>("podcast");
  const [selections, setSelections] = useState(() => {
    const entries = workflowOrder.map((id) => [id, initialSelection(id)]);
    return Object.fromEntries(entries) as Record<
      WorkflowId,
      ReturnType<typeof initialSelection>
    >;
  });
  const [topicOpen, setTopicOpen] = useState(true);
  const [isPending, startTransition] = useTransition();

  const config = workflowConfigs[workflowId];
  const selection = selections[workflowId];
  const format =
    config.formats.find((item) => item.id === selection.formatId) ??
    config.formats[0];
  const agent =
    config.agents.find((item) => item.id === selection.agentId) ??
    config.agents[0];
  const ActiveIcon = config.icon;

  const updateSelection = (
    patch: Partial<ReturnType<typeof initialSelection>>,
  ) => {
    setSelections((prev) => ({
      ...prev,
      [workflowId]: { ...prev[workflowId], ...patch },
    }));
  };

  const handleWorkflowSelect = (next: WorkflowId) => {
    setWorkflowId(next);
    setTopicOpen(next === "podcast");
  };

  const submit = () => {
    const topic = selection.value.trim();
    if (!topic) {
      toast.error("Add a topic before submitting.");
      return;
    }

    const params = new URLSearchParams();
    params.set("topic", topic);
    params.set("source", "matrx-entry-demo");
    params.set("agent", agent.label);

    if (workflowId === "podcast") {
      params.set("format", format.routeValue ?? "educational");
      startTransition(() => {
        window.location.assign(`/podcast/studio/create?${params.toString()}`);
      });
      return;
    }

    if (workflowId === "research") {
      params.set("mode", "ai");
      startTransition(() => {
        window.location.assign(`/research/topics/new?${params.toString()}`);
      });
      return;
    }

    toast.info("This demo handoff is wired for Podcast and Research right now.");
  };

  const navItems = useMemo(
    () => [
      { label: "Projects", icon: FileText, active: true },
      { label: "Agents", icon: Cpu, active: false },
      { label: "Workflows", icon: WandSparkles, active: false },
      { label: "Knowledge Base", icon: BookOpen, active: false },
      { label: "Apps", icon: LayoutGrid, active: false },
    ],
    [],
  );

  return (
    <main className="min-h-dvh overflow-hidden bg-[#f8fbff] text-slate-950">
      <header className="flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/75 px-5 backdrop-blur md:px-9">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm shadow-blue-500/30">
            <Hexagon className="h-5 w-5 fill-white/20" />
          </span>
          <span className="text-2xl font-semibold tracking-tight">
            AI Matrx
          </span>
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-blue-200 bg-blue-100 text-sm font-semibold text-blue-700 shadow-sm"
          aria-label="Account"
        >
          A
        </button>
      </header>

      <div className="mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-7xl flex-col px-4 pb-6 pt-10 sm:px-6 lg:px-10">
        <section className="flex flex-1 flex-col items-center">
          <h1 className="mt-2 text-center font-serif text-4xl font-semibold tracking-normal text-slate-950 sm:text-5xl md:text-6xl">
            What are we creating today?
          </h1>

          <div className="mt-10 w-full max-w-5xl rounded-[18px] border border-slate-200 bg-white/95 p-5 shadow-[0_24px_80px_rgba(15,23,42,0.11)]">
            <div className="mb-6 text-lg font-medium text-blue-900/60">
              Describe what you want to create
            </div>
            <div className="grid items-stretch gap-4 lg:grid-cols-[56px_minmax(220px,1.2fr)_minmax(240px,1.2fr)_minmax(220px,0.9fr)_56px]">
              <button
                type="button"
                className="flex h-14 w-14 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-900 shadow-sm transition hover:border-blue-300 hover:bg-blue-50"
                aria-label="Add source"
              >
                <Plus className="h-6 w-6" />
              </button>

              <button
                type="button"
                onClick={() => setTopicOpen((open) => !open)}
                aria-expanded={topicOpen}
                className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-blue-900/70">
                    {config.inputLabel}
                  </span>
                  <span className="block truncate text-base font-semibold text-slate-950">
                    {selection.value || config.placeholder}
                  </span>
                </span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-blue-900 transition-transform",
                    topicOpen && "rotate-180",
                  )}
                />
              </button>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="grid min-h-14 grid-cols-[96px_1fr_auto] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    <span className="flex items-center justify-center border-r border-slate-100 bg-blue-50/70 text-blue-700">
                      <ActiveIcon className="h-7 w-7" />
                    </span>
                    <span className="min-w-0 px-5 py-3">
                      <span className="block text-sm font-medium text-blue-900/70">
                        Pick a Format
                      </span>
                      <span className="block truncate text-base font-semibold text-slate-950">
                        {format.label}
                      </span>
                    </span>
                    <span className="flex items-center pr-4 text-blue-900">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[min(520px,calc(100vw-2rem))] rounded-2xl border-slate-200 p-3 shadow-2xl">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {config.formats.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => updateSelection({ formatId: item.id })}
                        className={cn(
                          "rounded-xl border p-3 text-left transition",
                          item.id === selection.formatId
                            ? "border-blue-400 bg-blue-50 text-blue-950"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:bg-blue-50/60",
                        )}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold">
                            {item.label}
                          </span>
                          {item.id === selection.formatId && (
                            <Check className="h-4 w-4 text-blue-600" />
                          )}
                        </span>
                        <span className="mt-1 block text-xs text-slate-500">
                          {item.helper}
                        </span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="grid min-h-14 grid-cols-[72px_1fr_auto] overflow-hidden rounded-xl border border-slate-200 bg-white text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50/50"
                  >
                    <span className="flex items-center justify-center border-r border-slate-100 bg-blue-50/70 text-blue-700">
                      <Cpu className="h-7 w-7" />
                    </span>
                    <span className="min-w-0 px-4 py-3">
                      <span className="block text-sm font-medium text-blue-900/70">
                        Agent
                      </span>
                      <span className="block truncate text-base font-semibold text-slate-950">
                        {agent.label}
                      </span>
                    </span>
                    <span className="flex items-center pr-4 text-blue-900">
                      <ChevronDown className="h-4 w-4" />
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  className="w-[min(390px,calc(100vw-2rem))] rounded-2xl border-slate-200 p-2 shadow-2xl"
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
                            ? "bg-blue-50 text-blue-950"
                            : "hover:bg-slate-50",
                        )}
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-700">
                          <Cpu className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2 text-sm font-semibold">
                            {item.label}
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                              {item.speed}
                            </span>
                          </span>
                          <span className="mt-0.5 block text-xs text-slate-500">
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
                className="h-14 w-14 rounded-xl bg-blue-600 text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700"
                aria-label="Submit workflow"
              >
                <ArrowUp className="h-6 w-6" />
              </Button>
            </div>
            {topicOpen && (
              <div className="mt-4 rounded-2xl border border-blue-100 bg-blue-50/40 p-3">
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
                      <div className="text-sm font-semibold text-slate-950">
                        {config.inputLabel}
                      </div>
                      <div className="text-xs text-slate-500">
                        This picker becomes the primary prompt for{" "}
                        {config.label.toLowerCase()}.
                      </div>
                    </div>
                  </div>
                  <Textarea
                    value={selection.value}
                    onChange={(event) =>
                      updateSelection({ value: event.target.value })
                    }
                    placeholder={config.placeholder}
                    autoGrow
                    minHeight={112}
                    maxHeight={220}
                    className="text-base"
                  />
                  <div className="flex flex-wrap gap-2">
                    {[
                      config.sample,
                      "Patient-friendly overview",
                      "Expert debate",
                    ].map((sample) => (
                      <button
                        key={sample}
                        type="button"
                        onClick={() => updateSelection({ value: sample })}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-700"
                      >
                        {sample}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-12 text-center text-lg font-semibold text-blue-950/80">
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
                    "flex h-36 w-32 flex-col items-center justify-center gap-4 rounded-xl border bg-white text-slate-950 shadow-sm transition hover:-translate-y-1 hover:border-blue-300 hover:shadow-lg",
                    index % 2 === 0 ? "rotate-[-2deg]" : "rotate-[1.5deg]",
                    active &&
                      "border-blue-400 shadow-[0_20px_50px_rgba(37,99,235,0.18)] ring-2 ring-blue-200",
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
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => handleWorkflowSelect("research")}
            className="mt-9 inline-flex items-center gap-2 text-base font-semibold text-blue-950/80 transition hover:text-blue-700"
          >
            ...or start from scratch
            <ArrowRight className="h-5 w-5 text-blue-600" />
          </button>
        </section>

        <section className="mt-10 border-t border-slate-200 pt-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap items-center gap-4 sm:gap-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    className={cn(
                      "relative flex h-10 items-center gap-2 text-sm font-medium transition",
                      item.active
                        ? "text-blue-600"
                        : "text-blue-950/75 hover:text-blue-700",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                    {item.active && (
                      <span className="absolute inset-x-0 -bottom-3 h-0.5 rounded-full bg-blue-600" />
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <div className="flex h-10 w-full min-w-[220px] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-500 shadow-sm lg:w-64">
                <Search className="h-4 w-4" />
                Search
              </div>
              <button
                type="button"
                className="hidden h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-blue-950 shadow-sm sm:flex"
                aria-label="Favorites"
              >
                <Star className="h-5 w-5" />
              </button>
              <div className="hidden items-center rounded-lg border border-slate-200 bg-white p-1 shadow-sm sm:flex">
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600"
                  aria-label="Grid view"
                >
                  <Grid2X2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-blue-950"
                  aria-label="List view"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-5 flex w-full max-w-xl items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex h-16 w-24 items-center justify-center bg-blue-50 text-blue-700">
              <BookOpen className="h-8 w-8" />
            </div>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 px-5">
              <span className="truncate text-base font-semibold text-slate-950">
                Learn about AI Matrx
              </span>
              <span className="hidden shrink-0 items-center gap-1 text-sm font-semibold text-blue-600 sm:inline-flex">
                Quick start guide
                <ArrowRight className="h-4 w-4" />
              </span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
