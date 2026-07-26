"use client";

/**
 * "Apply" for an `output_directive` envelope that arrived as CONTENT.
 *
 * THE POSITION RULE, honoured exactly: a directive inside content NEVER
 * auto-executes (MATRX_ENVELOPE.md) — that is the guard against untrusted
 * content mutating things. But "does not auto-execute" was never meant to be
 * "is inert": the user seeing it must be able to say yes. This button IS that
 * yes, and it is the same semantic as approving an `ask`-policy proposal.
 *
 * It posts the envelope to `POST /actions/confirm` (`confirmDirective`), which
 * re-validates every item against the registered `(kind, type)` item model and
 * applies it through the ONE server handler, running as the user under RLS.
 * `proposal_id` is optional there, so an envelope the server never proposed
 * (e.g. one a text-mode agent wrote into its reply, where the structured-output
 * dispatcher never fired) applies through the identical path.
 *
 * Idempotency comes from the handlers themselves (plan_tree is get-or-create by
 * site+parent+slug), so a double-click cannot duplicate rows.
 */

import { useState } from "react";
import { CheckCircle2, Loader2, Play, TriangleAlert } from "lucide-react";

import { confirmDirective } from "@/features/action-catalog/service";
import type { MatrxEnvelope } from "@/features/matrx-envelope/envelope";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";

type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; applied: number; failed: number }
  | { status: "error"; message: string };

export interface ApplyDirectiveButtonProps {
  envelope: MatrxEnvelope;
  /** Optional label override, e.g. "Apply plan". */
  label?: string;
}

export function ApplyDirectiveButton({
  envelope,
  label = "Apply",
}: ApplyDirectiveButtonProps) {
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const [state, setState] = useState<ApplyState>({ status: "idle" });

  // Only side-effect envelopes are applicable; a reference/secret never is.
  if (envelope.kind !== "output_directive") return null;

  const items = Array.isArray(envelope.items) ? envelope.items : [];

  async function handleApply() {
    setState({ status: "applying" });
    try {
      const result = await confirmDirective(baseUrl, {
        matrx_version: envelope.matrx_version,
        kind: "output_directive",
        type: envelope.type,
        items: items as Record<string, unknown>[],
      });
      setState({
        status: "applied",
        applied: result.applied,
        failed: result.failed,
      });
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (state.status === "applied") {
    const bad = state.failed > 0;
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs ${bad ? "text-destructive" : "text-primary"}`}
      >
        {bad ? (
          <TriangleAlert className="h-3.5 w-3.5" />
        ) : (
          <CheckCircle2 className="h-3.5 w-3.5" />
        )}
        Applied {state.applied}
        {bad ? ` · ${state.failed} failed` : ""}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleApply}
        disabled={state.status === "applying" || items.length === 0}
        className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
      >
        {state.status === "applying" ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Play className="h-3.5 w-3.5" />
        )}
        {state.status === "applying" ? "Applying…" : label}
      </button>
      {state.status === "error" ? (
        <span className="text-xs text-destructive">{state.message}</span>
      ) : null}
    </span>
  );
}

export default ApplyDirectiveButton;
