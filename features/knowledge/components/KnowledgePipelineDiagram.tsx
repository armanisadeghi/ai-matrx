"use client";

import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  AudioLines,
  Globe,
  Share2,
  Files,
  Plug,
  ArrowDown,
  Wand2,
  Sparkles,
  GitBranch,
  ShieldCheck,
  Database,
  Search,
  Network,
  ScanText,
  Layers,
  Gauge,
  Workflow,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * KnowledgePipelineDiagram
 *
 * A responsive, theme-aware, lightly-interactive rebuild of
 * `docs/knowledge/visuals/matrx_knowledge_system_full.svg`. Instead of a fixed
 * 1040×1060 raster-ish SVG, the seven phases are HTML bands that reflow on
 * mobile, respect light/dark tokens, and let a visitor click a phase to focus
 * it (dimming the rest) so the "source → knowledge → answer" story reads at a
 * glance. The Agent Fabric becomes a side rail on desktop and a stacked banner
 * on mobile — matching the original's "attach at any node" message.
 *
 * Everything here describes what the system actually does; the copy is grounded
 * in real surfaces (`/files`, `/rag/library`, `/agents`, `/knowledge-graph`,
 * `/rag/search`). See `features/knowledge/FEATURE.md`.
 */

type Tone = "flow" | "hub" | "gate" | "ask";

interface Phase {
  id: string;
  badge: string;
  title: string;
  blurb: string;
  chips: string[];
  tone: Tone;
  icon: LucideIcon;
}

const SOURCES: { label: string; icon: LucideIcon }[] = [
  { label: "PDF · scans", icon: FileText },
  { label: "audio · video", icon: AudioLines },
  { label: "web scrape", icon: Globe },
  { label: "social", icon: Share2 },
  { label: "native files", icon: Files },
  { label: "API feeds", icon: Plug },
];

const PHASES: Phase[] = [
  {
    id: "acquire",
    badge: "1 · 2",
    title: "Acquire + Convert",
    blurb:
      "Pull the source in and stamp its origin lineage, then turn it into raw text — PDF parse, transcribe, OCR, scrape-extract.",
    chips: [
      "origin lineage",
      "PDF parse",
      "transcribe",
      "OCR",
      "→ raw text (messy)",
    ],
    tone: "flow",
    icon: Wand2,
  },
  {
    id: "clean",
    badge: "3",
    title: "Clean — earn quality",
    blurb:
      "Two tiers. Tier A does a generic clean (fix OCR, restore structure, label speakers). Tier B runs a known-type agent that applies your org rules and emits structured JSON.",
    chips: ["Tier A · generic clean", "Tier B · org rules → JSON"],
    tone: "flow",
    icon: Sparkles,
  },
  {
    id: "enrich",
    badge: "4",
    title: "Enrich + branch",
    blurb:
      "Validate against the world and your known data, then fan one source out into many filtered derivatives.",
    chips: ["fact-check", "refine", "branch ⤴"],
    tone: "flow",
    icon: GitBranch,
  },
  {
    id: "gate",
    badge: "→",
    title: "Ingestion gate · sources only",
    blurb:
      "Nothing becomes knowledge until it passes the gate. Only admitted sources enter the hub — everything inside is retained, versioned, and traceable.",
    chips: ["admit", "reject", "version on entry"],
    tone: "gate",
    icon: ShieldCheck,
  },
  {
    id: "hub",
    badge: "5",
    title: "Knowledge Hub",
    blurb:
      "Admitted knowledge — retained, versioned, traceable. The same source is held in many representations and described by NER, scopes, trust, and lineage. It can reprocess and derive, then return to the hub.",
    chips: [
      "text",
      "chunks",
      "vectors",
      "summaries",
      "schemas",
      "indices",
      "scoped",
    ],
    tone: "hub",
    icon: Database,
  },
  {
    id: "retrieve",
    badge: "6 · 7",
    title: "Retrieve",
    blurb:
      "Semantic + structural + trust-weighted retrieval. Pick the best source for the job and drill down to provenance.",
    chips: ["semantic", "structural", "trust-weighted", "drill to source"],
    tone: "flow",
    icon: Search,
  },
  {
    id: "ask",
    badge: "★",
    title: "The Ask — what it's all for",
    blurb:
      "An agent resolves a real question end-to-end: structural filter → semantic search → pull canonical → verify each fact to its provenance root → apply a skill → return a cited, accurate, traceable answer.",
    chips: ["cited", "accurate", "traceable"],
    tone: "ask",
    icon: ShieldCheck,
  },
];

const HUB_FACETS: { title: string; sub: string; icon: LucideIcon }[] = [
  { title: "NER", sub: "entities + concepts", icon: ScanText },
  { title: "Scopes", sub: "type → scope → item → value", icon: Layers },
  { title: "Trust", sub: "quality vector · 6 dims", icon: Gauge },
  { title: "Lineage", sub: "DAG · root ↔ canonical", icon: Network },
];

const FABRIC_FORMS = [
  "chatbot",
  "button",
  "form",
  "app",
  "automation",
  "scheduled job",
  "MCP egress →",
];

const toneRing: Record<Tone, string> = {
  flow: "border-primary/30",
  hub: "border-secondary/50",
  gate: "border-warning/50",
  ask: "border-warning/60",
};

