"use client";

/**
 * THE IPHONE MOMENT — "let the system try the next twenty".
 *
 * Arman, 2026-08-24: *"Almost exactly like the way the iPhone works where it
 * asks you to name people… you basically select the ones where it's wrong, and
 * we could very much do the same thing so that we're sort of reinforcing some
 * rules, and then the AI maybe sort of helps rewrite the rules — because it's
 * not that we want the AI in that conversation to get better at this. We want
 * our RULES to get better so that we can always identify these going forward."*
 *
 * The order of operations is load-bearing:
 *
 *   1. THE SITE'S OWN RULES ANSWER FIRST (`gsc_ruling_session_matcher_probe`).
 *      Anything a deterministic matcher already explains is never sent to a
 *      model — that would be paying an LLM to re-derive arithmetic.
 *   2. The AI answers ONLY where the rules were silent, by MANDATE
 *      (`seo.session_stamp_proposer`), learning from the reasons the person
 *      just typed.
 *   3. The person taps ONLY the wrong ones. Everything reads as right until
 *      they say otherwise — that is the whole gesture being borrowed.
 *   4. The corrections become RULE PROPOSALS (`seo.session_rule_writer`),
 *      routed through the C9 suggestion spine so NOTHING lands unapproved
 *      (P12), each carrying what it would actually catch — measured server-side
 *      against the same predicate the engine uses.
 *   5. The loop closes with the engine actually running, and the real numbers
 *      reported, good or bad.
 *
 * Every stamp this panel writes goes through `setKeywordStamps`, the same RPC a
 * person clicking a cell uses. This component owns no write path.
 */

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BrainCircuit,
  Check,
  Gavel,
  Loader2,
  Pencil,
  Play,
  ShieldCheck,
  Wand2,
} from "lucide-react";

import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { useHeadlessAgentJson } from "@/features/agents/hooks/useHeadlessAgentJson";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import { setKeywordStamps } from "@/features/marketing/seo/keyword-workbench/data";
import {
  DimensionValuePicker,
  type PickedValue,
} from "@/features/marketing/seo/keyword-workbench/components/DimensionValuePicker";
import type { MatcherProposal } from "@/features/marketing/seo/value-system/suggestions/proposal";
import {
  getRulingSessionQueue,
  previewMatcherReach,
  probeSiteMatchers,
  proposeKeywordMeaning,
  runSiteMatchers,
  type MatcherReach,
  type MatcherRunResult,
} from "./data";
import {
  RULE_WRITER_MANDATE,
  STAMP_PROPOSER_MANDATE,
  coerceRuleProposals,
  coerceStampProposals,
  confirmationsPayload,
  correctionsPayload,
  dimensionCatalogPayload,
  humanExamplesPayload,
  matcherHitsPayload,
  matcherKindWords,
  proposalsFromMatchers,
  scoreTrial,
  type AgentRuleProposal,
  type SessionRuling,
  type TrialProposal,
  type TrialScore,
  type TrialVerdict,
} from "./trial";

type Phase = "gathering" | "review" | "teaching" | "rules";

interface RuleCard {
  proposal: AgentRuleProposal;
  valueId: string | null;
  reach: MatcherReach | null;
  reachError: string | null;
  sent: boolean;
}

