"use client";

/**
 * THE BLIND CHECK panel — KI-032's surface. The system re-answers keywords
 * the expert already ruled, COLD (zero human examples in the prompt), and
 * every disagreement becomes a decision: "mine stands" turns the expert's
 * reasoning into a proposed rule through the SAME rule-writer + approval
 * spine the trial uses; "the checker is right" restamps through the ONE
 * human write path. Logic in ./verify.ts; nothing here invents a mechanic.
 */

import { useCallback, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  CheckCircle2,
  Loader2,
  ShieldQuestion,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import { setKeywordStamps } from "@/features/marketing/seo/keyword-workbench/data";
import type { MatcherProposal } from "@/features/marketing/seo/value-system/suggestions/proposal";
import {
  listHumanRulings,
  previewMatcherReach,
  probeSiteMatchers,
  proposeKeywordMeaning,
} from "./data";
import {
  STAMP_PROPOSER_MANDATE,
  RULE_WRITER_MANDATE,
  coerceRuleProposals,
  coerceStampProposals,
  confirmationsPayload,
  correctionsPayload,
  dimensionCatalogPayload,
} from "./trial";
import {
  agreementsAsVerdicts,
  buildBlindCheck,
  checkerAnswers,
  mineStandsAsVerdicts,
  scoreBlindCheck,
  type BlindCheckRow,
} from "./verify";

const CHECK_BATCH = 20;

type Phase = "idle" | "checking" | "review" | "teaching" | "done";

export function VerifyPanel({
  siteId,
  siteLabel,
  organizationId,
  window,
  dimension,
  dimensions,
  onExit,
}: {
  siteId: string;
  siteLabel: string;
  organizationId: string | null;
  window: { start: string; end: string };
  dimension: FacetDimension;
  dimensions: FacetDimension[];
  onExit: () => void;
}) {
  const queryClient = useQueryClient();
  const agent = useHeadlessAgentJson();
  const [phase, setPhase] = useState<Phase>("idle");
  const [rows, setRows] = useState<BlindCheckRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [rulesSent, setRulesSent] = useState(0);

  const score = useMemo(() => scoreBlindCheck(rows), [rows]);

  const runCheck = useCallback(async () => {
    setPhase("checking");
    setNote(null);
    try {
      const rulings = await listHumanRulings({
        siteId,
        dimensionSlug: dimension.slug,
        start: window.start,
        end: window.end,
        limit: CHECK_BATCH,
      });
      if (rulings.length === 0) {
        setNote(
          "You have no rulings on this dimension yet — rule some keywords first, then come back and let the system argue with you.",
        );
        setPhase("idle");
        return;
      }
      const probe = await probeSiteMatchers(
        siteId,
        rulings.map((row) => row.keywordId),
      );
      // THE BLIND READ: zero human examples — the checker sees only the
      // keyword and the vocabulary. Agreement means the words carry it.
      const proposals = await agent.run({
        mandateKey: STAMP_PROPOSER_MANDATE,
        surfaceKey: "seo/ruling-session/blind-check",
        sourceFeature: "marketing",
        initiation: "user",
        organizationId,
        variables: {
          keywords_json: rulings.map((row) => ({
            keyword_id: row.keywordId,
            phrase: row.keyword,
            clicks: row.clicks,
            impressions: row.impressions,
          })),
          human_examples_json: [],
          dimension_catalog_json: dimensionCatalogPayload(
            dimensions,
            dimension.slug,
          ),
          matcher_hits_json: [],
          site_context: siteLabel,
        },
        coerce: coerceStampProposals,
      });
      const answers = checkerAnswers(rulings, probe, proposals, dimension);
      setRows(buildBlindCheck(rulings, answers));
      setPhase("review");
    } catch (error) {
      toast.error("The blind check could not run", {
        description: extractErrorMessage(error),
      });
      setPhase("idle");
    }
  }, [agent, dimension, dimensions, organizationId, siteId, siteLabel, window]);

  const decide = useCallback(
    (keywordId: string, decision: BlindCheckRow["decision"]) => {
      setRows((previous) =>
        previous.map((row) =>
          row.ruling.keywordId === keywordId ? { ...row, decision } : row,
        ),
      );
    },
    [],
  );

  const concede = useCallback(
    async (row: BlindCheckRow) => {
      if (!row.checker) return;
      try {
        await setKeywordStamps({
          siteId,
          keywordIds: [row.ruling.keywordId],
          valueId: row.checker.valueId,
          notes: `Conceded to the blind check: ${row.checker.reason}`,
        });
        decide(row.ruling.keywordId, "checker_right");
        toast.success(`Restamped “${row.ruling.keyword}” as ${row.checker.valueLabel}.`);
        await queryClient.invalidateQueries({ queryKey: ["marketing", "value"] });
      } catch (error) {
        toast.error("Could not restamp", {
          description: extractErrorMessage(error),
        });
      }
    },
    [decide, queryClient, siteId],
  );

  const teach = useCallback(async () => {
    setPhase("teaching");
    try {
      const verdicts = mineStandsAsVerdicts(rows);
      if (verdicts.length === 0) {
        setNote("Nothing to teach — no disagreement was ruled 'mine stands'.");
        setPhase("done");
        return;
      }
      const proposals = await agent.run({
        mandateKey: RULE_WRITER_MANDATE,
        surfaceKey: "seo/ruling-session/blind-check-teach",
        sourceFeature: "marketing",
        initiation: "user",
        organizationId,
        variables: {
          corrections_json: correctionsPayload(verdicts),
          confirmations_json: confirmationsPayload(agreementsAsVerdicts(rows)),
          dimension_catalog_json: dimensionCatalogPayload(
            dimensions,
            dimension.slug,
          ),
          existing_matchers_json: [],
        },
        coerce: (value) => coerceRuleProposals(value, dimension.slug),
      });
      if (proposals.length === 0) {
        setNote(
          "Your stands did not add up to a rule the system could state without breaking ones it already gets right. Nothing was proposed.",
        );
        setPhase("done");
        return;
      }
      const valuesByKey = new Map(
        dimension.values.map((value) => [value.key, value]),
      );
      let sent = 0;
      for (const proposal of proposals) {
        const value = valuesByKey.get(proposal.valueSlug) ?? null;
        let body: string | null = null;
        try {
          const reach = await previewMatcherReach({
            siteId,
            start: window.start,
            end: window.end,
            kind: proposal.matcherKind,
            pattern: proposal.pattern,
            valueId: value?.value_id ?? null,
            sample: 4,
          });
          body = `It reaches ${reach.keywords} searches in this window.`;
        } catch {
          body = null;
        }
        const matcherProposal: MatcherProposal = {
          proposal: "matcher",
          valueId: value?.value_id ?? "",
          dimensionSlug: dimension.slug,
          dimensionLabel: dimension.label,
          valueSlug: proposal.valueSlug,
          valueLabel: value?.label ?? proposal.valueSlug,
          matcherKind: proposal.matcherKind,
          pattern: proposal.pattern,
          notes: proposal.notes,
        };
        await proposeKeywordMeaning({
          siteId,
          proposal: matcherProposal,
          title: proposal.plainWords,
          body,
          reasoning: proposal.notes,
          provenance: { agentName: "Blind check — rule writer" },
        });
        sent += 1;
      }
      setRulesSent(sent);
      await queryClient.invalidateQueries({ queryKey: ["assists"] });
      setPhase("done");
    } catch (error) {
      setNote(`The rule writer could not run: ${extractErrorMessage(error)}.`);
      setPhase("done");
    }
  }, [agent, dimension, dimensions, organizationId, queryClient, rows, siteId, window]);

  const undecided = rows.filter(
    (row) => !row.agrees && row.checker && row.decision === "undecided",
  ).length;

  return (
    <section aria-label="Blind check" className="mx-auto flex w-full max-w-2xl flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onExit}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to the session
        </Button>
        {phase === "review" || phase === "done" ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            Agreed {score.agreed} / {score.checked}
            {score.silent > 0 ? ` · ${score.silent} no answer` : ""}
          </p>
        ) : null}
      </div>

      {phase === "idle" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
          <div className="flex items-start gap-2">
            <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs text-muted-foreground">
              The system re-answers your {CHECK_BATCH} highest-traffic{" "}
              <span className="font-medium text-foreground">{dimension.label}</span>{" "}
              rulings COLD — it is never shown your answers. Where it agrees, the
              keyword&apos;s own words carry your ruling. Where it disagrees, you
              decide: your ruling stands and becomes a proposed rule, or the
              checker was right and the stamp is corrected.
            </p>
          </div>
          {note ? <p className="text-xs text-warning">{note}</p> : null}
          <Button size="sm" className="self-start gap-1.5" onClick={() => void runCheck()}>
            <BrainCircuit className="h-4 w-4" /> Run the blind check
          </Button>
        </div>
      ) : null}

      {phase === "checking" ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Re-answering your rulings
          cold…
        </div>
      ) : null}

      {phase === "review" || phase === "teaching" || phase === "done" ? (
        <div className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <div
              key={row.ruling.keywordId}
              className={cn(
                "rounded-md border p-2 text-xs",
                row.agrees
                  ? "border-border bg-card"
                  : row.checker
                    ? "border-warning/40 bg-warning/5"
                    : "border-border bg-muted/30",
              )}
            >
              <div className="flex items-center gap-2">
                {row.agrees ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                ) : row.checker ? (
                  <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-warning" />
                ) : (
                  <ShieldQuestion className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="min-w-0 flex-1 truncate font-medium">
                  {row.ruling.keyword}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {row.ruling.clicks} clicks
                </span>
              </div>
              {row.agrees ? (
                <p className="mt-1 text-muted-foreground">
                  Both say <span className="font-medium text-foreground">{row.ruling.valueLabel}</span>
                  {row.checker?.source === "rule" ? " (your own rule reached it)" : " — cold, from the words alone"}
                </p>
              ) : row.checker ? (
                <div className="mt-1 flex flex-col gap-1">
                  <p>
                    You said <span className="font-medium">{row.ruling.valueLabel}</span>
                    {row.ruling.reason ? (
                      <span className="text-muted-foreground"> — “{row.ruling.reason}”</span>
                    ) : null}
                  </p>
                  <p>
                    The checker says <span className="font-medium">{row.checker.valueLabel}</span>
                    <span className="text-muted-foreground"> — {row.checker.reason}</span>
                  </p>
                  {row.decision === "undecided" && phase === "review" ? (
                    <div className="mt-1 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 gap-1 text-[11px]"
                        onClick={() => decide(row.ruling.keywordId, "mine_stands")}
                      >
                        <Check className="h-3 w-3" /> Mine stands — teach it
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 gap-1 text-[11px]"
                        onClick={() => void concede(row)}
                      >
                        <X className="h-3 w-3" /> The checker is right
                      </Button>
                    </div>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      {row.decision === "mine_stands"
                        ? "Your ruling stands — queued for the rule writer."
                        : row.decision === "checker_right"
                          ? "Restamped to the checker's answer."
                          : null}
                    </p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-muted-foreground">
                  The checker declined to answer this one cold — your ruling
                  stands unchallenged.
                </p>
              )}
            </div>
          ))}

          {phase === "review" ? (
            <Button
              size="sm"
              className="mt-1 self-start gap-1.5"
              disabled={undecided > 0}
              title={
                undecided > 0
                  ? `Decide the ${undecided} open disagreement(s) first.`
                  : "Turn your stands into proposed rules."
              }
              onClick={() => void teach()}
            >
              <BrainCircuit className="h-4 w-4" /> Finish — teach my stands
            </Button>
          ) : null}
          {phase === "teaching" ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Writing rules from
              your stands…
            </p>
          ) : null}
          {phase === "done" ? (
            <p className="text-xs text-muted-foreground">
              {rulesSent > 0
                ? `${rulesSent} rule proposal(s) sent for approval — they are in your Approvals queue.`
                : null}{" "}
              {note}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
