"use client";

/**
 * BriefEditor — the content plan's brief surface. It OWNS no rendering.
 *
 * 🚨 THE CANONICAL COMPONENT LAW. A `page_brief` is rendered by
 * `PageBriefBlock` and its exported parts — here, in the live-run window, and
 * in chat. This file used to re-implement the whole shape by hand (its own
 * angle card, its own point list, its own must-not-cover and concerns
 * sections) and immediately diverged from the real component: full-paragraph
 * directives were crushed into one-row textareas. That duplicate is gone.
 * What remains is composition + the two things that genuinely are NOT part of
 * the shape: the accept decision, and the run history.
 *
 * The three context fields (`angle` / `must_not_cover` / `concerns`) are the
 * RUN's output, not columns on the node — read-only, and reachable forever
 * through the history below, where each past run keeps its own complete copy.
 */

import { useState } from "react";
import { History, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { webLocation } from "@/features/marketing/lib/copy-payloads";
import { Label } from "@/components/ui/label";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import PageBriefBlock, {
  PageBriefPoints,
} from "@/components/mardown-display/blocks/page-brief/PageBriefBlock";
import type { PageBriefData } from "@/features/content-ir/kinds/page-brief";

import type { BriefDraft, BriefRunSummary } from "../hooks/useBriefWriter";

/** The persisted draft in the shape the canonical component consumes. */
function draftAsPageBrief(draft: BriefDraft): PageBriefData {
  return {
    brief: draft.brief,
    angle: draft.angle || null,
    must_not_cover: draft.must_not_cover,
    concerns: draft.concerns,
    suggested_word_count: draft.suggested_word_count,
    isComplete: true,
  };
}

export function BriefEditor({
  lines,
  savedLines,
  node,
  planKpiLine,
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
  /**
   * The brief as the SAVED record holds it. Copy is built from `lines` (what
   * is on screen); this is only here so the payload can state, explicitly,
   * where the screen and the saved row disagree. Copying the fetched row
   * after the user edited a point is lying to the agent.
   */
  savedLines: string[];
  /** Identity for the envelope — a section payload names what it belongs to. */
  node: { id: string; label: string; route: string | null };
  /** The workspace's leading KPI sentence, mirrored into every payload. */
  planKpiLine?: string | null;
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

  return (
    <div className="group/brief space-y-3">
      {/* The AI's own proposal, rendered by the SAME component the live-run
          window uses. Shown whenever a run exists — not only while a decision
          is pending: hiding it after accept is how the angle and the
          must-not-cover list "disappeared" from a run the user paid for. */}
      {draft ? (
        <PageBriefBlock
          serverData={draftAsPageBrief(draft)}
          // ONE path. The button the component renders runs the same
          // `accept_brief_draft` write target an agent applies — a human click
          // and an agent write are literally the same operation.
          acceptTarget="accept_brief_draft"
          canAccept={draftPending}
        />
      ) : null}

      {/* The node's SAVED brief — the document the user edits and commits.
          Same component, `editable`, so a point is a field that grows with its
          content instead of a one-line box. */}
      <div>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <Label className="block text-xs font-medium">
            What this page must cover — one point per row
          </Label>
          {/* 🚨 Built from `lines` — the LIVE field value, resolved at click
            time — never from the saved row. `unsaved_changes` states the
            difference explicitly so an agent is never handed a stale brief. */}
          <CopyButtons
            size="xs"
            className="opacity-0 transition-opacity focus-within:opacity-100 group-hover/brief:opacity-100"
            label="Page brief"
            human={() =>
              [
                `Brief — ${node.route ?? node.label}`,
                planKpiLine ? `Plan: ${planKpiLine}` : null,
                lines.length
                  ? lines.map((line) => `- ${line}`).join("\n")
                  : "No brief yet.",
                draftPending
                  ? "\nAn AI proposal for this brief is awaiting your decision."
                  : null,
              ]
                .filter(Boolean)
                .join("\n")
            }
            json={() => lines}
            agent={() => {
              const dirty =
                lines.length !== savedLines.length ||
                lines.some((line, index) => line !== savedLines[index]);
              return {
                kind: "plan_node_brief",
                location: webLocation("Content Plan — page brief"),
                description:
                  "The brief section of the open plan page, as it stands in the editor right now (live, possibly unsaved).",
                data: {
                  page: node,
                  brief_on_screen: lines,
                  has_unsaved_edits: dirty,
                  unsaved_changes: dirty
                    ? { saved: savedLines, on_screen: lines }
                    : null,
                  // A paid run still awaiting the user's accept/reject.
                  pending_ai_proposal: draftPending ? draft : null,
                  ai_proposal_on_record: draft,
                  run_history: runsError
                    ? { error: runsError }
                    : runsLoading
                      ? { loading: true }
                      : runs,
                },
                attributes: {
                  node_id: node.id,
                  route: node.route,
                  brief_points: lines.length,
                  has_unsaved_edits: dirty,
                  proposal_pending: draftPending,
                  runs: runs.length,
                },
                context: { plan_kpis: planKpiLine ?? undefined },
              };
            }}
          />
        </div>
        <PageBriefPoints
          lines={lines}
          editable
          onChange={onChange}
          emptyHint="No brief yet — add a point, or use Draft brief."
        />
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
                Could not load this page&apos;s run history: {runsError}
              </p>
            ) : runs.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No brief runs yet.
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
                      {run.model_id ? (
                        <span className="ml-1 inline-flex align-top">
                          ·
                          <AiModelRef
                            modelId={run.model_id}
                            showId
                            showIcon={false}
                            className="ml-1"
                          />
                        </span>
                      ) : null}
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
