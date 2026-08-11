"use client";

/**
 * E-E-A-T attachment pass — which pages carry which author, reviewer, or
 * citation, decided across the whole plan at once.
 *
 * The agent picks ONLY from the site's existing roster; anything it thinks is
 * missing comes back as a described gap, never an invented person or source.
 * Those gaps are shown here so the user can add them in the Entities view and
 * re-run.
 */
import { useState } from "react";
import { Loader2, UserCheck, X } from "lucide-react";

import { Button } from "@/components/ui/button";

import type { EntityAttachPlan } from "../ai";
import { SetupSection } from "./SetupSection";

export function EntityAttachSection({
  plan,
  busy,
  anyBusy,
  aiReady,
  rosterEmpty,
  planEmpty,
  error,
  onDismissError,
  onRun,
  onApply,
  onDismiss,
  applying,
  appliedAt,
}: {
  plan: EntityAttachPlan | null;
  busy: boolean;
  anyBusy: boolean;
  aiReady: boolean;
  /** No entities exist yet — there is nothing to attach FROM. */
  rosterEmpty: boolean;
  planEmpty: boolean;
  error: string | null;
  onDismissError?: () => void;
  onRun: () => void;
  onApply: () => void;
  /** Throw the staged plan away — it is persisted, so this is the only exit. */
  onDismiss: () => void;
  applying: boolean;
  appliedAt: string | null;
}) {
  const [open, setOpen] = useState(true);
  const disabledReason = !aiReady
    ? "Pick a research topic with a finished report in the AI grounding bar first"
    : rosterEmpty
      ? "No entities on this site yet — add them in the Entities view (or run “Suggest from research” there) first"
      : planEmpty
        ? "There are no planned pages to attach entities to yet"
        : null;

  return (
    <SetupSection
      title="E-E-A-T attachments"
      action={
        <div className="flex items-center gap-1">
          {plan && !busy ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground"
              title="Discard this entity plan — it is saved with your setup until you do."
              onClick={onDismiss}
            >
              Dismiss
            </Button>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1.5 px-2 text-xs"
            disabled={Boolean(disabledReason) || anyBusy}
            title={
              disabledReason ??
              "Decide which pages carry which author, reviewer, and citation — chosen only from this site's roster."
            }
            onClick={onRun}
          >
            {busy ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <UserCheck className="h-3 w-3" />
            )}
            {plan ? "Re-assign" : "Assign entities"}
          </Button>
        </div>
      }
    >
      {error ? (
        <div className="mb-2 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-2 py-1.5">
          <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-destructive">
            {error}
          </p>
          {onDismissError ? (
            <button
              type="button"
              aria-label="Dismiss the entity error"
              className="shrink-0 text-destructive/70 hover:text-destructive"
              onClick={onDismissError}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      ) : null}

      {busy ? (
        <p className="text-xs text-muted-foreground">
          Matching the roster against the plan…
        </p>
      ) : !plan ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Assigns authors, reviewers, and cited standards to the pages where
          credibility is load-bearing — only from this site&apos;s roster,
          never invented.
        </p>
      ) : (
        <div className="space-y-2">
          {plan.notes ? (
            <p className="text-xs leading-relaxed text-foreground">{plan.notes}</p>
          ) : null}

          {plan.missingEntities.length > 0 ? (
            <div className="rounded-md border border-warning/40 bg-warning/10 px-2 py-1.5">
              <p className="text-[11px] font-medium text-foreground">
                Roster gaps — add these in the Entities view, then re-run:
              </p>
              <ul className="mt-1 space-y-0.5">
                {plan.missingEntities.map((gap, index) => (
                  <li key={index} className="text-[11px] leading-relaxed text-foreground">
                    <span className="font-medium">{gap.suggestedLabel}</span>{" "}
                    <span className="text-muted-foreground">({gap.entityType})</span>{" "}
                    — {gap.whyNeeded}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-[11px] font-medium text-primary hover:underline"
              onClick={() => setOpen((current) => !current)}
            >
              {open ? "Hide" : "Show"} {plan.attachments.length} attachment
              {plan.attachments.length === 1 ? "" : "s"}
            </button>
            {appliedAt ? (
              <span className="text-[11px] font-medium text-success">applied</span>
            ) : (
              <Button
                size="sm"
                className="ml-auto h-6 px-2 text-[11px]"
                disabled={applying || plan.attachments.length === 0}
                onClick={onApply}
              >
                {applying ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                Apply to plan
              </Button>
            )}
          </div>

          {open && plan.attachments.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {plan.attachments.map((attachment, index) => (
                <li
                  key={`${attachment.route}-${attachment.entityLabel}-${index}`}
                  className="bg-card px-2.5 py-1.5"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase leading-none text-muted-foreground">
                      {attachment.role.replace(/_/g, " ")}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                      {attachment.entityLabel}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {attachment.route}
                  </p>
                  {attachment.reason ? (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                      {attachment.reason}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </SetupSection>
  );
}
