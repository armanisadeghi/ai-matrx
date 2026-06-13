import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Brain,
  ArrowRight,
  Upload,
  Wand2,
  ScanText,
  Network,
  Search,
  Bot,
  Swords,
  NotebookPen,
  ShieldCheck,
  GitBranch,
  Layers,
  CheckCircle2,
  Circle,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { KnowledgePipelineDiagram } from "./KnowledgePipelineDiagram";

/**
 * KnowledgeShowcasePage — `/knowledge`
 *
 * An informational (not sales-pitch) showcase of the Matrx Knowledge System.
 * Built around the rebuilt pipeline diagram and grounded entirely in surfaces
 * that exist today. Where the guided "concept walkthrough" references something
 * not yet built, it is labelled honestly. The full vision + truthful built/
 * missing map lives in `features/knowledge/FEATURE.md`.
 */

interface Capability {
  icon: LucideIcon;
  title: string;
  description: string;
  href?: string;
  hrefLabel?: string;
}

const CAPABILITIES: Capability[] = [
  {
    icon: Upload,
    title: "Bring any source",
    description:
      "PDFs, scans, audio, video, web pages, native files. They upload into your file system and get an origin lineage stamp the moment they arrive.",
    href: "/files",
    hrefLabel: "Files",
  },
  {
    icon: Wand2,
    title: "A real extraction pipeline",
    description:
      "Extract → clean → chunk → embed, run per-stage or as one streamed job. Watch the original PDF, raw text, cleaned markdown, and chunks side by side in a 4-pane viewer.",
    href: "/rag/library",
    hrefLabel: "Library",
  },
  {
    icon: Layers,
    title: "Many representations, one source",
    description:
      "The same document is held as text, chunks, vectors, summaries, schemas, and indices — each scoped to who's allowed to see it, all tracing back to the original.",
    href: "/rag/data-stores",
    hrefLabel: "Data stores",
  },
  {
    icon: ScanText,
    title: "Entities + a knowledge graph",
    description:
      "NER lifts entities and concepts out of your sources and connects them. Explore the graph, click a node, and jump to the exact evidence that put it there.",
    href: "/knowledge-graph",
    hrefLabel: "Knowledge graph",
  },
  {
    icon: Search,
    title: "Retrieval you can trust",
    description:
      "Semantic + structural + trust-weighted search in a multi-tab Search Lab. Every hit drills down to its provenance — no black-box answers.",
    href: "/rag/search",
    hrefLabel: "Search Lab",
  },
  {
    icon: Bot,
    title: "Agents on every node",
    description:
      "Attach an agent anywhere in the pipeline — as a chatbot, a button, a form, an app, or an automation. The same agent reshapes to the job.",
    href: "/agents",
    hrefLabel: "Agents",
  },
];

interface WorkedStep {
  n: string;
  text: string;
}

const WORKED_STEPS: WorkedStep[] = [
  { n: "1", text: "Structural filter → case #123456 · Dr. Smith" },
  { n: "2", text: "Semantic search → 'AMA deviations' · 'prior injuries'" },
  { n: "3", text: "Pull canonical → medical reports (JSON) + AMA guide" },
  { n: "4", text: "Verify → trace each fact to its provenance root" },
  { n: "5", text: "Apply skill → 'how to depose a doctor'" },
];

type StepState = "built" | "partial" | "planned";

interface WalkthroughStep {
  n: number;
  title: string;
  description: string;
  state: StepState;
  href?: string;
}

