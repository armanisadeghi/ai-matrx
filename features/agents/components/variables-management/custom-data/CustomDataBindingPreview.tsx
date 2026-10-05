"use client";

/**
 * "What the agent will see" for a custom-data binding — the server's own
 * resolution (aidream `POST /agents/variable-bindings/preview`), shown in the
 * variable editor and in the run form's locked chip. Until the server route is
 * live it says so calmly; it never invents text.
 */

import { useEffect, useRef, useState } from "react";
import { Eye, Loader2, RotateCw } from "lucide-react";
import type { CustomDataBinding } from "@ai-matrx/chat/agents/types/agent-definition.types";
import {
  previewVariableBinding,
  type VariableBindingPreview,
} from "@ai-matrx/chat/agents/services/variable-binding-preview.service";
import { isCompleteBinding } from "./customDataBinding";
import { sharedCustomDataSource, useCustomDataOrganizationId } from "./CustomDataRecordsScope";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@ai-matrx/kit/text";
import { InfoHint } from "@/components/official/InfoHint";

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
  // Inside a CustomDataRecordsScope the Table's organization is known; outside one (the run
  // form's locked chip) the preview asks where the Table opens itself. Before 2026-10-05 it
  // waited for a scope that was never there and said "Reading your data…" forever.
  const scoped = useCustomDataOrganizationId();
  const opens = useObjectOrganization(
    sharedCustomDataSource(),
    scoped ? null : binding.table_id || null,
  );
  const organizationId =
    scoped ?? (opens.state === "found" ? opens.organizationId : null);
  const complete = isCompleteBinding(binding);
  const key = JSON.stringify(binding);
  // The request reads the binding through a ref: the effect re-runs on the binding's CONTENT
  // (`key`), never on a parent handing a fresh object each render — that reset the debounce
  // timer on every render, so the request never left.
  const bindingRef = useRef(binding);
  bindingRef.current = binding;
  const [result, setResult] = useState<{
    key: string;
    state: PreviewState;
  } | null>(null);
  // Bumped by Refresh and by the person coming back to the page (the data may
  // have changed elsewhere). Event-driven — never polling.
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const again = () => {
      if (document.visibilityState === "visible") setRevision((n) => n + 1);
    };
    window.addEventListener("focus", again);
    document.addEventListener("visibilitychange", again);
    return () => {
      window.removeEventListener("focus", again);
      document.removeEventListener("visibilitychange", again);
    };
  }, []);

  useEffect(() => {
    if (!complete || !organizationId) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setResult({ key, state: { status: "loading" } });
      previewVariableBinding(organizationId, bindingRef.current, {
        variableName,
        signal: controller.signal,
      })
        .then((state) => setResult({ key, state }))
        .catch((err: unknown) => {
          // Only an abort (a newer edit superseded this request) is silent.
          if (err instanceof DOMException && err.name === "AbortError") return;
          setResult({
            key,
            state: {
              state: "error",
              message:
                err instanceof Error
                  ? err.message
                  : "The preview could not be loaded.",
            },
          });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, complete, organizationId, variableName, revision]);

  const state: PreviewState = !complete
    ? { status: "incomplete" }
    : !organizationId && (opens.state === "not-given" || opens.state === "unavailable")
      ? {
          state: "error",
          message:
            opens.state === "not-given"
              ? "You can't open this table"
              : `Where this table lives could not be read: ${opens.why}`,
        }
    : result && result.key === key
      ? result.state
      : { status: "loading" };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 type-secondary font-medium text-foreground">
        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
        What the agent will see
        {complete && (
          <button
            type="button"
            onClick={() => setRevision((n) => n + 1)}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <RotateCw className="h-3 w-3" />
            Refresh
          </button>
        )}
      </div>
      {"status" in state ? (
        state.status === "incomplete" ? (
          <p className="type-meta text-muted-foreground">
            Finish the choices above
          </p>
        ) : (
          <p className="inline-flex items-center gap-1.5 type-meta text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Reading your data…
          </p>
        )
      ) : state.state === "unavailable" ? (
        // The preview route is live; a 404/405 now means a real fault.
        <p className="type-meta text-destructive">
          Preview failed (not found){" "}
          <ErrorAlchemyMenu error="Binding preview returned 404" />
        </p>
      ) : state.state === "error" ? (
        <p className="type-meta text-destructive">
          {state.message} <ErrorAlchemyMenu error={state.message} />
        </p>
      ) : (
        <>
          {state.outcome === "absent" && (
            <p className="inline-flex items-center gap-1 type-meta text-warning">
              No data — the agent is told:
              {state.absentReason && (
                <InfoHint text={asClause(state.absentReason)} label="Why" />
              )}
            </p>
          )}
          {state.outcome === "blocks_run" && (
            <p className="type-meta text-warning">
              No data — the run would stop
            </p>
          )}
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/50 p-2 font-mono type-meta text-foreground">
            {state.text}
          </pre>
          {state.outcome === "delivered" &&
            state.rowCount !== null &&
            state.notes.length === 0 && (
              <p className="type-meta text-muted-foreground">
                {state.rowCount} {state.rowCount === 1 ? "row" : "rows"}
                {state.totalRows !== null && state.totalRows > state.rowCount
                  ? ` of ${state.totalRows}`
                  : ""}
                {state.truncated && " · cut short at your row limit"}
              </p>
            )}
          {state.sourceNote && (
            <p className="type-meta text-muted-foreground">
              {state.sourceNote}
            </p>
          )}
          {state.withheld.length > 0 && (
            <p className="type-meta text-muted-foreground">
              Hidden from you: {state.withheld.join(", ")}
            </p>
          )}
          {state.notes.map((note) => (
            <p key={note} className="type-meta text-muted-foreground">
              {note}
            </p>
          ))}
        </>
      )}
    </div>
  );
}
