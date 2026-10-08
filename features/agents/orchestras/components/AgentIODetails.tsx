// features/agents/orchestras/components/AgentIODetails.tsx
//
// The agent I/O detail block (declared Inputs + Output shape) shared by the
// member inspector and the conductor inspector. Lazy-loads the full agent
// definition on demand (variables + output schema are NOT on the list row).
// One implementation so the two inspectors can never drift.

"use client";

import { useEffect, useState } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentVariableDefinitions,
  selectAgentOutputSchema,
  selectAgentReadyForBuilder,
} from "@ai-matrx/chat/agents/redux/agent-definition/selectors";
import {
  fetchFullAgent,
} from "@/features/agents/redux/fetch-full-agent.thunk";
import { ReadFailure } from "@ai-matrx/design-system";
import { accentClasses } from "./accents";
import type { OrchestraAccent } from "../constants";
import { variableRunLabel } from "@ai-matrx/agents";

/** Render one JSON-schema property's type as a short label. */
function propType(def: unknown): string {
  if (def && typeof def === "object" && "type" in def) {
    const t = (def as { type?: unknown }).type;
    if (Array.isArray(t)) return t.join(" | ");
    if (typeof t === "string") return t;
  }
  return "any";
}

export function AgentIODetails({
  agentId,
  accent,
}: {
  agentId: string;
  accent: OrchestraAccent;
}) {
  const dispatch = useAppDispatch();
  const a = accentClasses(accent);
  const ready = useAppSelector((s) => selectAgentReadyForBuilder(s, agentId));
  const variableDefs = useAppSelector((s) =>
    selectAgentVariableDefinitions(s, agentId),
  );
  const outputSchema = useAppSelector((s) =>
    selectAgentOutputSchema(s, agentId),
  );

  // Lazy-load the full definition (variables + output schema are NOT in the list row).
  // The full-definition read's failure, so neither block spins forever over it.
  const [agentReadError, setAgentReadError] = useState<unknown>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  useEffect(() => {
    if (ready) return;
    dispatch(fetchFullAgent(agentId))
      .unwrap()
      .then(() => setAgentReadError(null))
      .catch((err: unknown) => setAgentReadError(err ?? true));
  }, [ready, agentId, dispatch, readAttempt]);
  const retryAgentRead = () => {
    setAgentReadError(null);
    setReadAttempt((n) => n + 1);
  };

  const outputProps = outputSchema?.schema?.properties
    ? Object.entries(outputSchema.schema.properties)
    : [];
  const requiredOut = new Set(outputSchema?.schema?.required ?? []);

  return (
    <>
      <div className="space-y-1.5">
        <div className="type-secondary font-medium text-muted-foreground">Inputs</div>
        {!ready && agentReadError ? (
          <ReadFailure error={agentReadError} what="this agent's inputs" onRetry={retryAgentRead} className="m-0" />
        ) : !ready ? (
          <div className="type-secondary text-muted-foreground">
            <SuspenseLoader
              centered={false}
              size="xs"
              message="Loading agent inputs…"
            />
          </div>
        ) : !variableDefs || variableDefs.length === 0 ? (
          <div className="type-secondary text-muted-foreground/70">
            No declared inputs.
          </div>
        ) : (
          <div className="space-y-1.5">
            {variableDefs.map((v) => (
              <div
                key={v.name}
                className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
              >
                <div className="flex items-center gap-1.5">
                  <span className="type-meta font-semibold text-foreground">
                    {variableRunLabel(v)}
                  </span>
                  {v.required && (
                    <span
                      className={cn(
                        "rounded px-1 text-[9px] font-semibold",
                        a.soft,
                        a.text,
                      )}
                    >
                      required
                    </span>
                  )}
                </div>
                {v.helpText && (
                  <p className="mt-0.5 line-clamp-2 type-meta leading-snug text-muted-foreground">
                    {v.helpText}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="type-secondary font-medium text-muted-foreground">Output</div>
        {!ready && agentReadError ? (
          <ReadFailure error={agentReadError} what="this agent's output shape" onRetry={retryAgentRead} className="m-0" />
        ) : !ready ? (
          <div className="type-secondary text-muted-foreground">
            <SuspenseLoader
              centered={false}
              size="xs"
              message="Loading agent output…"
            />
          </div>
        ) : outputProps.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 type-meta text-muted-foreground">
            Text
          </div>
        ) : (
          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2">
            {outputProps.map(([field, def]) => (
              <div
                key={field}
                className="flex items-center justify-between gap-2 type-meta"
              >
                <span className="flex items-center gap-1 truncate">
                  <code className="font-semibold text-foreground">{field}</code>
                  {requiredOut.has(field) && (
                    <span className={cn("text-[9px]", a.text)}>*</span>
                  )}
                </span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {propType(def)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