const WALKTHROUGH: WalkthroughStep[] = [
  {
    n: 1,
    title: "Upload a PDF and a CSV",
    description:
      "Drop both into your files. The PDF feeds the knowledge pipeline; CSV-as-knowledge ingest is still being built.",
    state: "partial",
    href: "/files",
  },
  {
    n: 2,
    title: "Run extraction",
    description:
      "Send the PDF through extract → clean → chunk → embed and watch it in the 4-pane viewer.",
    state: "built",
    href: "/rag/library",
  },
  {
    n: 3,
    title: "Build a specialist agent",
    description:
      "Create a custom agent that pulls a specific piece of data out of the document.",
    state: "built",
    href: "/agents/new",
  },
  {
    n: 4,
    title: "Run, inspect, fix, re-test",
    description:
      "Run the agent, see the result, edit the agent to fix issues, run again, finalize.",
    state: "built",
    href: "/agents",
  },
  {
    n: 5,
    title: "Agent battle",
    description:
      "Race several models side by side — fast + cheap vs. slow + expensive + better — in the comparison arena.",
    state: "built",
    href: "/agents/battle",
  },
  {
    n: 6,
    title: "Automate the extraction",
    description:
      "Uploaded files auto-schedule for RAG (≈5 min after arrival). Toggle “Process for RAG immediately” in the New menu to skip the wait, or trigger/refresh any file on demand.",
    state: "built",
    href: "/files",
  },
  {
    n: 7,
    title: "Upload again, watch it run",
    description:
      "Drop a new document and watch its RAG lifecycle move scheduled → running → indexed right on the file — no manual step required.",
    state: "built",
    href: "/files",
  },
  {
    n: 8,
    title: "Chat, then save a Note",
    description:
      "Ask a chat agent a question, then save the answer straight into Notes.",
    state: "built",
    href: "/chat",
  },
  {
    n: 9,
    title: "Edit the note",
    description: "Clean it up and make it better in the notes editor.",
    state: "built",
    href: "/notes",
  },
  {
    n: 10,
    title: "Trigger RAG / NER",
    description:
      "Process the note for RAG, then hit “Run NER now” right in the note toolbar — entities lift out on demand instead of waiting for the backend batch.",
    state: "built",
    href: "/notes",
  },
  {
    n: 11,
    title: "Visualize the graph",
    description:
      "Open the knowledge graph and see entities and relationships light up.",
    state: "built",
    href: "/knowledge-graph",
  },
  {
    n: 12,
    title: "Manual search",
    description:
      "Run a manual retrieval to confirm you can pull good data back out.",
    state: "built",
    href: "/rag/search",
  },
  {
    n: 13,
    title: "Build your badass agent",
    description: "Create a top-tier agent wired to your knowledge base.",
    state: "built",
    href: "/agents/new",
  },
  {
    n: 14,
    title: "Ask the hard question",
    description:
      "Pose a deep, industry-knowledge question and watch the agent hit your RAG, reason, and answer like a pro — cited and traceable.",
    state: "built",
    href: "/rag/search",
  },
];

const STATE_META: Record<
  StepState,
  { label: string; cls: string; Icon: LucideIcon }
> = {
  built: {
    label: "Live",
    cls: "bg-success/10 text-success border-success/20",
    Icon: CheckCircle2,
  },
  partial: {
    label: "Partial",
    cls: "bg-warning/10 text-warning border-warning/20",
    Icon: Circle,
  },
  planned: {
    label: "Coming",
    cls: "bg-muted text-muted-foreground border-border",
    Icon: Circle,
  },
};

