"use client";

/**
 * DEV demo for the canonical diff system (components/diff).
 * For understanding the system's power AND limits — not a marketing page.
 *
 * Route: /demos/diff
 */

import { useState } from "react";
import { toast } from "sonner";
import { DiffViewer, type DiffEngine } from "@/components/diff/DiffViewer";
import { DiffReview } from "@/components/diff/DiffReview";
import { useOpenDiffViewerWindow } from "@/features/overlays/openers/diffViewerWindow";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type View = "split" | "inline" | "highlight";

interface Scenario {
  id: string;
  label: string;
  note: string;
  original: string;
  modified: string;
  language?: string;
  engine?: DiffEngine;
}

const SCENARIOS: Scenario[] = [
  {
    id: "prose",
    label: "Prose edit (word-level)",
    note: "Light engine. Watch intra-line word highlighting on changed lines.",
    original:
      "You are a helpful assistant.\nAlways answer concisely and cite sources.\nNever fabricate facts.",
    modified:
      "You are a concise, helpful assistant.\nAlways answer clearly and cite reputable sources.\nNever fabricate facts.",
  },
  {
    id: "markdown",
    label: "Markdown blocks",
    note: "Diffs the raw markdown text — it does NOT diff rendered HTML.",
    original: "# Title\n\n- one\n- two\n- three\n\n```js\nconst a = 1;\n```",
    modified:
      "# Title (v2)\n\n- one\n- two changed\n- three\n- four\n\n```js\nconst a = 2;\n```",
  },
  {
    id: "code",
    label: "Code (Monaco, auto)",
    note: "language='typescript' → auto engine picks Monaco.",
    language: "typescript",
    original:
      "function add(a: number, b: number) {\n  return a + b;\n}\n\nconst x = add(1, 2);",
    modified:
      "function add(a: number, b: number): number {\n  // guard\n  if (Number.isNaN(a)) return b;\n  return a + b;\n}\n\nconst x = add(1, 2);\nconsole.log(x);",
  },
  {
    id: "reorder",
    label: "Reordered lines",
    note: "LCS treats a moved line as remove+add — it does NOT detect moves as 'moved'.",
    original: "alpha\nbeta\ngamma\ndelta",
    modified: "gamma\ndelta\nalpha\nbeta",
  },
  {
    id: "whitespace",
    label: "Whitespace-only",
    note: "Flags 'whitespace only' in the toolbar; toggle ignoreTrailingWhitespace in code.",
    original: "line one   \nline two\n\nline three",
    modified: "line one\nline two\nline three",
  },
  {
    id: "identical",
    label: "Identical",
    note: "No changes — verifies the empty state.",
    original: "same\ncontent\nhere",
    modified: "same\ncontent\nhere",
  },
  {
    id: "oneside",
    label: "Pure addition",
    note: "Right-only content renders as filler rows on the left in split view.",
    original: "intro",
    modified: "intro\nadded line A\nadded line B\nadded line C",
  },
];

