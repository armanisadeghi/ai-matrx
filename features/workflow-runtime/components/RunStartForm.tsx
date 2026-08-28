"use client";

/**
 * RunStartForm — THE start surface of the shipped run page.
 *
 * ─── There is no longer a fork ──────────────────────────────────────────────
 * The inputs of a workflow are ONE declared surface, compiled server-side and
 * served by `GET /workflows/{id}/run-form` (common-docs
 * `systems/workflows/INPUT-SURFACE.md`). `ServedRunForm` renders it, and it is
 * the only thing this component renders.
 *
 * This used to hold a second branch: when the endpoint answered without an
 * `inputs` array (a server predating the surface), it fell back to a
 * CLIENT-SIDE reading of the definition's `io.user_input` nodes, behind a loud
 * banner. That branch, and the whole module of helpers it existed for, are
 * deleted — `adoption-seams.test.ts` guards that they stay deleted, including
 * the symbol names, which is why none of them appear in this file.
 *
 * Its replacement lives one layer down, in `parseServedRunForm`: a skew
 * response's older `sections[].json_schema` IS read, as a degraded served
 * surface. Same question, same authority, older shape — so there is nothing
 * left for a client-side derivation to add.
 *
 * The degraded path still never lies. What `sections` cannot express — the
 * `ask` sourcing rule, the input's kind, a mandate-pinned value — is named in
 * the banner `ServedRunForm` shows above the fields, because an input that
 * needs a fresh human answer every run will not be gated for one here.
 *
 * WHY THIS COMPONENT STILL EXISTS: the page chrome around the form (the Cancel
 * door back out of the start surface) is the run page's, not the surface's.
 * The surface itself never carries page chrome.
 */

import { ServedRunForm } from "../served-form/ServedRunForm";
import { useServedRunForm } from "../served-form/useServedRunForm";

export function RunStartForm({
  definitionId,
  startLabel,
  onStarted,
  onCancel,
}: {
  /** The workflow whose served input surface is asked for. */
  definitionId: string;
  /** e.g. "Run" / "Run step-by-step" — names the verb being confirmed. */
  startLabel: string;
  /** The served form starts the run itself and hands back the id. */
  onStarted: (runId: string) => void;
  onCancel: () => void;
}) {
  // The host holds the fetch so the endpoint is asked exactly once per paint;
  // the served component takes the answer as a prop and never re-asks.
  const served = useServedRunForm(definitionId);

  if (served.status === "loading") {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-2 h-9 animate-pulse rounded bg-muted/60" />
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <ServedRunForm
        definitionId={definitionId}
        state={served}
        onStarted={onStarted}
        startLabel={startLabel}
      />
      <button
        type="button"
        onClick={onCancel}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground"
      >
        Cancel
      </button>
    </div>
  );
}
