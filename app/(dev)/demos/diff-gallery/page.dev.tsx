"use client";

/**
 * DEV: Diff Gallery — every diff/comparison renderer in the app, side by side,
 * against the SAME input, so you can judge which is best. Canonical (the
 * components/diff system) vs legacy/other implementations. Heavy editor/Redux-
 * coupled ones that can't render standalone are listed with their live routes at
 * the bottom.
 *
 * Route: /demos/diff-gallery
 */

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Canonical family
import { DiffViewer } from "@/components/diff/DiffViewer";
import { DiffReview } from "@/components/diff/DiffReview";
import { CodeDiff } from "@/components/diff/code/CodeDiff";
import { InlineTextDiff } from "@/components/diff/adapters/InlineTextDiff";
import { AnimatedDiffReveal } from "@/components/diff/text/AnimatedDiffReveal";
import { RawJsonView } from "@/components/diff/views/RawJsonView";
import { DiffBlock } from "@/components/mardown-display/blocks/diff/DiffBlock";
// Structured entity shell (object-shaped)
import { NoteDiffViewer } from "@/features/notes/components/diff/NoteDiffViewer";
// Legacy utils — rendered faithfully below
import { generateUnifiedDiff } from "@/features/code-editor/utils/generateDiff";
import { analyzeDiff } from "@/features/notes/utils/diffAnalysis";

// ── Scenarios ────────────────────────────────────────────────────────────────

interface Scenario {
  id: string;
  label: string;
  language: string;
  original: string;
  modified: string;
}

const SCENARIOS: Scenario[] = [
  {
    id: "prose",
    label: "Prose",
    language: "markdown",
    original:
      "You are a helpful assistant.\nAlways answer concisely and cite sources.\nNever fabricate facts.\nBe polite.",
    modified:
      "You are a concise, helpful assistant.\nAlways answer clearly and cite reputable sources.\nNever fabricate facts.\nBe warm and polite.",
  },
  {
    id: "markdown",
    label: "Markdown",
    language: "markdown",
    original: "# Title\n\n- one\n- two\n- three\n\nSome intro text here.",
    modified:
      "# Title (v2)\n\n- one\n- two changed\n- three\n- four\n\nSome updated intro text here.",
  },
  {
    id: "code",
    label: "Code",
    language: "typescript",
    original:
      "function add(a: number, b: number) {\n  return a + b;\n}\n\nconst x = add(1, 2);",
    modified:
      "function add(a: number, b: number): number {\n  // guard NaN\n  if (Number.isNaN(a)) return b;\n  return a + b;\n}\n\nconst x = add(1, 2);\nconsole.log(x);",
  },
  {
    id: "json",
    label: "JSON",
    language: "json",
    original:
      '{\n  "name": "Widget",\n  "price": 9.99,\n  "tags": ["a", "b"],\n  "active": true\n}',
    modified:
      '{\n  "name": "Widget Pro",\n  "price": 12.5,\n  "tags": ["a", "b", "c"],\n  "active": true,\n  "sku": "WP-01"\n}',
  },
];

// ── Faithful legacy renderers (so the visual comparison is honest) ───────────