export function KnowledgeShowcasePage() {
  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-secondary/5 via-transparent to-transparent"
        />
        <div
          aria-hidden
          className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-secondary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-3xl px-4 sm:px-6 pt-12 sm:pt-20 pb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/5 px-4 py-1.5 text-sm font-medium text-secondary mb-6">
            <Brain className="h-3.5 w-3.5" />
            The Matrx Knowledge System
          </div>
          <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.5rem)] font-bold tracking-tight text-foreground leading-[1.1]">
            Source{" "}
            <span className="bg-gradient-to-r from-secondary to-primary bg-clip-text text-transparent">
              → knowledge → answer
            </span>
            , one continuous system.
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.2rem)] text-muted-foreground leading-relaxed">
            Raw sources flow through a seven-phase pipeline, pass an ingestion
            gate, and become retained, versioned, traceable knowledge — held in
            many representations and described by entities, scopes, trust, and
            lineage. Agents attach anywhere along the way and turn it into
            cited, accurate answers.
          </p>
        </div>
      </section>

      {/* The pipeline diagram — the centerpiece */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12 sm:pb-16">
        <KnowledgePipelineDiagram />
      </section>

      {/* What it actually does */}
      <section className="bg-card/50 border-y border-border">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              What the system actually does
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
              Every capability below is a real surface you can open today.
              Follow the link to see it for yourself.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {CAPABILITIES.map((c) => (
              <div
                key={c.title}
                className={cn(
                  "group relative rounded-2xl border border-border bg-card p-6",
                  "transition-all duration-300",
                  "hover:border-secondary/30 hover:shadow-lg hover:shadow-secondary/5",
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10 text-secondary mb-4 group-hover:scale-110 transition-transform duration-300">
                  <c.icon className="h-5 w-5" />
                </div>
                <h3 className="text-base font-semibold mb-2">{c.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {c.description}
                </p>
                {c.href && (
                  <Link
                    href={c.href}
                    className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-secondary hover:underline"
                  >
                    {c.hrefLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Worked example — the ask */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-warning/20 bg-warning/5 px-3 py-1 text-xs font-medium text-warning mb-3">
            <ShieldCheck className="h-3 w-3" />
            The ask — what it&apos;s all for
          </div>
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            One question, resolved end-to-end
          </h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-warning/30 bg-warning/[0.04] p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-warning mb-3">
              Attorney → agent
            </p>
            <p className="text-base italic text-foreground leading-relaxed">
              &ldquo;Depose Dr. Smith tomorrow. Find where he didn&apos;t follow
              AMA guidelines for John Doe, case #123456, and flag prior injuries
              (preexisting conditions). Settle the case — hit hard, but get
              every fact right.&rdquo;
            </p>
            <div className="mt-5 rounded-xl border border-success/30 bg-success/10 p-4">
              <div className="flex items-center gap-2 text-success font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                Verified deposition brief
              </div>
              <p className="mt-1 text-sm text-success/90">
                cited · accurate · traceable
              </p>
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-card p-6">
            <p className="text-sm font-semibold mb-4">The agent resolves it:</p>
            <ol className="space-y-2.5">
              {WORKED_STEPS.map((s) => (
                <li
                  key={s.n}
                  className="flex items-start gap-3 rounded-lg border border-border bg-background/60 px-3 py-2.5"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-secondary/10 text-secondary text-xs font-bold">
                    {s.n}
                  </span>
                  <span className="text-sm text-muted-foreground leading-relaxed">
                    {s.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* Guided concept walkthrough — the vision */}
      <section className="bg-card/50 border-y border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-10 sm:mb-14">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-3">
              <ListChecks className="h-3 w-3" />
              Try it yourself — a guided run
            </div>
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              From a blank file to a pro-level answer
            </h2>
            <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
              An on-screen wizard walks you through the whole system using the
              real UI — not a fake demo. You do each step; the system makes
              something real happen. Tags show what&apos;s live today.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3 text-xs">
              <LegendDot stateLabel="Live" />
              <LegendDot stateLabel="Partial" />
              <LegendDot stateLabel="Coming" />
            </div>
          </div>

          <ol className="relative space-y-3">
            {WALKTHROUGH.map((step) => {
              const meta = STATE_META[step.state];
              const body = (
                <div
                  className={cn(
                    "flex items-start gap-4 rounded-2xl border border-border bg-card p-4 sm:p-5",
                    "transition-all duration-300",
                    step.href &&
                      "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
                  )}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm">
                    {step.n}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm sm:text-base">
                        {step.title}
                      </h3>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
                          meta.cls,
                        )}
                      >
                        {meta.label}
                      </span>
                      {step.href && (
                        <ArrowRight className="h-3.5 w-3.5 ml-auto text-muted-foreground" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={step.n}>
                  {step.href ? (
                    <Link href={step.href} className="block">
                      {body}
                    </Link>
                  ) : (
                    body
                  )}
                </li>
              );
            })}
          </ol>

          <div className="mt-8 rounded-2xl border border-dashed border-border bg-background/40 p-5 text-center">
            <p className="text-sm text-muted-foreground">
              <GitBranch className="inline h-4 w-4 mr-1.5 -mt-0.5 text-muted-foreground" />
              The guided wizard that drives you from page to page is on the
              roadmap. The capabilities it strings together are already real —
              this page links straight to each one.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            See the whole system in motion
          </h2>
          <p className="mt-4 text-muted-foreground text-lg mb-8">
            Start with a single document and follow it from source to a cited
            answer.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2"
              asChild
            >
              <Link href="/rag/library">
                Open the Library
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2"
              asChild
            >
              <Link href="/agents/battle">
                <Swords className="h-4 w-4" />
                Run an Agent Battle
              </Link>
            </Button>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <NotebookPen className="h-4 w-4" />
            <span>Save anything you find straight to Notes.</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function LegendDot({ stateLabel }: { stateLabel: string }) {
  const map: Record<string, string> = {
    Live: "bg-success",
    Partial: "bg-warning",
    Coming: "bg-muted-foreground/40",
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className={cn("h-2 w-2 rounded-full", map[stateLabel])} />
      {stateLabel}
    </span>
  );
}

export default KnowledgeShowcasePage;
