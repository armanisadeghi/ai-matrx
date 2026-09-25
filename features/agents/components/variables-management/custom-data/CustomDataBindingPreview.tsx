"use client";

/**
 * "What the agent will see" for a custom-data binding — the server's own
 * resolution (aidream `POST /agents/variable-bindings/preview`), shown in the
 * variable editor and in the run form's locked chip. Until the server route is
 * live it says so calmly; it never invents text.
 */

import { useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import type { CustomDataBinding } from "@/features/agents/types/agent-definition.types";
import {
  previewVariableBinding,
  type VariableBindingPreview,
} from "@/features/agents/services/variable-binding-preview.service";
import { isCompleteBinding } from "./customDataBinding";
import { useCustomDataOrganizationId } from "./CustomDataRecordsScope";

/** Quiet time before the preview re-asks the server after an edit. */
const PREVIEW_DEBOUNCE_MS = 500;

type PreviewState =
  { status: "incomplete" } | { status: "loading" } | VariableBindingPreview;

/**
 * "What the agent will see" — the server's own resolution of this binding.
 * Until the server route is live it says so calmly; it never invents text.
 */
export function CustomDataBindingPreview({
  binding,
  variableName,
}: {
  binding: CustomDataBinding;
  variableName?: string;
}) {
  const organizationId = useCustomDataOrganizationId();
  const complete = isCompleteBinding(binding);
  const key = JSON.stringify(binding);
  const [result, setResult] = useState<{
    key: string;
    state: PreviewState;
  } | null>(null);

  useEffect(() => {
    if (!complete || !organizationId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult({ key, state: { status: "loading" } });
      previewVariableBinding(organizationId, binding, {
        variableName,
        signal: controller.signal,
      })
        .then((state) => setResult({ key, state }))
        .catch(() => {
          // Aborted — a newer edit superseded this request.
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, complete, organizationId, binding, variableName]);

  const state: PreviewState = !complete
    ? { status: "incomplete" }
    : result && result.key === key
      ? result.state
      : { status: "loading" };

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background p-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        What the agent will see
      </div>
      {"status" in state ? (
        state.status === "incomplete" ? (
          <p className="text-[11px] text-muted-foreground">
            Finish choosing above and the preview appears here.
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading your data…
          </p>
        )
      ) : state.state === "unavailable" ? (
        <p className="text-[11px] text-muted-foreground">
          Preview available once the server update is live. Your binding is
          saved and will be read at run time.
        </p>
      ) : state.state === "error" ? (
        <p className="text-[11px] text-destructive">{state.message}</p>
      ) : (
        <>
          {!state.present && (
            <p className="text-[11px] text-amber-700 dark:text-amber-300">
              No data right now
              {state.absentReason ? ` — ${state.absentReason}` : ""}. This is
              what the agent is told instead:
            </p>
          )}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono text-[11px] text-foreground">
            {state.text}
          </pre>
          {state.present && state.rowCount !== null && (
            <p className="text-[11px] text-muted-foreground">
              {state.rowCount} {state.rowCount === 1 ? "row" : "rows"}
              {state.totalRows !== null && state.totalRows > state.rowCount
                ? ` of ${state.totalRows}`
                : ""}
              {state.truncated && " · cut short at your row limit"}
            </p>
          )}
          {state.withheld.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              Hidden from you, so not shown: {state.withheld.join(", ")}
            </p>
          )}
          {state.notes.map((note) => (
            <p key={note} className="text-[11px] text-muted-foreground">
              {note}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
