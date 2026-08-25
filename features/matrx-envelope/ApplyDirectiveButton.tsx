"use client";

/**
 * "Apply" for a side-effect Kind Directive that arrived as CONTENT.
 *
 * THE POSITION RULE, honoured exactly: a directive inside content NEVER
 * auto-executes (MATRX_ENVELOPE.md) — that is the guard against untrusted
 * content mutating things. But "does not auto-execute" was never meant to be
 * "is inert": the user seeing it must be able to say yes. This button IS that
 * yes, and it is the same semantic as approving an `ask`-policy proposal.
 *
 * It posts the two-key shell to `POST /directives/confirm` (`confirmDirective`),
 * which re-validates every item against the item model registered for that SLUG
 * and applies it through the ONE server handler, running as the user under RLS.
 * `proposal_id` is optional there, so an envelope the server never proposed
 * (e.g. one a text-mode agent wrote into its reply, where the structured-output
 * dispatcher never fired) applies through the identical path.
 *
 * Idempotency comes from the handlers themselves (plan_tree is get-or-create by
 * site+parent+slug), so a double-click cannot duplicate rows.
 */

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Play, TriangleAlert } from "lucide-react";

import type { DecodedDirective } from "@/features/content-ir/directives/decode";
import { confirmDirective } from "@/features/directive-catalog/service";
import { BackendApiError } from "@/lib/api/errors";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";

type ApplyState =
  | { status: "idle" }
  | { status: "applying" }
  | { status: "applied"; applied: number; failed: number }
  | { status: "error"; message: string };

export interface ApplyDirectiveButtonProps {
  directive: DecodedDirective;
  /** Optional label override, e.g. "Apply plan". */
  label?: string;
  /** How many things this will write — shown during the wait so a long apply
   *  reads as "working on 219 pages", never as a frozen spinner. */
  itemCount?: number;
  onApplied?: () => void;
}

export function ApplyDirectiveButton({
  directive,
  label = "Apply",
  itemCount,
  onApplied,
}: ApplyDirectiveButtonProps) {
  const baseUrl = useAppSelector(selectResolvedBaseUrl);
  const [state, setState] = useState<ApplyState>({ status: "idle" });
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  // An honest clock beats a fake progress bar: the server does not stream
  // per-row progress, so we report the ONE thing we actually know.
  useEffect(() => {
    if (state.status !== "applying") return;
    startedAt.current = Date.now();
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - (startedAt.current ?? 0)) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [state.status]);

  // THE POSITION LAW, asked ONCE. Only a side-effect class is applicable; a
  // reference / view / validation / secret never is. Before the merge this was a
  // hand-kept list of two envelope kinds that had to agree with three other
  // hand-kept lists on the server; now it is the same derived predicate the
  // server uses, read off the parsed slug.
  if (!directive.parsed.executes) return null;

  const items = directive.items;

  async function handleApply() {
    setState({ status: "applying" });
    try {
      const result = await confirmDirective(baseUrl, {
        // The SLUG is the identity — one field, one name for the thing. The
        // server's DirectiveConfirmRequest rejects a request that does not say
        // exactly what it is confirming rather than guessing at it.
        directive: directive.slug,
        items,
      });
      setState({
        status: "applied",
        applied: result.applied,
        failed: result.failed,
      });
      onApplied?.();
    } catch (error) {
      // Prefer the server's gentle user_message; never dump Pydantic/wire detail.
      const message =
        error instanceof BackendApiError
          ? error.userMessage
          : error instanceof Error
            ? error.message
            : "That couldn't be applied just now. Please try again.";
      setState({ status: "error", message });
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
        {state.status === "applying"
          ? `Applying${itemCount ? ` ${itemCount} pages` : ""}…${elapsed ? ` ${elapsed}s` : ""}`
          : label}
      </button>
      {state.status === "error" ? (
        <span className="inline-flex max-w-sm items-start gap-1 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{state.message}</span>
        </span>
      ) : null}
    </span>
  );
}

export default ApplyDirectiveButton;
