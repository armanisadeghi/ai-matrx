"use client";

import { useEffect, useState } from "react";
import { Input } from "@ai-matrx/design-system";
import { Check, Copy, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { DECISIONS, type Decision } from "./decisions";

const STORAGE_KEY = "ui-unification-decisions-v1";

interface DecisionState {
  winner?: string;
  note?: string;
}
type Picks = Record<string, DecisionState>;

function readPicks(): Picks {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Picks) : {};
  } catch {
    return {};
  }
}

function writePicks(picks: Picks) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
  } catch {
    // Storage blocked (private window, preview). The board still works in memory.
  }
}

function toMarkdown(picks: Picks): string {
  const lines: string[] = [
    "# UI unification decisions",
    "",
    `Exported ${new Date().toISOString().slice(0, 10)}`,
    "",
  ];
  for (const d of DECISIONS) {
    const state = picks[d.id] ?? {};
    const winner = d.options.find((o) => o.id === state.winner);
    lines.push(`## ${d.id} · ${d.title}`);
    lines.push(
      `- Winner: ${winner ? `${winner.id}) ${winner.label}${winner.stat ? ` (${winner.stat})` : ""}` : "undecided"}`,
    );
    if (state.note?.trim()) lines.push(`- Note: ${state.note.trim()}`);
    lines.push("- Options:");
    for (const o of d.options) {
      lines.push(`  - ${o.id}) ${o.label}${o.stat ? ` — ${o.stat}` : ""}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function DecisionCard({
  decision,
  state,
  onPick,
  onNote,
}: {
  decision: Decision;
  state: DecisionState;
  onPick: (optionId: string) => void;
  onNote: (note: string) => void;
}) {
  const decided = Boolean(state.winner);
  return (
    <section
      id={decision.id}
      className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
    >
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-xs text-muted-foreground">
          {decision.id}
        </span>
        <h2 className="text-base font-semibold text-foreground">
          {decision.title}
        </h2>
        <span className="text-sm text-muted-foreground">
          {decision.question}
        </span>
        {decided && <Check className="h-4 w-4 text-primary" aria-label="Decided" />}
      </header>

      <div
        className={cn(
          "grid gap-3",
          decision.wide
            ? "grid-cols-1"
            : "grid-cols-[repeat(auto-fill,minmax(min(100%,240px),1fr))]",
        )}
      >
        {decision.options.map((option) => {
          const picked = state.winner === option.id;
          const { Specimen } = option;
          return (
            <div
              key={option.id}
              className={cn(
                "flex min-w-0 flex-col gap-3 rounded-md border bg-background p-3 transition-shadow",
                picked
                  ? "border-primary ring-2 ring-primary"
                  : "border-border",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-foreground">
                    {option.id}) {option.label}
                  </div>
                  {option.stat && (
                    <div className="text-xs text-muted-foreground">
                      {option.stat}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant={picked ? "default" : "outline"}
                  aria-pressed={picked}
                  onClick={() => onPick(option.id)}
                >
                  {picked && <Check />}
                  {picked ? "Picked" : "Pick"}
                </Button>
              </div>
              <div className="min-w-0 overflow-x-auto">
                <Specimen />
              </div>
            </div>
          );
        })}
      </div>

      <Input
        value={state.note ?? ""}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Note (optional)"
        aria-label={`${decision.id} note`}
      />
    </section>
  );
}

export function DecisionBoard() {
  const [picks, setPicks] = useState<Picks>({});

  useEffect(() => {
    setPicks(readPicks());
  }, []);

  const update = (id: string, patch: (prev: DecisionState) => DecisionState) => {
    setPicks((prev) => {
      const next = { ...prev, [id]: patch(prev[id] ?? {}) };
      writePicks(next);
      return next;
    });
  };

  const decidedCount = DECISIONS.filter((d) => picks[d.id]?.winner).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toMarkdown(picks));
      toast.success("Decisions copied");
    } catch {
      toast.error("Clipboard blocked — use Download");
    }
  };

  const download = () => {
    try {
      const blob = new Blob([toMarkdown(picks)], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ui-unification-decisions.md";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded");
    } catch {
      toast.error("Download failed");
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-textured">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border bg-background/95 px-4 py-2 backdrop-blur">
        <h1 className="text-sm font-semibold text-foreground">UI unification</h1>
        <span className="text-sm text-muted-foreground">
          {decidedCount} of {DECISIONS.length} decided
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={copy}>
            <Copy /> Copy decisions
          </Button>
          <Button size="sm" variant="outline" onClick={download}>
            <Download /> Download .md
          </Button>
        </div>
      </div>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
        {DECISIONS.map((decision) => (
          <DecisionCard
            key={decision.id}
            decision={decision}
            state={picks[decision.id] ?? {}}
            onPick={(optionId) =>
              update(decision.id, (prev) => ({
                ...prev,
                winner: prev.winner === optionId ? undefined : optionId,
              }))
            }
            onNote={(note) => update(decision.id, (prev) => ({ ...prev, note }))}
          />
        ))}
      </div>
    </div>
  );
}