export function TrialPanel({
  siteId,
  siteLabel,
  organizationId,
  window,
  dimension,
  dimensions,
  rulings,
  exclude,
  batchSize,
  onExit,
  onStamped,
}: {
  siteId: string;
  siteLabel: string;
  organizationId: string | null;
  window: { start: string; end: string };
  /** The dimension the person has been ruling — the one the trial answers. */
  dimension: FacetDimension;
  /** The full catalog, so a correction can still invent a new value (P23). */
  dimensions: FacetDimension[];
  rulings: SessionRuling[];
  exclude: string[];
  batchSize: number;
  onExit: (seenKeywordIds: string[]) => void;
  onStamped: (count: number) => void;
}) {
  const queryClient = useQueryClient();
  const agent = useHeadlessAgentJson();

  const [phase, setPhase] = useState<Phase>("gathering");
  const [gatherError, setGatherError] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<TrialVerdict[]>([]);
  const [score, setScore] = useState<TrialScore | null>(null);
  const [rules, setRules] = useState<RuleCard[]>([]);
  const [ruleNote, setRuleNote] = useState<string | null>(null);
  const [engine, setEngine] = useState<MatcherRunResult | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);

  // One gather per mount. A second pass would re-ask the model for keywords the
  // person is already looking at — and charge for it.
  const gathered = useRef(false);

  useEffect(() => {
    if (gathered.current) return;
    gathered.current = true;
    void gather();
    // The panel is mounted already committed to one trial; nothing it depends
    // on can change underneath it without unmounting first.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function gather() {
    setGatherError(null);
    try {
      const queue = await getRulingSessionQueue(
        siteId,
        window.start,
        window.end,
        batchSize,
        exclude,
      );
      if (queue.rows.length === 0) {
        setGatherError(
          "There is nothing left in this window with no meaning on it — the trial has nothing to try.",
        );
        setPhase("review");
        return;
      }

      const probe = await probeSiteMatchers(
        siteId,
        queue.rows.map((row) => row.keywordId),
      );
      const fromRules = proposalsFromMatchers(queue.rows, probe, dimension.slug);
      const explained = new Set(fromRules.map((p) => p.keywordId));
      const silent = queue.rows.filter((row) => !explained.has(row.keywordId));

      let fromAi: TrialProposal[] = [];
      if (silent.length > 0) {
        try {
          const proposals = await agent.run({
            mandateKey: STAMP_PROPOSER_MANDATE,
            surfaceKey: "seo/ruling-session/stamp-proposer",
            sourceFeature: "marketing",
            initiation: "user",
            organizationId,
            variables: {
              keywords_json: silent.map((row) => ({
                keyword_id: row.keywordId,
                phrase: row.keyword,
                clicks: row.clicks,
                impressions: row.impressions,
              })),
              human_examples_json: humanExamplesPayload(rulings),
              dimension_catalog_json: dimensionCatalogPayload(
                dimensions,
                dimension.slug,
              ),
              matcher_hits_json: matcherHitsPayload(fromRules),
              site_context: siteLabel,
            },
            coerce: coerceStampProposals,
          });
          const byId = new Map(silent.map((row) => [row.keywordId, row]));
          const values = new Map(
            dimension.values.map((value) => [value.key, value]),
          );
          fromAi = proposals.flatMap((proposal) => {
            const row = byId.get(proposal.keywordId);
            const value = values.get(proposal.valueSlug);
            if (!row || !value) return [];
            return [
              {
                keywordId: row.keywordId,
                keyword: row.keyword,
                clicks: row.clicks,
                impressions: row.impressions,
                source: "ai" as const,
                valueId: value.value_id,
                valueSlug: value.key,
                valueLabel: value.label,
                reason: proposal.reason,
              },
            ];
          });
        } catch (error) {
          // A silent AI is not a broken trial: the rules still answered, and
          // saying so is more useful than an empty screen.
          setAiNote(
            `The rules answered ${fromRules.length}; the assistant could not answer the other ${silent.length} (${extractErrorMessage(error)}).`,
          );
        }
      }

      const all = [...fromRules, ...fromAi].sort(
        (a, b) => b.clicks - a.clicks || b.impressions - a.impressions,
      );
      const unanswered =
        queue.rows.length - all.length > 0
          ? queue.rows.length - all.length
          : 0;
      if (unanswered > 0 && !aiNote) {
        setAiNote(
          `${unanswered} of these ${queue.rows.length} got no answer at all — neither your rules nor the assistant would commit to one. They stay unruled.`,
        );
      }
      setVerdicts(
        all.map((proposal) => ({ proposal, status: "right" as const })),
      );
      setPhase("review");
    } catch (error) {
      setGatherError(extractErrorMessage(error));
      setPhase("review");
    }
  }

  const seenIds = verdicts.map((verdict) => verdict.proposal.keywordId);

  function markWrong(keywordId: string) {
    setVerdicts((previous) =>
      previous.map((verdict) =>
        verdict.proposal.keywordId === keywordId
          ? { ...verdict, status: "wrong" as const }
          : verdict,
      ),
    );
    setCorrecting(keywordId);
  }

  function markRight(keywordId: string) {
    setVerdicts((previous) =>
      previous.map((verdict) =>
        verdict.proposal.keywordId === keywordId
          ? {
              proposal: verdict.proposal,
              status: "right" as const,
            }
          : verdict,
      ),
    );
    if (correcting === keywordId) setCorrecting(null);
  }

  function correct(keywordId: string, picked: PickedValue) {
    setVerdicts((previous) =>
      previous.map((verdict) =>
        verdict.proposal.keywordId === keywordId
          ? {
              ...verdict,
              status: "wrong" as const,
              correctedValueId: picked.valueId,
              correctedValueSlug: slugKeyOf(picked, dimensions),
              correctedValueLabel: picked.valueLabel,
            }
          : verdict,
      ),
    );
  }

  function setCorrectionReason(keywordId: string, reason: string) {
    setVerdicts((previous) =>
      previous.map((verdict) =>
        verdict.proposal.keywordId === keywordId
          ? { ...verdict, correctionReason: reason }
          : verdict,
      ),
    );
  }

  /**
   * SAVE, then TEACH. The stamps are written through the ordinary human path;
   * the rule proposals are the point of the exercise and are attempted even
   * when nothing was wrong (a batch that was entirely right can still be worth
   * a rule, and the writer is free to answer "none").
   */
  const finish = useMutation({
    mutationFn: async () => {
      const wrongWithoutValue = verdicts.filter(
        (verdict) => verdict.status === "wrong" && !verdict.correctedValueId,
      );
      if (wrongWithoutValue.length > 0) {
        throw new Error(
          `Say what ${wrongWithoutValue.length === 1 ? "that one" : `those ${wrongWithoutValue.length}`} should be before saving — a keyword marked wrong with no answer teaches nothing.`,
        );
      }

      // Group by the value that will actually be stamped: one write per value,
      // never one per keyword.
      const groups = new Map<string, { ids: string[]; reasons: string[] }>();
      for (const verdict of verdicts) {
        const valueId =
          verdict.status === "wrong"
            ? (verdict.correctedValueId ?? verdict.proposal.valueId)
            : verdict.proposal.valueId;
        const reason =
          verdict.status === "wrong"
            ? (verdict.correctionReason ?? "").trim()
            : "";
        const group = groups.get(valueId);
        if (group) {
          group.ids.push(verdict.proposal.keywordId);
          if (reason) group.reasons.push(reason);
        } else {
          groups.set(valueId, {
            ids: [verdict.proposal.keywordId],
            reasons: reason ? [reason] : [],
          });
        }
      }

      let written = 0;
      for (const [valueId, group] of groups) {
        const result = await setKeywordStamps({
          siteId,
          keywordIds: group.ids,
          valueId,
          notes:
            group.reasons.length > 0
              ? group.reasons.join(" · ")
              : "Confirmed in a ruling session — the system proposed it and you agreed.",
        });
        written += result.written;
      }
      return written;
    },
    onSuccess: async (written) => {
      onStamped(written);
      setScore(scoreTrial(verdicts));
      setPhase("teaching");
      await queryClient.invalidateQueries({ queryKey: ["marketing", "value"] });
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "seo", "keyword-stamps", siteId],
      });
      await teach();
    },
    onError: (error) => {
      toast.error("Could not save these", {
        description: extractErrorMessage(error),
      });
    },
  });

  /** THE POINT: corrections become RULES, proposed — never written (P12). */
  async function teach() {
    setRuleNote(null);
    try {
      const corrections = correctionsPayload(verdicts);
      const proposals = await agent.run({
        mandateKey: RULE_WRITER_MANDATE,
        surfaceKey: "seo/ruling-session/rule-writer",
        sourceFeature: "marketing",
        initiation: "user",
        organizationId,
        variables: {
          corrections_json: corrections,
          confirmations_json: confirmationsPayload(verdicts),
          dimension_catalog_json: dimensionCatalogPayload(
            dimensions,
            dimension.slug,
          ),
          existing_matchers_json: verdicts
            .filter((verdict) => verdict.proposal.source === "rule")
            .map((verdict) => ({
              value_slug: verdict.proposal.valueSlug,
              matcher_kind: verdict.proposal.matcherKind ?? "contains",
              pattern: verdict.proposal.matcherPattern ?? "",
            })),
        },
        coerce: (value) => coerceRuleProposals(value, dimension.slug),
      });

      if (proposals.length === 0) {
        setRuleNote(
          corrections.length === 0
            ? "Nothing was wrong, and no rule was worth writing from a batch you agreed with. Your rules are unchanged."
            : "Your corrections did not add up to a rule the system could state without breaking one of the ones it got right. Nothing was proposed — rule the next batch and it will try again.",
        );
        setPhase("rules");
        return;
      }

      const valuesByKey = new Map(
        dimension.values.map((value) => [value.key, value]),
      );
      const cards: RuleCard[] = [];
      for (const proposal of proposals) {
        const value = valuesByKey.get(proposal.valueSlug) ?? null;
        let reach: MatcherReach | null = null;
        let reachError: string | null = null;
        try {
          reach = await previewMatcherReach({
            siteId,
            start: window.start,
            end: window.end,
            kind: proposal.matcherKind,
            pattern: proposal.pattern,
            valueId: value?.value_id ?? null,
            sample: 4,
          });
        } catch (error) {
          reachError = extractErrorMessage(error);
        }
        cards.push({
          proposal,
          valueId: value?.value_id ?? null,
          reach,
          reachError,
          sent: false,
        });
      }
      setRules(cards);
      setPhase("rules");
    } catch (error) {
      setRuleNote(
        `The rule writer could not run: ${extractErrorMessage(error)}. Your stamps are saved; nothing about your rules changed.`,
      );
      setPhase("rules");
    }
  }

  const send = useMutation({
    mutationFn: async (index: number) => {
      const card = rules[index];
      if (!card) throw new Error("That rule is gone.");
      const proposal: MatcherProposal = {
        proposal: "matcher",
        valueId: card.valueId ?? "",
        dimensionSlug: dimension.slug,
        dimensionLabel: dimension.label,
        valueSlug: card.proposal.valueSlug,
        valueLabel:
          dimension.values.find((v) => v.key === card.proposal.valueSlug)
            ?.label ?? card.proposal.valueSlug,
        matcherKind: card.proposal.matcherKind,
        pattern: card.proposal.pattern,
        notes: card.proposal.notes,
      };
      const receipt = await proposeKeywordMeaning({
        siteId,
        proposal,
        title: card.proposal.plainWords,
        body: card.reach
          ? `It reaches ${formatCount(card.reach.keywords)} searches in this window — ${formatCount(card.reach.newlyValued)} of them carry no such value today.`
          : null,
        reasoning: card.proposal.notes,
        provenance: { agentName: "Ruling session — rule writer" },
      });
      return { index, receipt };
    },
    onSuccess: async ({ index, receipt }) => {
      setRules((previous) =>
        previous.map((card, i) => (i === index ? { ...card, sent: true } : card)),
      );
      toast.success(
        receipt.status === "created"
          ? "Sent for your approval — it is in the list below this session."
          : receipt.status === "already_pending"
            ? "That rule was already waiting for you below."
            : "You already decided on that exact rule.",
      );
      await queryClient.invalidateQueries({ queryKey: ["assists"] });
    },
    onError: (error) => {
      toast.error("Could not send that rule for approval", {
        description: extractErrorMessage(error),
      });
    },
  });

  const runEngine = useMutation({
    mutationFn: () => runSiteMatchers(siteId),
    onSuccess: async (result) => {
      setEngine(result);
      await queryClient.invalidateQueries({ queryKey: ["marketing", "value"] });
      await queryClient.invalidateQueries({
        queryKey: ["marketing", "seo", "keyword-stamps", siteId],
      });
    },
    onError: (error) => {
      toast.error("Could not run your rules", {
        description: extractErrorMessage(error),
      });
    },
  });

  /* ------------------------------------------------------------- rendering */

  return (
    <section
      aria-label="Trial batch"
      className="mx-auto flex w-full max-w-4xl flex-col gap-3"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            <BrainCircuit className="h-4 w-4 text-primary" />
            The system tried {dimension.label.toLowerCase()} on these
          </h2>
          <p className="text-xs text-muted-foreground">
            Your rules answered first; the assistant only filled the gaps. Tap
            the ones it got <span className="font-medium text-foreground">wrong</span>.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={() => onExit(seenIds)}
          disabled={finish.isPending}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to ruling
        </Button>
      </div>

      {aiNote ? (
        <p className="shrink-0 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          {aiNote}
        </p>
      ) : null}

      {phase === "gathering" ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Asking your own rules first, then the assistant for what they could
            not explain…
          </p>
          <CardLoading />
        </div>
      ) : null}

      {gatherError ? (
        <InlineQueryError
          what="the trial batch"
          error={new Error(gatherError)}
          onRetry={() => {
            gathered.current = false;
            setPhase("gathering");
            gathered.current = true;
            void gather();
          }}
        />
      ) : null}

      {phase === "review" && verdicts.length > 0 ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            {verdicts.map((verdict) => (
              <VerdictCard
                key={verdict.proposal.keywordId}
                verdict={verdict}
                siteId={siteId}
                dimension={dimension}
                dimensions={dimensions}
                open={correcting === verdict.proposal.keywordId}
                onWrong={() => markWrong(verdict.proposal.keywordId)}
                onRight={() => markRight(verdict.proposal.keywordId)}
                onOpen={() => setCorrecting(verdict.proposal.keywordId)}
                onPicked={(picked) =>
                  correct(verdict.proposal.keywordId, picked)
                }
                onReason={(reason) =>
                  setCorrectionReason(verdict.proposal.keywordId, reason)
                }
              />
            ))}
          </div>

          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
            <p className="text-xs text-muted-foreground">
              {verdicts.filter((v) => v.status === "wrong").length} marked wrong
              · the rest are taken as right
            </p>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={finish.isPending}
              onClick={() => finish.mutate()}
            >
              {finish.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Wand2 className="h-3.5 w-3.5" />
              )}
              Save these {verdicts.length} and improve my rules
            </Button>
          </div>
        </>
      ) : null}

      {phase === "teaching" ? (
        <div className="space-y-2">
          {score ? <ScoreLine score={score} /> : null}
          <p className="text-xs text-muted-foreground">
            Saved. Now working out what RULE would have got these right…
          </p>
          <CardLoading />
        </div>
      ) : null}

      {phase === "rules" ? (
        <div className="space-y-3">
          {score ? <ScoreLine score={score} /> : null}

          {ruleNote ? (
            <p className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground">
              {ruleNote}
            </p>
          ) : null}

          {rules.map((card, index) => (
            <RuleProposalCard
              key={`${card.proposal.matcherKind}:${card.proposal.pattern}:${index}`}
              card={card}
              dimensionLabel={dimension.label}
              busy={send.isPending}
              onSend={() => send.mutate(index)}
            />
          ))}

          {rules.some((card) => card.sent) ? (
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                Approve them in the list below this session — nothing has changed
                yet.
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                A rule you approve does not stamp anything by itself. Run it over
                the site and this will report exactly what moved.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1.5 text-xs"
                  disabled={runEngine.isPending}
                  onClick={() => runEngine.mutate()}
                >
                  {runEngine.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  Run my rules over the site
                </Button>
                {engine ? (
                  <p className="text-xs text-foreground">
                    {engine.stamped === 0 && engine.removed === 0 ? (
                      <>
                        Nothing changed — your {formatCount(engine.matchers)}{" "}
                        rules already agreed with every stamp on{" "}
                        {formatCount(engine.scopeKeywords)} keywords.
                      </>
                    ) : (
                      <>
                        {formatCount(engine.stamped)} stamp
                        {engine.stamped === 1 ? "" : "s"} written and{" "}
                        {formatCount(engine.removed)} withdrawn across{" "}
                        {formatCount(engine.scopeKeywords)} keywords, by{" "}
                        {formatCount(engine.matchers)} rules.
                        {engine.conflicts > 0
                          ? ` ${formatCount(engine.conflicts)} keyword${engine.conflicts === 1 ? "" : "s"} had two of your rules disagreeing — the oldest rule won.`
                          : ""}
                      </>
                    )}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => onExit(seenIds)}
            >
              <Gavel className="h-3.5 w-3.5" />
              Back to ruling
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------ sub-components */

function ScoreLine({ score }: { score: TrialScore }) {
  const bad = score.percent !== null && score.percent < 50;
  return (
    <p
      className={cn(
        "rounded-lg border px-3 py-2 text-xs font-medium",
        bad
          ? "border-destructive/40 bg-destructive/10 text-foreground"
          : "border-border bg-muted/40 text-foreground",
      )}
    >
      {score.headline}
    </p>
  );
}

function VerdictCard({
  verdict,
  siteId,
  dimension,
  dimensions,
  open,
  onWrong,
  onRight,
  onOpen,
  onPicked,
  onReason,
}: {
  verdict: TrialVerdict;
  siteId: string;
  dimension: FacetDimension;
  dimensions: FacetDimension[];
  open: boolean;
  onWrong: () => void;
  onRight: () => void;
  onOpen: () => void;
  onPicked: (picked: PickedValue) => void;
  onReason: (reason: string) => void;
}) {
  const wrong = verdict.status === "wrong";
  const { proposal } = verdict;
  return (
    <div
      className={cn(
        "rounded-lg border p-2.5 transition-colors",
        wrong
          ? "border-primary bg-primary/5"
          : "border-border bg-card hover:border-muted-foreground/40",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            className="truncate text-xs font-medium text-foreground"
            title={proposal.keyword}
          >
            {proposal.keyword}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {formatCount(proposal.clicks)} clicks ·{" "}
            {formatCount(proposal.impressions)} appearances
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-px text-[10px] font-medium",
            proposal.source === "rule"
              ? "border-border bg-muted/60 text-muted-foreground"
              : "border-primary/40 bg-primary/10 text-primary",
          )}
          title={
            proposal.source === "rule"
              ? "Decided by your own rule, not by a model"
              : "Your rules said nothing, so the assistant answered"
          }
        >
          {proposal.source === "rule" ? "your rule" : "assistant"}
        </span>
      </div>

      <p className="mt-1.5 text-xs text-foreground">
        <span className="text-muted-foreground">{dimension.label}: </span>
        <span className="font-medium">
          {wrong && verdict.correctedValueLabel
            ? verdict.correctedValueLabel
            : proposal.valueLabel}
        </span>
        {wrong && verdict.correctedValueLabel ? (
          <span className="ml-1 text-[11px] text-muted-foreground line-through">
            {proposal.valueLabel}
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {proposal.reason}
      </p>

      <div className="mt-2 flex items-center gap-1.5">
        {wrong ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground"
              onClick={onRight}
            >
              <Check className="h-3 w-3" />
              Actually it was right
            </Button>
            {!open ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 gap-1 px-1.5 text-[11px]"
                onClick={onOpen}
              >
                <Pencil className="h-3 w-3" />
                Change the answer
              </Button>
            ) : null}
          </>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={onWrong}
          >
            This one is wrong
          </Button>
        )}
      </div>

      {wrong && open ? (
        <div className="mt-2 space-y-1.5 border-t border-dashed border-border pt-2">
          <DimensionValuePicker
            siteId={siteId}
            dimensions={dimensions}
            picked={
              verdict.correctedValueId
                ? {
                    dimensionId: dimension.dimension_id,
                    dimensionSlug: dimension.slug,
                    dimensionLabel: dimension.label,
                    valueId: verdict.correctedValueId,
                    valueLabel: verdict.correctedValueLabel ?? "",
                  }
                : null
            }
            onPicked={(picked) => {
              if (picked) onPicked(picked);
            }}
            lockedDimensionSlug={dimension.slug}
          />
          <Textarea
            value={verdict.correctionReason ?? ""}
            onChange={(event) => onReason(event.target.value)}
            rows={2}
            placeholder="Why is this the right answer? — this sentence is what becomes a rule."
            className="text-xs"
          />
        </div>
      ) : null}
    </div>
  );
}

function RuleProposalCard({
  card,
  dimensionLabel,
  busy,
  onSend,
}: {
  card: RuleCard;
  dimensionLabel: string;
  busy: boolean;
  onSend: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="text-xs font-medium text-foreground">
        {card.proposal.plainWords}
      </p>
      <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
        {dimensionLabel} → {card.proposal.valueSlug} when the search{" "}
        {matcherKindWords(card.proposal.matcherKind)} “{card.proposal.pattern}”.
        {card.proposal.replacesPattern
          ? ` It replaces your rule for “${card.proposal.replacesPattern}”.`
          : ""}
      </p>
      {card.proposal.notes ? (
        <p className="mt-1 text-[11px] italic leading-snug text-muted-foreground">
          “{card.proposal.notes}”
        </p>
      ) : null}

      <p className="mt-1.5 text-[11px] text-foreground">
        {card.reach ? (
          <>
            It would reach{" "}
            <span className="font-medium">
              {formatCount(card.reach.keywords)}
            </span>{" "}
            searches in this window ({formatCount(card.reach.clicks)} clicks) —{" "}
            <span className="font-medium">
              {formatCount(card.reach.newlyValued)}
            </span>{" "}
            of them carry no such value today.
            {card.reach.sample.length > 0 ? (
              <span className="text-muted-foreground">
                {" "}
                e.g. {card.reach.sample.map((s) => s.keyword).join(", ")}.
              </span>
            ) : null}
          </>
        ) : (
          <span className="text-muted-foreground">
            Could not measure what this would catch
            {card.reachError ? ` (${card.reachError})` : ""} — read it carefully
            before approving.
          </span>
        )}
      </p>

      <div className="mt-2 flex justify-end">
        {card.sent ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Check className="h-3 w-3 text-success" />
            Waiting for your approval below
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-xs"
            disabled={busy || !card.valueId}
            onClick={onSend}
            title={
              card.valueId
                ? undefined
                : "This rule names a value that no longer exists on the dimension."
            }
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Send for my approval
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * A picked value carries the value's id and label but not its SHORT slug, which
 * is what the proposal RPCs take. The catalog has both, so look it up rather
 * than re-deriving `dimension:value` string surgery at a call site.
 */
function slugKeyOf(
  picked: PickedValue,
  dimensions: FacetDimension[],
): string | undefined {
  for (const dimension of dimensions) {
    const value = dimension.values.find((v) => v.value_id === picked.valueId);
    if (value) return value.key;
  }
  return undefined;
}