export default function DiffDemoPage() {
  const [original, setOriginal] = useState(SCENARIOS[0].original);
  const [modified, setModified] = useState(SCENARIOS[0].modified);
  const [engine, setEngine] = useState<DiffEngine>("auto");
  const [view, setView] = useState<View>("split");
  const [language, setLanguage] = useState<string>("");
  const [wordLevel, setWordLevel] = useState(true);
  const [granularity, setGranularity] = useState<"word" | "character">("word");
  const [ignoreTrailingWs, setIgnoreTrailingWs] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);

  const openWindow = useOpenDiffViewerWindow();

  const loadScenario = (s: Scenario) => {
    setOriginal(s.original);
    setModified(s.modified);
    setEngine(s.engine ?? "auto");
    setLanguage(s.language ?? "");
  };

  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden bg-textured">
      <div className="shrink-0 border-b border-border px-4 py-2">
        <h1 className="text-sm font-semibold">Diff System — dev playground</h1>
        <p className="text-xs text-muted-foreground">
          Canonical core: <code>components/diff/DiffViewer</code>. Light =
          custom text engine with word-level highlighting. Heavy = Monaco.
        </p>
      </div>

      {/* Scenario presets */}
      <div className="shrink-0 flex flex-wrap gap-1.5 px-4 py-2 border-b border-border">
        {SCENARIOS.map((s) => (
          <Button
            key={s.id}
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            onClick={() => loadScenario(s)}
            title={s.note}
          >
            {s.label}
          </Button>
        ))}
      </div>

      {/* Controls */}
      <div className="shrink-0 flex flex-wrap items-center gap-3 px-4 py-2 border-b border-border text-xs">
        <label className="flex items-center gap-1">
          Engine
          <select
            value={engine}
            onChange={(e) => setEngine(e.target.value as DiffEngine)}
            className="border border-border rounded bg-background px-1 py-0.5"
          >
            <option value="auto">auto</option>
            <option value="light">light</option>
            <option value="monaco">monaco</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          View
          <select
            value={view}
            onChange={(e) => setView(e.target.value as View)}
            className="border border-border rounded bg-background px-1 py-0.5"
          >
            <option value="highlight">highlight</option>
            <option value="split">split</option>
            <option value="inline">inline</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          Language
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            placeholder="(text)"
            className="border border-border rounded bg-background px-1 py-0.5 w-28"
          />
        </label>
        <label className="flex items-center gap-1">
          <Checkbox
            checked={wordLevel}
            onCheckedChange={(v) => setWordLevel(v === true)}
          />
          word-level
        </label>
        <label className="flex items-center gap-1">
          Granularity
          <select
            value={granularity}
            onChange={(e) =>
              setGranularity(e.target.value as "word" | "character")
            }
            className="border border-border rounded bg-background px-1 py-0.5"
          >
            <option value="word">word</option>
            <option value="character">character</option>
          </select>
        </label>
        <label className="flex items-center gap-1">
          <Checkbox
            checked={ignoreTrailingWs}
            onCheckedChange={(v) => setIgnoreTrailingWs(v === true)}
          />
          ignore trailing ws
        </label>
        <label className="flex items-center gap-1">
          <Checkbox
            checked={reviewMode}
            onCheckedChange={(v) => setReviewMode(v === true)}
          />
          review &amp; merge (per-hunk)
        </label>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={() =>
            openWindow({
              original,
              modified,
              engine,
              language: language || undefined,
              originalLabel: "Original",
              modifiedLabel: "Modified",
              title: "Diff (window)",
              defaultView: view,
            })
          }
        >
          Open in window
        </Button>
      </div>

      {/* Inputs + live diff */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-0 overflow-hidden">
        <div className="flex flex-col border-r border-border min-h-0">
          <div className="grid grid-rows-2 flex-1 min-h-0">
            <textarea
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              spellCheck={false}
              className="w-full resize-none border-b border-border bg-background p-2 font-mono text-xs outline-none"
              placeholder="Original"
            />
            <textarea
              value={modified}
              onChange={(e) => setModified(e.target.value)}
              spellCheck={false}
              className="w-full resize-none bg-background p-2 font-mono text-xs outline-none"
              placeholder="Modified"
            />
          </div>
        </div>

        <div className="min-h-0 overflow-hidden">
          {reviewMode ? (
            <DiffReview
              original={original}
              modified={modified}
              originalLabel="Original"
              modifiedLabel="Modified"
              diffOptions={{
                wordLevel,
                granularity,
                ignoreTrailingWhitespace: ignoreTrailingWs,
              }}
              onApply={(merged) => {
                setOriginal(merged);
                toast.success("Applied merge", {
                  description: `${merged.split("\n").length} lines written back as the new Original`,
                });
              }}
            />
          ) : (
            <DiffViewer
              original={original}
              modified={modified}
              engine={engine}
              language={language || undefined}
              view={view}
              originalLabel="Original"
              modifiedLabel="Modified"
              textOptions={{
                wordLevel,
                granularity,
                ignoreTrailingWhitespace: ignoreTrailingWs,
              }}
            />
          )}
        </div>
      </div>

      {/* Capabilities / limitations */}
      <div className="shrink-0 max-h-44 overflow-auto border-t border-border px-4 py-2 text-xs grid grid-cols-2 gap-4">
        <div>
          <p className="font-semibold text-green-600 dark:text-green-400 mb-1">
            What it does
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
            <li>Line-level LCS diff (add / remove / modified-pair).</li>
            <li>Word & character intra-line highlighting (light engine).</li>
            <li>
              Highlight (single-pane: the new doc with changes tinted), inline
              (unified), and split (side-by-side). Highlight is light-engine
              only.
            </li>
            <li>Monaco for code / large inputs via engine=&quot;auto&quot;.</li>
            <li>Renders anywhere: inline here, or “Open in window”.</li>
            <li>Whitespace-only detection; optional ignore-trailing-ws.</li>
            <li>
              Per-hunk accept/reject merge (toggle “review &amp; merge”) →
              merged text via <code>onApply</code>.
            </li>
          </ul>
        </div>
        <div>
          <p className="font-semibold text-amber-600 dark:text-amber-400 mb-1">
            What it does NOT do (yet)
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground">
            <li>No move detection — a moved line shows as remove + add.</li>
            <li>Light engine diffs raw text, not rendered markdown/HTML.</li>
            <li>
              Light engine is read-only line-level; the `DiffReview` merge tool
              is whole-hunk accept/reject (no in-place text editing of a hunk).
            </li>
            <li>
              No syntax highlighting in the light engine (use Monaco for that).
            </li>
            <li>
              Light engine is O(n·m) memory — very large files should use
              Monaco.
            </li>
            <li>No 3-way / merge view.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
