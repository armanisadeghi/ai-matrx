"use client";

/**
 * KEYWORD BINDING — the last big manual step in the plan.
 *
 * `plan.node.primary_keyword_id` is otherwise picked by hand, one page at a
 * time, in the node panel. This runs the Keyword Binder agent over every
 * planned page at once against the SITE'S OWN keyword pool
 * (`seo.site_keyword_value`), and stages the assignments for review — the
 * user applies them, the same "AI proposes, the user commits" contract every
 * other step here follows.
 *
 * The agent may only return phrases that exist in the pool; the caller
 * resolves phrase → keyword_id and drops anything that does not match, so an
 * invented phrase can never reach the database.
 */
import { KeyRound, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { PlanNodeRow } from "../../types";
import { SetupSection } from "./SetupSection";

export interface StagedKeywordAssignment {
  route: string;
  nodeId: string;
  label: string;
  keywordId: string;
  keywordPhrase: string;
  reason: string;
  /** The phrase this page already targets, when it had one. */
  previousPhrase: string | null;
}

export function KeywordBindSection({
  nodes,
  poolSize,
  poolLoading = false,
  poolError = null,
  assignments,
  notes,
  busy,
  anyBusy,
  aiReady,
  applying,
  error,
  onRun,
  onApply,
  onDismiss,
  onDismissError,
}: {
  nodes: PlanNodeRow[];
  /** How many keywords the site actually has to choose from. */
  poolSize: number;
  /** The pool read is still in flight — NOT the same as "there are none". */
  poolLoading?: boolean;
  /** The pool read failed — NOT the same as "there are none". */
  poolError?: string | null;
  assignments: StagedKeywordAssignment[] | null;
  notes: string;
  busy: boolean;
  anyBusy: boolean;
  aiReady: boolean;
  applying: boolean;
  error: string | null;
  onRun: () => void;
  onApply: () => void;
  onDismiss: () => void;
  onDismissError: () => void;
}) {
  const missing = nodes.filter((node) => !node.primary_keyword_id).length;
  const disabledReason = (() => {
    if (poolLoading) return "Loading this site's keywords…";
    if (poolError) return `Could not load this site's keywords: ${poolError}`;
    if (poolSize === 0) {
      return "This site has no keywords yet — add them in Search & Keywords first.";
    }
    if (!aiReady) {
      return "Pick a research topic with a finished report in the AI grounding bar first.";
    }
    return null;
  })();

  return (
    <SetupSection
      title="Keywords"
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1.5 px-2 text-xs"
          disabled={anyBusy || applying || disabledReason !== null}
          title={
            disabledReason ??
            "Assign every planned page a primary keyword from this site's keyword pool."
          }
          onClick={onRun}
        >
          {busy ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <KeyRound className="h-3 w-3" />
          )}
          {assignments ? "Redo" : "Suggest keywords"}
        </Button>
      }
    >
      {error ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-destructive">
            {error}
          </p>
          <button
            type="button"
            aria-label="Dismiss the keyword error"
            className="shrink-0 text-destructive/70 hover:text-destructive"
            onClick={onDismissError}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {busy ? (
        <p className="text-xs text-muted-foreground">
          Matching {nodes.length} page{nodes.length === 1 ? "" : "s"} against{" "}
          {poolSize} keyword{poolSize === 1 ? "" : "s"}…
        </p>
      ) : !assignments ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {missing} of {nodes.length} planned page
          {nodes.length === 1 ? "" : "s"} have no primary keyword.{" "}
          {disabledReason ?? `The site's pool has ${poolSize} to choose from.`}
        </p>
      ) : assignments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {notes || "No page matched a keyword in this site's pool."}
        </p>
      ) : (
        <div className="space-y-2">
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {assignments.map((item) => (
              <li key={item.nodeId} className="bg-card px-2.5 py-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                    {item.route}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-primary">
                  {item.keywordPhrase}
                  {item.previousPhrase ? (
                    <span className="ml-1 text-muted-foreground">
                      (replaces &ldquo;{item.previousPhrase}&rdquo;)
                    </span>
                  ) : null}
                </p>
                {item.reason ? (
                  <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                    {item.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          {notes ? (
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {notes}
            </p>
          ) : null}
          <div className="flex gap-1.5">
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={applying}
              onClick={onApply}
            >
              {applying ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              Apply {assignments.length} keyword
              {assignments.length === 1 ? "" : "s"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs"
              disabled={applying}
              onClick={onDismiss}
            >
              Discard
            </Button>
          </div>
        </div>
      )}
    </SetupSection>
  );
}
