"use client";

/**
 * BriefEditor — the page brief as STRUCTURE, not a wall of text.
 *
 * 🚨 WHY THIS REPLACED A TEXTAREA. The brief is a list of distinct directives,
 * and the AI that writes it also returns the angle it chose, what this page
 * must LEAVE to its sibling pages, and its own concerns. Joining the points
 * with "\n" into one textarea threw the structure away twice over: the user
 * could not tell where one point ended and the next began, and the other three
 * fields had nowhere to appear at all — so the most valuable half of an
 * expensive run was invisible even though it was sitting in the database.
 *
 * Here every point is its own editable row, and the AI's surrounding context is
 * always shown, whether or not the draft is still pending. Editing stages into
 * the same node draft the Save button commits — the write path is unchanged.
 *
 * `must_not_cover` / `concerns` / `angle` are the RUN's output, not columns on
 * the node: they are read-only context, and they stay reachable forever through
 * the run history below (each past run keeps its own complete copy).
 */

import { useState } from "react";
import { History, Plus, RotateCcw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { BriefDraft, BriefRunSummary } from "../hooks/useBriefWriter";

export function BriefEditor({
  lines,
  onChange,
  draft,
  draftPending,
  onAccept,
  accepting,
  runs,
  runsLoading,
  runsError,
  onRestore,
  restoringRunId,
}: {
  /** The brief as it will be saved — draft-overlaid live value. */
  lines: string[];
  onChange: (next: string[]) => void;
  /** The node's persisted AI proposal, or null when none was ever run. */
  draft: BriefDraft | null;
  /** The proposal differs from what is saved — a decision is outstanding. */
  draftPending: boolean;
  onAccept: () => void;
  accepting: boolean;
  runs: BriefRunSummary[];
  runsLoading: boolean;
  /** The history could not be loaded — never render this as "no runs". */
  runsError: string | null;
  onRestore: (runId: string) => void;
  restoringRunId: string | null;
}) {
  const [showHistory, setShowHistory] = useState(false);

  const setLine = (index: number, value: string) => {
    const next = [...lines];
    next[index] = value;
    onChange(next);
  };
  const removeLine = (index: number) =>
    onChange(lines.filter((_, position) => position !== index));
  const addLine = () => onChange([...lines, ""]);

  return (
    <div className="space-y-3">
      {/* The AI's own framing. Shown whenever a run exists — NOT only while a
          decision is pending. Hiding it after accept is how the angle and the
          must-not-cover list "disappeared" from a run the user paid for. */}
      {draft ? (
        <div
          className={cn(
            "rounded-md border p-3 space-y-2.5",
            draftPending
              ? "border-primary/40 bg-primary/5"
              : "border-border bg-muted/20",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">
                {draftPending
                  ? `AI draft ready — ${draft.brief.length} point${draft.brief.length === 1 ? "" : "s"}`
                  : "AI brief — applied"}
              </p>
              {draft.angle ? (
                <p className="mt-1 text-xs leading-relaxed text-foreground">
                  <span className="font-medium">Angle: </span>
                  {draft.angle}
                </p>
              ) : null}
            </div>
            {draftPending ? (
              <Button
                size="sm"
                className="h-7 shrink-0"
                disabled={accepting}
                onClick={onAccept}
              >
                {accepting ? "Applying…" : "Use this brief"}
              </Button>
            ) : null}
          </div>

          {/* The proposal's own points. Without these the card says "7 points
              ready" and shows none of them — the user is asked to accept
              something they cannot read. Once accepted they live in the editor
              below and this preview stops repeating them. */}
          {draftPending ? (
            <ol className="list-decimal space-y-1 pl-4 text-xs leading-relaxed text-foreground marker:text-muted-foreground">
              {draft.brief.map((line, index) => (
                <li key={`${index}-${line.slice(0, 24)}`}>{line}</li>
              ))}
            </ol>
          ) : null}

          {draft.must_not_cover.length > 0 ? (
            <ContextList
              title="Leave to sibling pages"
              hint="Covering these here is the cannibalization the plan exists to prevent."
              items={draft.must_not_cover}
            />
          ) : null}
          {draft.concerns.length > 0 ? (
            <ContextList title="The writer's concerns" items={draft.concerns} />
          ) : null}
          {/* Provenance the USER can act on. The agent/model ids are UUIDs —
              meaningless to the subject-matter expert this page is built for,
              and already on the run record for anyone who needs them. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {draft.suggested_word_count ? (
              <span>Suggested length ~{draft.suggested_word_count} words</span>
            ) : null}
            {draft.generated_at ? (
              <span>Written {new Date(draft.generated_at).toLocaleString()}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <Label className="text-xs font-medium">
            What this page must cover — one point per row
          </Label>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
            onClick={addLine}
          >
            <Plus className="h-3 w-3" />
            Add point
          </Button>
        </div>
        {lines.length === 0 ? (
          <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
            No brief yet. Add a point, or use Draft brief to have one written
            against this page&apos;s siblings.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((line, index) => (
              <li key={index} className="flex items-start gap-1.5">
                <span className="mt-2 w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <Textarea
                  value={line}
                  onChange={(event) => setLine(index, event.target.value)}
                  rows={1}
                  className="min-h-8 flex-1 resize-y py-1.5 text-sm leading-relaxed"
                  placeholder="What this page must cover…"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-0.5 h-7 w-7 shrink-0 p-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove point ${index + 1}`}
                  onClick={() => removeLine(index)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* History sits BELOW the field it describes — opening it must never push
          the brief the user is editing down the page. */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-1.5 text-xs text-muted-foreground"
          onClick={() => setShowHistory((open) => !open)}
        >
          <History className="h-3.5 w-3.5" />
          {showHistory ? "Hide" : "Show"} brief run history
          {runs.length > 0 ? ` (${runs.length})` : ""}
        </Button>
        {showHistory ? (
          <div className="mt-1.5 space-y-1.5">
            {runsLoading ? (
              <p className="text-xs text-muted-foreground">Loading runs…</p>
            ) : runsError ? (
              <p className="text-xs text-destructive">
                Could not load this page&apos;s run history: {runsError}. Your
                runs are not lost — they are recorded against this page.
              </p>
            ) : runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No brief has been run for this page yet.
              </p>
            ) : (
              runs.map((run) => (
                <div
                  key={run.run_id}
                  className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground">
                      {new Date(run.created_at).toLocaleString()}
                      {run.is_current ? " · current" : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {run.status === "completed"
                        ? `${run.brief_line_count} point${run.brief_line_count === 1 ? "" : "s"}`
                        : run.status}
                      {run.model_id ? ` · ${run.model_id}` : ""}
                    </p>
                    {run.angle ? (
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                        {run.angle}
                      </p>
                    ) : null}
                    {run.error ? (
                      <p className="mt-0.5 text-[11px] text-destructive">
                        {run.error}
                      </p>
                    ) : null}
                  </div>
                  {run.status === "completed" && !run.is_current ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 shrink-0 gap-1 text-xs"
                      disabled={restoringRunId !== null}
                      onClick={() => onRestore(run.run_id)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {restoringRunId === run.run_id ? "Restoring…" : "Restore"}
                    </Button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ContextList({
  title,
  hint,
  items,
}: {
  title: string;
  hint?: string;
  items: string[];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-foreground">{title}</p>
      {hint ? (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
      <ul className="mt-0.5 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
        {items.map((item, index) => (
          <li key={`${index}-${item.slice(0, 24)}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