/** Legacy A1 — generateUnifiedDiff: whole-line red/green, line-level only. */
function LegacyUnifiedDiff({ a, b }: { a: string; b: string }) {
  const { lines } = generateUnifiedDiff(a, b);
  return (
    <div className="h-full overflow-auto font-mono text-xs leading-relaxed">
      {lines.map((l, i) => (
        <div
          key={i}
          className={cn(
            "flex",
            l.type === "added" && "bg-green-100 dark:bg-green-900/40",
            l.type === "removed" && "bg-red-100 dark:bg-red-900/40",
          )}
        >
          <span className="w-8 shrink-0 select-none pr-2 text-right text-muted-foreground/50">
            {l.lineNumber ?? ""}
          </span>
          <span className="w-4 shrink-0 select-none text-center">
            {l.type === "added" ? "+" : l.type === "removed" ? "-" : ""}
          </span>
          <span className="flex-1 whitespace-pre-wrap break-words">
            {l.content || " "}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Legacy A3 — analyzeDiff segments: run-level spans, removals struck through. */
function LegacyAnalyzeDiff({ a, b }: { a: string; b: string }) {
  const { segments } = analyzeDiff(a, b);
  return (
    <div className="h-full overflow-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
      {segments.map((seg, i) => (
        <span
          key={i}
          className={cn(
            seg.type === "added" &&
              "bg-green-500/15 text-green-700 dark:text-green-300",
            seg.type === "removed" &&
              "bg-red-500/15 text-red-700 line-through dark:text-red-300",
            seg.type === "unchanged" && "text-foreground/70",
          )}
        >
          {seg.type === "added" && "+ "}
          {seg.type === "removed" && "- "}
          {seg.content}
          {"\n"}
        </span>
      ))}
    </div>
  );
}

// ── Per-card error isolation — one bad renderer can't kill the page ─────────

class CardBoundary extends React.Component<
  { children: React.ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(err: unknown) {
    return { error: err instanceof Error ? err.message : "Render failed" };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center p-3 text-center text-xs text-destructive">
          Failed to render: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

function Badge({ tone, children }: { tone: "canonical" | "legacy" | "heavy"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone === "canonical" &&
          "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
        tone === "legacy" && "bg-amber-500/15 text-amber-600 dark:text-amber-400",
        tone === "heavy" && "bg-sky-500/15 text-sky-600 dark:text-sky-400",
      )}
    >
      {children}
    </span>
  );
}

function Card({
  title,
  tone,
  verdict,
  route,
  children,
  tall,
}: {
  title: string;
  tone: "canonical" | "legacy" | "heavy";
  verdict: string;
  route?: { href: string; label: string };
  children: React.ReactNode;
  tall?: boolean;
}) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <div className="shrink-0 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{title}</span>
          <Badge tone={tone}>{tone}</Badge>
          {route && (
            <a
              href={route.href}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-[11px] text-primary underline-offset-2 hover:underline"
            >
              {route.label} ↗
            </a>
          )}
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{verdict}</p>
      </div>
      <div className={cn("min-h-0", tall ? "h-[440px]" : "h-[300px]")}>
        <CardBoundary>{children}</CardBoundary>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DiffGalleryPage() {
  const [scenarioId, setScenarioId] = useState("markdown");
  const scenario =
    SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0];
  const [original, setOriginal] = useState(scenario.original);
  const [modified, setModified] = useState(scenario.modified);
  const [language, setLanguage] = useState(scenario.language);
  const [animKey, setAnimKey] = useState(0);
  const [animActive, setAnimActive] = useState(false);

  const loadScenario = (s: Scenario) => {
    setScenarioId(s.id);
    setOriginal(s.original);
    setModified(s.modified);
    setLanguage(s.language);
  };

  // RawJsonView / structured shells want objects.
  const [jsonOld, jsonNew] = useMemo(() => {
    const parse = (s: string): unknown => {
      try {
        return JSON.parse(s);
      } catch {
        return { text: s };
      }
    };
    return [parse(original), parse(modified)];
  }, [original, modified]);

  const diffBlockContent = useMemo(
    () => JSON.stringify({ old: original, new: modified, split: true }),
    [original, modified],
  );

  return (
    <div className="flex h-[calc(100dvh-var(--header-height))] flex-col overflow-hidden bg-textured">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-4 py-2">
        <h1 className="text-sm font-semibold">
          Diff Gallery — every diff renderer, same input
        </h1>
        <p className="text-xs text-muted-foreground">
          Canonical <code>components/diff</code> system vs legacy/other
          implementations. Change the input below; every card updates. Pick the
          one that reads best to you.
        </p>
      </div>

      {/* Scenario + inputs */}
      <div className="shrink-0 border-b border-border px-4 py-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {SCENARIOS.map((s) => (
            <Button
              key={s.id}
              size="sm"
              variant={s.id === scenarioId ? "default" : "outline"}
              className="h-7 text-xs"
              onClick={() => loadScenario(s)}
            >
              {s.label}
            </Button>
          ))}
          <label className="ml-2 flex items-center gap-1 text-xs">
            Language
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-28 rounded border border-border bg-background px-1 py-0.5"
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <textarea
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            spellCheck={false}
            className="h-20 w-full resize-none rounded border border-border bg-background p-2 font-mono text-xs outline-none"
            placeholder="Original / Before"
          />
          <textarea
            value={modified}
            onChange={(e) => setModified(e.target.value)}
            spellCheck={false}
            className="h-20 w-full resize-none rounded border border-border bg-background p-2 font-mono text-xs outline-none"
            placeholder="Modified / After"
          />
        </div>
      </div>

      {/* Gallery */}
      <div className="min-h-0 flex-1 overflow-auto p-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card
            title="DiffViewer — light (THE canonical core)"
            tone="canonical"
            verdict="Word-level highlighting, split/inline/highlight toggle, Swap. The default for text/markdown. Recommended."
            route={{ href: "/demos/diff", label: "/demos/diff" }}
          >
            <DiffViewer
              original={original}
              modified={modified}
              engine="light"
              defaultView="split"
              originalLabel="Before"
              modifiedLabel="After"
            />
          </Card>

          <Card
            title="DiffReview — per-hunk merge (NEW)"
            tone="canonical"
            verdict="The only one that MERGES: accept/reject each hunk → apply the result. Turns compare into an editing tool."
            route={{ href: "/demos/diff", label: "/demos/diff (toggle review)" }}
          >
            <DiffReview
              original={original}
              modified={modified}
              originalLabel="Before"
              modifiedLabel="After"
              onApply={(merged) =>
                toast.success("Merged", {
                  description: `${merged.split("\n").length} lines`,
                })
              }
            />
          </Card>

          <Card
            title="DiffViewer — Monaco (canonical heavy)"
            tone="canonical"
            verdict="Full VS Code diff engine for code / very large inputs. Syntax highlighting; engine='auto' picks this for code langs."
            route={{ href: "/demos/diff", label: "/demos/diff" }}
          >
            <DiffViewer
              original={original}
              modified={modified}
              engine="monaco"
              language={language}
              defaultView="split"
              originalLabel="Before"
              modifiedLabel="After"
            />
          </Card>

          <Card
            title="CodeDiff (Monaco core, direct)"
            tone="canonical"
            verdict="Same Monaco engine DiffViewer uses under engine='monaco'. Import directly when you always want Monaco."
          >
            <CodeDiff
              original={original}
              modified={modified}
              language={language}
              view="split"
              showLabels
              originalLabel="Before"
              modifiedLabel="After"
            />
          </Card>

          <Card
            title="InlineTextDiff (compact, chrome-less)"
            tone="canonical"
            verdict="Self-sizing, no toolbar. Same engine + colors; for grid rows / markdown blocks. Powers the ```diff block."
            route={{
              href: "/demos/blocks/visual-blocks",
              label: "/demos/blocks/visual-blocks",
            }}
          >
            <div className="h-full overflow-auto p-2">
              <InlineTextDiff original={original} modified={modified} view="split" />
            </div>
          </Card>

          <Card
            title="DiffBlock (markdown ```diff render block)"
            tone="canonical"
            verdict="Agent-emittable JSON {old,new} block → InlineTextDiff, with its own card chrome + split/copy."
            route={{
              href: "/demos/blocks/visual-blocks",
              label: "/demos/blocks/visual-blocks",
            }}
          >
            <div className="h-full overflow-auto p-2">
              <DiffBlock content={diffBlockContent} />
            </div>
          </Card>

          <Card
            title="AnimatedDiffReveal (single-pane reader)"
            tone="canonical"
            verdict="One-pane 'after' with changes revealed; animates a known before→after. For agent patch playback, not review."
            route={{
              href: "/demos/tool-viz/result-fields",
              label: "/demos/tool-viz/result-fields",
            }}
          >
            <div className="flex h-full flex-col">
              <div className="shrink-0 border-b border-border px-2 py-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-xs"
                  onClick={() => {
                    setAnimActive(true);
                    setAnimKey((k) => k + 1);
                  }}
                >
                  ▶ Replay animation
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-auto p-2">
                <AnimatedDiffReveal
                  before={original}
                  after={modified}
                  reveal={{ active: animActive, replayKey: animKey }}
                />
              </div>
            </div>
          </Card>

          <Card
            title="RawJsonView (structured JSON, Monaco)"
            tone="canonical"
            verdict="JSON.stringifies both objects → CodeDiff(json). The 'JSON' tab of the structured entity shell."
            route={{ href: "/agents/compare", label: "/agents/compare" }}
          >
            <RawJsonView
              oldValue={jsonOld}
              newValue={jsonNew}
              oldLabel="Before"
              newLabel="After"
            />
          </Card>

          <Card
            title="NoteDiffViewer (structured entity shell)"
            tone="canonical"
            verdict="Field-by-field object diff (All/Changes/Summary/JSON tabs). For whole records, not raw text; long text fields use the light engine."
            route={{ href: "/notes/[id]/diff", label: "/notes/[id]/diff" }}
          >
            <div className="h-full overflow-auto">
              <NoteDiffViewer
                oldNote={{ title: "Sample", content: original }}
                newNote={{ title: "Sample", content: modified }}
                oldLabel="Before"
                newLabel="After"
              />
            </div>
          </Card>

          <Card
            title="Legacy A1 — generateUnifiedDiff"
            tone="legacy"
            verdict="Hand-rolled LCS, whole-line red/green, NO word-level, no view options. What the canonical engine replaced. (Still used by a few code-editor consumers.)"
          >
            <div className="h-full p-2">
              <LegacyUnifiedDiff a={original} b={modified} />
            </div>
          </Card>

          <Card
            title="Legacy A3 — diffAnalysis segments"
            tone="legacy"
            verdict="Run-level segment spans, removals struck through, no word-level. Was the note-conflict diff before the canonical swap."
          >
            <div className="h-full p-2">
              <LegacyAnalyzeDiff a={original} b={modified} />
            </div>
          </Card>
        </div>

        {/* Coupled renderers — can't render standalone; go see them live */}
        <div className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">
            Coupled renderers — can’t render standalone (editor / Redux / tool
            state). See them live:
          </h2>
          <div className="mt-3 grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
            {[
              {
                name: "TabDiffView — Monaco per-hunk accept/reject",
                note: "The other 'merge' UI (vs DiffReview). Reads pending agent patches for a code tab.",
                route: "/code",
                how: "Open a file, have the agent propose SEARCH/REPLACE edits — the tab swaps to this.",
              },
              {
                name: "TripleDiffView — Monaco 3-way",
                note: "Before↔After and After↔Current stacked. Code AI edit-history 'triple view'.",
                route: "/code",
                how: "Open the code AI edit-history / triple view tab.",
              },
              {
                name: "SearchReplaceDiffRenderer — live chat ```diff",
                note: "Streaming SEARCH/REPLACE fence; complete state uses the canonical DiffView.",
                route: "/chat",
                how: "Ask an agent to edit code; it emits a ```diff fence.",
              },
              {
                name: "AgentDiffViewer — structured agent diff",
                note: "Whole-agent field-by-field diff (All/Changes/Summary/JSON).",
                route: "/agents/compare",
                how: "Compare two agents or open a version diff.",
              },
              {
                name: "PatchDiffInline — tool-call patch card",
                note: "ctx_patch working-doc patch inside a tool card (wraps AnimatedDiffReveal).",
                route: "/demos/tool-viz/result-fields",
                how: "The ctx_patch fixtures render it live.",
              },
              {
                name: "VersionDiffView — get_version_diff fields",
                note: "Field diff on the versioning RPC shape. Built but currently unmounted (no live route).",
                route: "",
                how: "No direct route today.",
              },
            ].map((r) => (
              <div
                key={r.name}
                className="rounded border border-border/60 bg-muted/20 p-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium">{r.name}</span>
                  <Badge tone="heavy">coupled</Badge>
                  {r.route && (
                    <a
                      href={r.route}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-auto text-primary underline-offset-2 hover:underline"
                    >
                      {r.route} ↗
                    </a>
                  )}
                </div>
                <p className="mt-0.5 text-muted-foreground">{r.note}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground/80">
                  How to reach: {r.how}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
