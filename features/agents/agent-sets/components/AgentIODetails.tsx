// features/agents/agent-sets/components/AgentIODetails.tsx
//
// The agent I/O detail block (declared Inputs + Output shape) shared by the
// member inspector and the orchestrator inspector. Lazy-loads the full agent
// definition on demand (variables + output schema are NOT on the list row).
// One implementation so the two inspectors can never drift.

"use client";

import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectAgentVariableDefinitions,
  selectAgentOutputSchema,
  selectAgentReadyForBuilder,
} from "@/features/agents/redux/agent-definition/selectors";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { accentClasses } from "./accents";
import type { SetAccent } from "../constants";

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
  accent: SetAccent;
}) {
  const dispatch = useAppDispatch();
  const a = accentClasses(accent);
  const ready = useAppSelector((s) => selectAgentReadyForBuilder(s, agentId));
  const variableDefs = useAppSelector((s) => selectAgentVariableDefinitions(s, agentId));
  const outputSchema = useAppSelector((s) => selectAgentOutputSchema(s, agentId));

  // Lazy-load the full definition (variables + output schema are NOT in the list row).
  useEffect(() => {
    if (!ready) dispatch(fetchFullAgent(agentId));
  }, [ready, agentId, dispatch]);

  const outputProps = outputSchema?.schema?.properties
    ? Object.entries(outputSchema.schema.properties)
    : [];
  const requiredOut = new Set(outputSchema?.schema?.required ?? []);

  return (
    <>
      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Inputs</div>
        {!ready ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : !variableDefs || variableDefs.length === 0 ? (
          <div className="text-xs text-muted-foreground/70">No declared inputs.</div>
        ) : (
          <div className="space-y-1.5">
            {variableDefs.map((v) => (
              <div key={v.name} className="rounded-md border border-border bg-muted/30 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                  <code className="text-[11px] font-semibold text-foreground">{v.name}</code>
                  {v.required && (
                    <span className={cn("rounded px-1 text-[9px] font-semibold", a.soft, a.text)}>
                      required
                    </span>
                  )}
                </div>
                {v.helpText && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {v.helpText}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="text-xs font-medium text-muted-foreground">Output</div>
        {!ready ? (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : outputProps.length === 0 ? (
          <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-[11px] text-muted-foreground">
            Text
          </div>
        ) : (
          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-2">
            {outputProps.map(([field, def]) => (
              <div key={field} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex items-center gap-1 truncate">
                  <code className="font-semibold text-foreground">{field}</code>
                  {requiredOut.has(field) && <span className={cn("text-[9px]", a.text)}>*</span>}
                </span>
                <span className="shrink-0 font-mono text-muted-foreground">{propType(def)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
