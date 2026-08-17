"use client";

/**
 * BindingSuggestionsTab — the "AI map" tab of SurfaceAgentBindPanel.
 *
 * One button runs the `surfaces_client.binding_mapper` slot agent (a
 * DB-defined structured agent — code holds only the slot key) with the
 * surface's declared values + write targets and the target agent's
 * variable/context-slot contract. The proposal renders as review rows the
 * user can accept into the manual mapping editor — nothing is ever applied
 * blindly, and the manual tab remains a full fallback.
 */

import { useMemo, useState } from "react";
import { CheckCheck, Loader2, Sparkles, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useSlotRunner } from "@/features/agents/slots/useSlotRunner";
import {
  buildMapperVariables,
  describeSuggestion,
  parseMapperResult,
  suggestionsToMappings,
  type MapperAgentInfo,
  type MapperProposal,
} from "@/features/surfaces/utils/binding-suggestions";
import type {
  SurfaceValue,
  SurfaceWriteTarget,
  ValueMappingMap,
  WritePolicyMap,
} from "@/features/surfaces/types";
import { cn } from "@/lib/utils";

export const BINDING_MAPPER_SLOT_KEY = "surfaces_client.binding_mapper";

const CONFIDENCE_DOT: Record<string, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-red-400",
};

export interface BindingSuggestionsTabProps {
  surfaceName: string;
  surfaceLabel: string;
  agent: MapperAgentInfo;
  /** Declared + baseline values the manual editor also offers. */
  availableSurfaceValues: SurfaceValue[];
  writeTargets: readonly SurfaceWriteTarget[];
  /** Agent input names (variables + context slots) — the valid targets. */
  targetNames: readonly string[];
  disabled?: boolean;
  /**
   * Accept the proposal: mappings replace the editor's current map; policy
   * suggestions merge into the binding's write-policy overrides. The host
   * switches to the manual tab so the user reviews/edits before saving.
   */
  onAccept: (mappings: ValueMappingMap, writePolicies: WritePolicyMap) => void;
}

export function BindingSuggestionsTab({
  surfaceName,
  surfaceLabel,
  agent,
  availableSurfaceValues,
  writeTargets,
  targetNames,
  disabled = false,
  onAccept,
}: BindingSuggestionsTabProps) {
  const { runSlot, running, unavailable, slotError } =
    useSlotRunner(BINDING_MAPPER_SLOT_KEY);
  const [streamedChars, setStreamedChars] = useState(0);
  const [proposal, setProposal] = useState<MapperProposal | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const valueNames = useMemo(
    () => new Set(availableSurfaceValues.map((v) => v.name)),
    [availableSurfaceValues],
  );
  const writeTargetNames = useMemo(
    () => new Set(writeTargets.map((t) => t.name)),
    [writeTargets],
  );
  const validTargets = useMemo(() => new Set(targetNames), [targetNames]);

  const handleSuggest = async () => {
    setRunError(null);
    setProposal(null);
    setStreamedChars(0);
    try {
      const raw = await runSlot({
        variables: buildMapperVariables({
          surfaceName,
          surfaceLabel,
          agent,
          surfaceValues: availableSurfaceValues,
          writeTargets,
        }),
        sourceApp: "matrx-frontend",
        sourceFeature: "surface-chrome",
        onChunk: (full) => setStreamedChars(full.length),
      });
      const parsed = parseMapperResult({
        raw,
        validTargets,
        validSurfaceValues: valueNames,
        validWriteTargets: writeTargetNames,
      });
      if (!parsed) {
        setRunError(
          "The mapping helper answered, but its answer could not be read. Try again, or map values manually.",
        );
        return;
      }
      setProposal(parsed);
    } catch (e) {
      setRunError(
        e instanceof Error ? e.message : "The mapping helper could not run.",
      );
    }
  };

  const handleAccept = () => {
    if (!proposal) return;
    const policies: WritePolicyMap = {};
    for (const p of proposal.writePolicies) policies[p.target] = p.policy;
    onAccept(suggestionsToMappings(proposal.suggestions), policies);
  };

  if (unavailable) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        The AI mapping helper is not available right now
        {slotError ? ` (${slotError})` : ""}. Map values manually below.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!proposal && (
        <div className="rounded-md border border-border bg-card px-3 py-3 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The mapping helper reads what this page can supply, what this page
            can do, and what <span className="font-medium text-foreground">{agent.name}</span>{" "}
            needs — then proposes the full configuration for you to review.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSuggest()}
            disabled={disabled || running || targetNames.length === 0}
          >
            {running ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Analyzing {availableSurfaceValues.length} page values ×{" "}
                {targetNames.length} inputs
                {streamedChars > 0 ? ` — writing (${streamedChars})` : "…"}
              </>
            ) : (
              <>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Suggest configuration
              </>
            )}
          </Button>
          {targetNames.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              This agent has no variables or context slots to map.
            </p>
          )}
        </div>
      )}

      {runError && (
        <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {runError}
        </p>
      )}

      {proposal && (
        <div className="space-y-2">
          <div className="space-y-1">
            {proposal.suggestions.map((s) => (
              <div
                key={s.target}
                className="rounded-md border border-border bg-card px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <span
                    aria-label={`${s.confidence} confidence`}
                    title={`${s.confidence} confidence`}
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      CONFIDENCE_DOT[s.confidence] ?? CONFIDENCE_DOT.low,
                    )}
                  />
                  <p className="min-w-0 flex-1 truncate text-xs font-medium">
                    {s.target}
                  </p>
                  <p className="shrink-0 text-[10px] text-muted-foreground">
                    {describeSuggestion(s)}
                  </p>
                </div>
                {s.reason && (
                  <p className="mt-1 pl-4 text-[10px] leading-snug text-muted-foreground">
                    {s.reason}
                  </p>
                )}
              </div>
            ))}
          </div>

          {proposal.writePolicies.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Page actions this agent could drive
              </p>
              {proposal.writePolicies.map((p) => (
                <div
                  key={p.target}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <p className="text-xs">
                    <span className="font-medium">{p.target}</span>
                    <span className="text-muted-foreground"> — {p.policy}</span>
                  </p>
                  {p.reason && (
                    <p className="text-[10px] leading-snug text-muted-foreground">
                      {p.reason}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {proposal.notes && (
            <p className="rounded-md bg-muted/40 px-2.5 py-2 text-[11px] leading-relaxed text-muted-foreground">
              {proposal.notes}
            </p>
          )}

          {proposal.discarded.length > 0 && (
            <p className="flex items-start gap-1.5 text-[10px] text-amber-600 dark:text-amber-500">
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              Skipped {proposal.discarded.length} suggestion
              {proposal.discarded.length === 1 ? "" : "s"} that named things
              this page or agent does not have: {proposal.discarded.join("; ")}
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={handleAccept} disabled={disabled}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Use this configuration
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleSuggest()}
              disabled={disabled || running}
            >
              {running ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Try again
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Accepting opens the mapping editor with everything filled in — you
            can still change any line before binding.
          </p>
        </div>
      )}
    </div>
  );
}
