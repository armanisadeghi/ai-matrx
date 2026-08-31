"use client";

/**
 * BindingSuggestionsTab — the "AI map" tab of SurfaceAgentBindPanel.
 *
 * One button runs the `surfaces_client.binding_mapper` mandate agent (a
 * DB-defined structured agent — code holds only the mandate key) with the
 * surface's declared values + write targets and the target agent's
 * variable/context-mandate contract. The proposal renders as review rows the
 * user can accept into the manual mapping editor — nothing is ever applied
 * blindly, and the manual tab remains a full fallback.
 */

import { useMemo, useState } from "react";
import { CheckCheck, Loader2, Route, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { useMandate } from "@/features/mandates/useMandate";
import {
  HeadlessAgentRunError,
  useHeadlessAgentJson,
} from "@/features/agents/hooks/useHeadlessAgentJson";
import { selectAnswerText } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { sourceFeatureFromSurfaceName } from "@/features/agents/utils/source-feature-from-surface";
import { formatVariableDisplayName } from "@/features/agents/utils/variable-utils";
import {
  buildMapperVariables,
  describeSuggestion,
  parseMapperResult,
  suggestionSourceKeys,
  suggestionsToMappings,
  type BindingSuggestion,
  type MapperAgentInfo,
  type MapperProposal,
} from "@/features/surfaces/utils/binding-suggestions";
import { getSurfaceDisplayLabel } from "@/features/surfaces/utils/surface-display";
import type {
  SurfaceValue,
  SurfaceWriteTarget,
  ValueMappingMap,
  WritePolicyMap,
} from "@/features/surfaces/types";
import { cn } from "@/lib/utils";

export const BINDING_MAPPER_MANDATE_KEY = "surfaces_client.binding_mapper";

/**
 * THE DOMAIN'S NOUNS. The mechanic is one; the words belong to whoever hosts
 * it. A surface binding maps what a PAGE supplies; a job binding maps what a
 * JOB OFFERS — and "page value" on a mandate screen is simply wrong, in exactly
 * the way "shortcut" was wrong there. Same prop pattern the shared row already
 * uses for its four source labels (`SurfaceVariableBinding.sourceLabels`), so
 * this is a fifth call site, never a fifth component.
 */
export interface SuggestionWords {
  /** What the left-hand inventory is, singular ("page value" / "offered value"). */
  sourceNoun: string;
  /** What supplies it ("this page" / "this job"). */
  supplierNoun: string;
  /** The heading over the write-policy block. */
  actionsHeading: string;
  /** The intro sentence, before the run. */
  intro: (agentName: string) => string;
}

const SURFACE_WORDS: SuggestionWords = {
  sourceNoun: "page value",
  supplierNoun: "this page",
  actionsHeading: "Page actions this agent could drive",
  intro: () => "",
};

const CONFIDENCE_DOT: Record<string, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-red-400",
};

export interface BindingSuggestionsTabProps {
  surfaceName: string;
  agent: MapperAgentInfo;
  /** Declared + baseline values the manual editor also offers. */
  availableSurfaceValues: SurfaceValue[];
  writeTargets: readonly SurfaceWriteTarget[];
  /** Agent input names (variables + context policies) — the valid targets. */
  targetNames: readonly string[];
  disabled?: boolean;
  /** Domain wording. Omit for the surface wording. */
  words?: SuggestionWords;
  /**
   * D18.2 — may the proposal combine SEVERAL values into one input (joined in
   * order with a blank line)? A mandate consumption map can store that; a
   * surface binding cannot, and every extra the model proposes is discarded
   * and reported rather than silently dropped.
   */
  manyToOne?: boolean;
  /**
   * Accept the proposal: mappings replace the editor's current map; policy
   * suggestions merge into the binding's write-policy overrides. The host
   * switches to the manual tab so the user reviews/edits before saving.
   */
  onAccept: (
    mappings: ValueMappingMap,
    writePolicies: WritePolicyMap,
    /** The validated suggestions themselves — a host that can store more than
     * one source per input reads the combinations off these. */
    suggestions: readonly BindingSuggestion[],
  ) => void;
}