const toneBadge: Record<Tone, string> = {
  flow: "bg-primary/10 text-primary border-primary/20",
  hub: "bg-secondary/10 text-secondary border-secondary/20",
  gate: "bg-warning/10 text-warning border-warning/20",
  ask: "bg-warning/10 text-warning border-warning/20",
};

const toneIconTile: Record<Tone, string> = {
  flow: "bg-primary/10 text-primary",
  hub: "bg-secondary/10 text-secondary",
  gate: "bg-warning/10 text-warning",
  ask: "bg-warning/10 text-warning",
};

export function KnowledgePipelineDiagram() {
  const [focused, setFocused] = useState<string | null>(null);

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 lg:gap-6">
        {/* Main flow column */}
        <div className="min-w-0">
          {/* Sources */}
          <div className="rounded-2xl border border-border bg-card/60 p-4 sm:p-5">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
              Sources
            </p>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <span
                  key={s.label}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2.5 py-1.5 text-xs font-medium text-foreground"
                >
                  <s.icon className="h-3.5 w-3.5 text-muted-foreground" />
                  {s.label}
                </span>
              ))}
            </div>
          </div>

          <FlowArrow />

          {/* Phases */}
          <div className="space-y-0">
            {PHASES.map((phase, i) => {
              const isFocused = focused === phase.id;
              const dimmed = focused != null && !isFocused;
              return (
                <div key={phase.id}>
                  <button
                    type="button"
                    onClick={() => setFocused(isFocused ? null : phase.id)}
                    aria-pressed={isFocused}
                    className={cn(
                      "group w-full text-left rounded-2xl border bg-card p-4 sm:p-5 transition-all duration-300",
                      "hover:shadow-lg hover:shadow-primary/5",
                      toneRing[phase.tone],
                      isFocused &&
                        "ring-2 ring-primary/40 shadow-lg shadow-primary/5",
                      dimmed && "opacity-55",
                      phase.tone === "hub" && "bg-secondary/[0.04]",
                      phase.tone === "ask" && "bg-warning/[0.04]",
                    )}
                  >
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
                          toneIconTile[phase.tone],
                        )}
                      >
                        <phase.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold",
                              toneBadge[phase.tone],
                            )}
                          >
                            {phase.badge}
                          </span>
                          <h3
                            className={cn(
                              "font-semibold tracking-tight",
                              phase.tone === "hub" || phase.tone === "ask"
                                ? "text-base sm:text-lg"
                                : "text-sm sm:text-base",
                            )}
                          >
                            {phase.title}
                          </h3>
                          <ChevronDown
                            className={cn(
                              "h-4 w-4 ml-auto text-muted-foreground transition-transform duration-300",
                              isFocused && "rotate-180",
                            )}
                          />
                        </div>
                        <p
                          className={cn(
                            "mt-1.5 text-sm text-muted-foreground leading-relaxed transition-all",
                            !isFocused && "line-clamp-2 sm:line-clamp-none",
                          )}
                        >
                          {phase.blurb}
                        </p>

                        {/* Representation chips (hub gets the full grid) */}
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {phase.chips.map((c) => (
                            <span
                              key={c}
                              className="inline-flex items-center rounded-md border border-border bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {c}
                            </span>
                          ))}
                        </div>

                        {/* Hub facets */}
                        {phase.tone === "hub" && (
                          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {HUB_FACETS.map((f) => (
                              <div
                                key={f.title}
                                className="rounded-xl border border-secondary/20 bg-card p-2.5"
                              >
                                <div className="flex items-center gap-1.5">
                                  <f.icon className="h-3.5 w-3.5 text-secondary" />
                                  <span className="text-xs font-semibold">
                                    {f.title}
                                  </span>
                                </div>
                                <p className="mt-0.5 text-[10px] text-muted-foreground leading-snug">
                                  {f.sub}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                  {i < PHASES.length - 1 && (
                    <FlowArrow
                      label={
                        phase.id === "enrich" ? "ingestion gate" : undefined
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Agent Fabric rail */}
        <aside className="lg:w-56">
          <div className="lg:sticky lg:top-4 rounded-2xl border border-secondary/40 bg-secondary/[0.05] p-4 sm:p-5 h-full">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-secondary/10 text-secondary">
                <Workflow className="h-4 w-4" />
              </div>
              <h3 className="text-sm font-bold tracking-tight text-secondary">
                Agent Fabric
              </h3>
            </div>
            <p className="mt-3 text-xs text-muted-foreground leading-relaxed">
              Attach an agent at{" "}
              <span className="font-medium text-foreground">
                any node or edge
              </span>{" "}
              of the pipeline. The same agent can take the shape of:
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {FABRIC_FORMS.map((f) => (
                <span
                  key={f}
                  className="inline-flex items-center rounded-md border border-secondary/20 bg-card px-2 py-0.5 text-[11px] text-secondary"
                >
                  {f}
                </span>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              Overlays every stage — clean, enrich, retrieve, and answer. The
              attorney&apos;s agent in the worked example runs right here.
            </p>
          </div>
        </aside>
      </div>

      <p className="mt-4 text-center text-xs text-muted-foreground">
        Tap any phase to focus it. Phases 1–7 flow top to bottom · the agent
        fabric overlays every stage.
      </p>
    </div>
  );
}

function FlowArrow({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-2">
      <ArrowDown className="h-4 w-4 text-muted-foreground/60" />
      {label && (
        <span className="rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
          {label}
        </span>
      )}
    </div>
  );
}

export default KnowledgePipelineDiagram;