export function BindingSuggestionsTab({
  surfaceName,
  agent,
  availableSurfaceValues,
  writeTargets,
  targetNames,
  disabled = false,
  words = SURFACE_WORDS,
  manyToOne = false,
  onAccept,
}: BindingSuggestionsTabProps) {
  const surfaceLabel = getSurfaceDisplayLabel(surfaceName);
  // Resolution is DISPLAY-side here — it gates the affordance. The RUN goes
  // through THE MANDATE DOOR (`mandateKey` → `/ai/mandates/{key}`), where the
  // server resolves the Holder and applies the binding; the browser never
  // names an agent id and never echoes binding config back.
  const { error: mandateError } = useMandate(BINDING_MAPPER_MANDATE_KEY);
  const unavailable = mandateError !== null;
  const {
    run: runMandate,
    isRunning: running,
    activeRequestId,
  } = useHeadlessAgentJson();
  // The live answer length, straight off the run's own request — the same
  // "writing (N)" progress the drained-string runner used to count locally.
  const streamedChars = useAppSelector((state) =>
    activeRequestId ? selectAnswerText(activeRequestId)(state).length : 0,
  );
  const [proposal, setProposal] = useState<MapperProposal | null>(null);
  /**
   * 🚨 A FAILURE IS A REASON PLUS A REMEDY (P15, V2 finding G5b). This used to
   * be one string, and on a thrown run that string was the primitive's generic
   * "The agent failed before returning a result." — no reason, no next step,
   * on a run whose real cause was an HTTP 404 downgrade that then succeeded on
   * retry. So the state carries both halves: `message` is what happened, and
   * `detail` is the reason the run ACTUALLY gave. `detail` is never invented —
   * when it is absent the panel says so in those words.
   */
  const [runFailure, setRunFailure] = useState<{
    message: string;
    detail?: string;
  } | null>(null);

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
    setRunFailure(null);
    setProposal(null);
    try {
      const raw = await runMandate<string>({
        mandateKey: BINDING_MAPPER_MANDATE_KEY,
        surfaceKey: `mandate:${BINDING_MAPPER_MANDATE_KEY}`,
        sourceFeature:
          sourceFeatureFromSurfaceName(surfaceName) ?? "ai-results",
        expect: "text",
        initiation: "user",
        variables: buildMapperVariables({
          surfaceName,
          surfaceLabel,
          agent,
          surfaceValues: availableSurfaceValues,
          writeTargets,
          // The call site's own rule, in the model's words — the mapper reads
          // it and answers with one value or an ordered combination.
          combinationRule: manyToOne
            ? "Several values MAY be joined into one input: answer with an ordered surface_values list (2 or more names, most important first) when an input genuinely wants more than one of them."
            : "Exactly one value per input — never return surface_values.",
        }),
      });
      const parsed = parseMapperResult({
        raw,
        validTargets,
        validSurfaceValues: valueNames,
        validWriteTargets: writeTargetNames,
        sourceNoun: words.sourceNoun,
        allowManyToOne: manyToOne,
      });
      if (!parsed) {
        setRunFailure({
          message: "The mapping helper answered, but its answer could not be read.",
          detail:
            "It replied with something this panel could not turn into mappings — no valid input names came back.",
        });
        return;
      }
      setProposal(parsed);
    } catch (e) {
      // Nothing is swallowed: the run's own message is what the person is
      // told, and whatever technical reason came back with it rides underneath.
      setRunFailure({
        message:
          e instanceof Error ? e.message : "The mapping helper could not run.",
        ...(e instanceof HeadlessAgentRunError && e.detail
          ? { detail: e.detail }
          : {}),
      });
    }
  };

  const handleAccept = () => {
    if (!proposal) return;
    const policies: WritePolicyMap = {};
    for (const p of proposal.writePolicies) policies[p.target] = p.policy;
    // A proposal can survive validation with zero mappings (only policy
    // entries). Accepting must never wipe already-seeded mappings with an
    // empty map — the host only overwrites when there is something to apply.
    onAccept(
      suggestionsToMappings(proposal.suggestions),
      policies,
      proposal.suggestions,
    );
  };

  if (unavailable) {
    return (
      <p className="rounded-md border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        The AI mapping helper is not available right now
        {mandateError ? ` (${mandateError})` : ""}. Map values manually
        instead — nothing here is blocked by it.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!proposal && (
        <div className="rounded-md border border-border bg-card px-3 py-3 space-y-2">
          <p className="text-xs text-muted-foreground leading-relaxed">
            {words.intro(agent.name) || (
              <>
                The mapping helper reads what {words.supplierNoun} can supply,
                what {words.supplierNoun} can do, and what{" "}
                <span className="font-medium text-foreground">{agent.name}</span>{" "}
                needs — then proposes the full configuration for you to review.
              </>
            )}
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
                Analyzing {availableSurfaceValues.length} {words.sourceNoun}
                {availableSurfaceValues.length === 1 ? "" : "s"} ×{" "}
                {targetNames.length} inputs
                {streamedChars > 0 ? ` — writing (${streamedChars})` : "…"}
              </>
            ) : (
              <>
                <Route className="mr-1.5 h-3.5 w-3.5" />
                Suggest configuration
              </>
            )}
          </Button>
          {targetNames.length === 0 && (
            <p className="text-[10px] text-muted-foreground">
              This agent has no variables or context policies to map.
            </p>
          )}
        </div>
      )}

      {runFailure && (
        <div className="space-y-1.5 rounded-md border border-destructive/40 bg-destructive/5 px-2.5 py-2">
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {runFailure.message}
          </p>
          {/* THE REASON — the run's own, or the honest absence of one. Never a
              guess dressed as a diagnosis. */}
          <p className="pl-5 text-[10px] leading-snug text-muted-foreground">
            {runFailure.detail
              ? `Reason: ${runFailure.detail}`
              : "The run came back without a reason, so there is nothing more to tell you about why — it is often a momentary connection failure that succeeds on a second attempt."}
          </p>
          {/* THE REMEDY — both of them, on screen, not in a toast. */}
          <div className="flex flex-wrap items-center gap-2 pl-5 pt-0.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void handleSuggest()}
              disabled={disabled || running}
            >
              {running ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : null}
              Try again
            </Button>
            <span className="text-[10px] text-muted-foreground">
              or map the values yourself on the manual tab — it is always
              available, and nothing here is blocked by this.
            </span>
          </div>
        </div>
      )}

      {proposal && (
        <div className="space-y-2">
          <div className="space-y-1">
            {proposal.suggestions.map((s) => (
              <div
                key={s.target}
                className="rounded-md border border-border bg-card px-2.5 py-2"
              >
                {/* 🚨 THE PRIMARY READING IS THE HUMAN LABEL (G5a). This row
                    used to print the raw storage key — `rulebook_document`,
                    `From "system_prompt"` — two inches from the manual editor
                    printing "Rulebook Document". Same helper as the manual
                    side now, and no truncation: this panel has the room, and a
                    clipped input name is the one thing a reviewer must read in
                    full before accepting. The keys are not lost — they get
                    their own mono line below, where they are genuinely useful
                    for matching against the agent's contract. */}
                <div className="flex items-start gap-2">
                  <span
                    aria-label={`${s.confidence} confidence`}
                    title={`${s.confidence} confidence`}
                    className={cn(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      CONFIDENCE_DOT[s.confidence] ?? CONFIDENCE_DOT.low,
                    )}
                  />
                  <p className="min-w-0 flex-1 break-words text-xs font-medium">
                    {formatVariableDisplayName(s.target)}
                  </p>
                  <p className="shrink-0 text-[10px] text-muted-foreground">
                    {describeSuggestion(s)}
                  </p>
                </div>
                <p className="mt-0.5 pl-4 font-mono text-[10px] leading-snug text-muted-foreground/80 break-all">
                  {s.target}
                  {suggestionSourceKeys(s).length > 0
                    ? ` ← ${suggestionSourceKeys(s).join(" + ")}`
                    : ""}
                </p>
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
                {words.actionsHeading}
              </p>
              {proposal.writePolicies.map((p) => (
                <div
                  key={p.target}
                  className="rounded-md border border-border bg-card px-2.5 py-1.5"
                >
                  <p className="text-xs">
                    <span className="font-medium">
                      {formatVariableDisplayName(p.target)}
                    </span>
                    <span className="text-muted-foreground"> — {p.policy}</span>
                  </p>
                  <p className="font-mono text-[10px] leading-snug text-muted-foreground/80 break-all">
                    {p.target}
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
              {words.supplierNoun} or this agent does not have:{" "}
              {proposal.discarded.join("; ")}
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
