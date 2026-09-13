"use client";

// features/masterwork/components/masterworks/AuditionDialog.tsx
//
// "Compare to the original" — the Audition in the UI. The Expert puts the
// Masterwork's output next to the real published work produced from the same
// inputs, and the judge scores both against the Rulebook's own rules. Gaps the
// reference exposes land as DRAFT rules — the Audition feeds the Rulebook.
//
// Quality gets a NUMBER (2026-08-17): every audition lands a derived 0-100
// `quality_score` on its `platform.masterwork_run` row (50 = parity with the
// reference), the dialog shows the trend of past scores, and the opt-in
// THREE-WAY harness also runs a raw vanilla model (same tier as the
// Masterwork's primary agent, no Rulebook) against the same reference — the
// verdict then says plainly whether the Masterwork beat vanilla AI, or not.
//
// After a verdict, "Your call" records the Expert's OWN rating
// (expert_score / expert_verdict, direct Supabase write) — the ground truth
// the judge's platform.judge_verdict accuracy record is calibrated against.
//
// Server half: aidream POST /masterworks/audition (durable streaming run via
// useMasterworkRun; verdict event `masterwork_audition_verdict`). Owner-only.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Scale } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import { cn } from "@/lib/utils";
import type { paths } from "@/types/python-generated/api-types";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { DurableRunInterruption } from "@/lib/durable-run/DurableRunInterruption";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { RulebookRule } from "../../types";
import {
  parseVerdict,
  type AuditionVerdict,
} from "./auditionVerdict";
import { RuleFidelityTable } from "./RuleFidelityTable";
import { ruleAnchorId } from "../detail/RuleRelations";
import { UnfoldingAuditionPanel } from "./UnfoldingAuditionPanel";
import {
  EXPERT_CALLS,
  listAuditionRuns,
  saveExpertCall,
  type AuditionRunSummary,
} from "../../audition/auditionRuns";

const AUDITION_PATH = "/masterworks/audition" satisfies keyof paths;

const VERDICT_COPY: Record<string, { label: string; cls: string }> = {
  candidate_better: {
    label: "Your Masterwork beat the original",
    cls: "border-primary/50 text-primary",
  },
  parity: { label: "On par with the original", cls: "border-border text-foreground" },
  reference_better: {
    label: "The original is still better",
    cls: "border-destructive/50 text-destructive",
  },
};

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 50) return "text-primary";
  if (score >= 35) return "text-foreground";
  return "text-destructive";
}

/** Compact past-scores strip: the Expert sees the line move — and can REOPEN
 * any of them. An Audition costs real money and several minutes; re-running one
 * to read it again is a toll, not a feature (W37c). A row with no stored
 * verdict says so rather than offering a button that does nothing. */
function HistoryStrip({
  runs,
  openRunId,
  onOpen,
}: {
  runs: AuditionRunSummary[];
  openRunId: string | null;
  onOpen: (run: AuditionRunSummary) => void;
}) {
  if (runs.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-xs font-medium text-foreground">Past auditions</p>
      <ul className="mt-1 space-y-0.5">
        {runs.slice(0, 8).map((run) => {
          const reopenable = run.result !== null;
          return (
            <li key={run.id} className="flex items-center gap-2 text-xs">
              {reopenable ? (
                <button
                  type="button"
                  onClick={() => onOpen(run)}
                  className={cn(
                    "w-20 shrink-0 text-left underline-offset-2 hover:underline",
                    run.id === openRunId
                      ? "font-medium text-primary"
                      : "text-primary",
                  )}
                >
                  {new Date(run.startedAt).toLocaleDateString()}
                </button>
              ) : (
                <span
                  className="w-20 shrink-0 text-muted-foreground"
                  title="This run finished before verdicts were stored, so there is nothing to reopen."
                >
                  {new Date(run.startedAt).toLocaleDateString()}
                </span>
              )}
              <span className={cn("w-14 shrink-0 font-medium", scoreTone(run.qualityScore))}>
                {run.qualityScore !== null ? `${run.qualityScore}/100` : "—"}
              </span>
              {run.beatVanilla !== null ? (
                <span className={run.beatVanilla ? "text-primary" : "text-destructive"}>
                  {run.beatVanilla ? "beat vanilla AI" : "lost to vanilla AI"}
                </span>
              ) : null}
              {run.expertScore !== null ? (
                <span className="ml-auto shrink-0 text-muted-foreground">
                  your call:{" "}
                  {EXPERT_CALLS.find((c) => c.score === run.expertScore)?.label ??
                    `${run.expertScore}/100`}
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AuditionDialog({
  open,
  onOpenChange,
  rulebookId,
  rules,
  benchmarkClaim,
  initialCandidate,
  onGapsCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebookId: string;
  /** Already loaded by the parent; supplies the citation's name and live
   * target. */
  rules: RulebookRule[];
  /**
   * The Expert's own intake claim about how ChatGPT does today
   * (`metadata.intake.benchmark`). THE INTAKE ANSWERS DO WORK: a Rulebook
   * built because plain AI was failing arrives with the vanilla arm already
   * armed, and the claim is shown so the verdict answers it directly.
   */
  benchmarkClaim?: string;
  /** Prefill from a finished in-place run, when opened from its result. */
  initialCandidate?: string;
  /** Fired when gap drafts landed on the Rulebook (refresh rule counts). */
  onGapsCaptured?: () => void;
}) {
  /**
   * TWO EXAMS, ONE DIALOG. "Against the original" judges a finished piece of
   * work against the real published one; "Unfolding" puts the desk in front of
   * a case nobody here has seen and scores the path it took. They share
   * nothing but the door, so they are tabs rather than one confused form.
   */
  const [mode, setMode] = useState<"reference" | "unfolding">("reference");
  const [candidate, setCandidate] = useState(initialCandidate ?? "");
  const [reference, setReference] = useState("");
  const [contextNote, setContextNote] = useState("");
  // "Haven't tried" is the only answer that is not a complaint about plain
  // AI — every other one is the Expert saying it falls short, so the run that
  // proves or disproves it starts armed.
  const claimsPlainAiFallsShort = Boolean(
    benchmarkClaim && benchmarkClaim !== "Haven't tried",
  );
  const [compareVanilla, setCompareVanilla] = useState(claimsPlainAiFallsShort);
  const [vanillaInput, setVanillaInput] = useState("");
  const [showVanillaText, setShowVanillaText] = useState(false);
  const [history, setHistory] = useState<AuditionRunSummary[]>([]);
  const [expertWhy, setExpertWhy] = useState("");
  const [expertSaved, setExpertSaved] = useState<number | null>(null);
  const [savingExpert, setSavingExpert] = useState(false);
  const rulesById = useMemo(
    () => new Map(rules.map((rule) => [rule.id, rule])),
    [rules],
  );

  const run = useMasterworkRun<AuditionVerdict>({
    surface: "audition",
    rulebookId,
    path: AUDITION_PATH,
    parseResult: parseVerdict,
  });
  // A past verdict the Expert reopened from the history strip. The live run
  // always wins: a new Audition replaces whatever was being read.
  const [reopened, setReopened] = useState<{
    runId: string;
    verdict: AuditionVerdict;
  } | null>(null);
  const verdict = run.result ?? reopened?.verdict ?? null;
  // Only a verdict this tab just produced may be rated — `expert_score` belongs
  // to the run it judges, and a reopened one already had its chance.
  const ratableRunId = run.result ? run.runId : null;

  const openPastRun = useCallback((summary: AuditionRunSummary) => {
    const parsed = parseVerdict(summary.result);
    if (!parsed) {
      toast.error(
        "That run's verdict was not stored, so there is nothing to reopen.",
      );
      return;
    }
    run.reset();
    setReopened({ runId: summary.id, verdict: parsed });
    setExpertSaved(null);
    setExpertWhy("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshHistory = useCallback(() => {
    listAuditionRuns(rulebookId)
      .then(setHistory)
      .catch(() => {
        // History is a garnish — the verdict panel never blocks on it.
      });
  }, [rulebookId]);

  useEffect(() => {
    if (open) refreshHistory();
  }, [open, refreshHistory]);

  // Opened from a finished run: the Masterwork's own output IS the candidate.
  useEffect(() => {
    if (!open || !initialCandidate) return;
    setCandidate(initialCandidate);
  }, [open, initialCandidate]);

  // A verdict just landed: gaps may have hit the Rulebook, history has a new
  // point, and the Expert's rating starts fresh. Keyed by run id so it fires
  // once per finished run, not on every re-render of a done run.
  const [handledRunId, setHandledRunId] = useState<string | null>(null);
  useEffect(() => {
    if (run.status !== "done" || !verdict || !run.runId) return;
    if (run.runId === handledRunId) return;
    setHandledRunId(run.runId);
    if (verdict.gaps_captured > 0) onGapsCaptured?.();
    setExpertSaved(null);
    setExpertWhy("");
    refreshHistory();
  }, [run.status, run.runId, verdict, handledRunId, onGapsCaptured, refreshHistory]);

  const audition = () => {
    if (candidate.trim().length < 50 || reference.trim().length < 50) {
      toast.error("Paste both texts first — ours and the original.");
      return;
    }
    if (compareVanilla && vanillaInput.trim().length < 20) {
      toast.error(
        "To compare against vanilla AI, paste the same input you gave your Masterwork.",
      );
      return;
    }
    run.reset();
    setReopened(null);
    setShowVanillaText(false);
    void run.launch(
      {
        rulebook_id: rulebookId,
        candidate_text: candidate,
        reference_text: reference,
        context_note: contextNote.trim() || undefined,
        compare_vanilla: compareVanilla,
        vanilla_input: compareVanilla ? vanillaInput : undefined,
      },
      contextNote.trim() || "audition",
    );
  };

  const recordExpertCall = async (score: number) => {
    if (!ratableRunId) {
      toast.error("This verdict has no saved run to rate — run the Audition again.");
      return;
    }
    setSavingExpert(true);
    try {
      await saveExpertCall(ratableRunId, score, expertWhy);
      setExpertSaved(score);
      toast.success("Your call is saved — it is the ground truth the judge learns from.");
      refreshHistory();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save your rating.");
    } finally {
      setSavingExpert(false);
    }
  };

  const verdictCopy = verdict
    ? (VERDICT_COPY[verdict.verdict] ?? VERDICT_COPY.parity)
    : null;

  return (
    // The Expert dictates the reference work and their own verdict here — both
    // are their words about this Rulebook, so both are stamped.
    <MasterworkDictationOrigin
      surface="masterwork.audition"
      rulebookId={rulebookId}
    >
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-primary" />
            Compare to the original
          </DialogTitle>
          <DialogDescription>
            Put your Masterwork&apos;s work next to the real thing made from the
            same inputs. Both get judged against your rules — and anything the
            original does that your Rulebook misses becomes a draft rule.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-1 border-b border-border">
          {(
            [
              ["reference", "Against the original"],
              ["unfolding", "A case it has never seen"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                "-mb-px border-b-2 px-2 py-1.5 text-xs font-medium",
                mode === id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "unfolding" ? (
          <UnfoldingAuditionPanel rulebookId={rulebookId} />
        ) : (
        <div className="space-y-3">
          <HistoryStrip
            runs={history}
            openRunId={reopened?.runId ?? null}
            onOpen={openPastRun}
          />
          <div className="space-y-1.5">
            <Label htmlFor="audition-candidate">
              Your Masterwork&apos;s output
            </Label>
            <ProTextarea
              id="audition-candidate"
              value={candidate}
              onChange={(e) => setCandidate(e.target.value)}
              rows={5}
              enableTextStats
              placeholder="Paste what your Masterwork produced…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audition-reference">
              The original (the real published work)
            </Label>
            <ProTextarea
              id="audition-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              rows={5}
              enableTextStats
              placeholder="Paste the real thing — the article, the brief, the deliverable…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="audition-context">
              What were the shared inputs?{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="audition-context"
              value={contextNote}
              onChange={(e) => setContextNote(e.target.value)}
              placeholder='e.g. "the Aug 14 newswire" or "the client brief from Monday"'
              maxLength={500}
            />
          </div>
          <div className="flex items-start gap-2 rounded-md border border-border p-2">
            <Checkbox
              id="audition-vanilla"
              checked={compareVanilla}
              onCheckedChange={(v) => setCompareVanilla(v === true)}
              className="mt-0.5"
            />
            <div className="space-y-1.5">
              <Label htmlFor="audition-vanilla" className="cursor-pointer">
                Also test against vanilla AI
              </Label>
              <p className="text-xs text-muted-foreground">
                The same model your Masterwork runs on does the same job with no
                Rulebook, and both are judged against your original. One extra AI
                call — this is how you know your rules are earning their keep.
              </p>
              {claimsPlainAiFallsShort ? (
                <p className="text-xs text-muted-foreground">
                  When you started this Rulebook you said plain AI
                  &ldquo;{benchmarkClaim?.toLowerCase()}&rdquo; — this is the run
                  that settles it.
                </p>
              ) : null}
              {compareVanilla ? (
                <ProTextarea
                  id="audition-vanilla-input"
                  value={vanillaInput}
                  onChange={(e) => setVanillaInput(e.target.value)}
                  rows={4}
                  enableTextStats
                  placeholder="Paste the SAME input you gave your Masterwork (the text to edit, or the job brief)…"
                />
              ) : null}
            </div>
          </div>
          <Button onClick={audition} disabled={run.running}>
            {run.running ? (run.stage ?? "Judging rule by rule…") : "Compare"}
          </Button>
          {run.running && run.stages.length > 0 ? (
            <p className="text-xs text-muted-foreground">{run.stage}</p>
          ) : null}
          {run.running ? (
            <DurableRunInterruption interruption={run.interruption} />
          ) : null}
          {/* A failed Audition spent the person's time and, on a three-way
              run, their money. It stays on screen with the server's own reason
              and a way out — never a line of red text with no remedy (W37a). */}
          <DurableRunFailure
            error={run.error}
            retry={run.retry}
            running={run.running}
          />

          {verdict && verdictCopy ? (
            <div className="space-y-3 border-t border-border pt-3">
              {reopened ? (
                <p className="text-xs text-muted-foreground">
                  Reopened from{" "}
                  {new Date(
                    history.find((h) => h.id === reopened.runId)?.startedAt ??
                      Date.now(),
                  ).toLocaleString()}
                  . Nothing was re-run and nothing was charged.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={verdictCopy.cls}>
                  {verdictCopy.label}
                </Badge>
                {verdict.quality_score !== null ? (
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      scoreTone(verdict.quality_score),
                    )}
                  >
                    Masterwork {verdict.quality_score}/100
                  </span>
                ) : null}
                {verdict.vanilla_compared && verdict.vanilla_score !== null ? (
                  <span
                    className={cn("text-sm", scoreTone(verdict.vanilla_score))}
                  >
                    Vanilla AI {verdict.vanilla_score}/100
                  </span>
                ) : null}
              </div>
              {verdict.verdict_sentence ? (
                <p className="rounded-md border border-primary/30 bg-primary/5 p-2 text-sm font-medium text-foreground">
                  {verdict.verdict_sentence}
                </p>
              ) : null}
              {verdict.vanilla_note ? (
                <p className="text-xs text-muted-foreground">
                  {verdict.vanilla_note}
                </p>
              ) : null}
              {verdict.vanilla_error ? (
                <p className="text-xs text-muted-foreground">
                  The vanilla comparison could not finish this time; the verdict
                  above is your Masterwork against the original only.
                </p>
              ) : null}
              <p className="text-sm text-foreground">{verdict.summary}</p>
              {verdict.vanilla_text ? (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowVanillaText((s) => !s)}
                  >
                    {showVanillaText
                      ? "Hide vanilla AI's attempt"
                      : "See what vanilla AI wrote"}
                  </Button>
                  {showVanillaText ? (
                    <p className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                      {verdict.vanilla_text}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <RuleFidelityTable
                verdict={verdict}
                rulebookId={rulebookId}
                rulesById={rulesById}
              />
              {verdict.gaps.length > 0 ? (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
                  <p className="text-xs font-medium text-foreground">
                    {verdict.gaps_captured > 0
                      ? `${verdict.gaps_captured} new draft ${verdict.gaps_captured === 1 ? "rule" : "rules"} captured from what the original does better — review them on the Rulebook page.`
                      : "The original does these better — no rule covers them yet:"}
                  </p>
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                    {verdict.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="space-y-2 rounded-md border border-border p-2">
                <p className="text-xs font-medium text-foreground">
                  Your call — is the Masterwork&apos;s output there yet?
                </p>
                {reopened ? (
                  // A reopened verdict is a READ. Its rating already happened
                  // (or did not); offering the buttons again would write the
                  // Expert's call onto a run they are only re-reading.
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const past = history.find((h) => h.id === reopened.runId);
                      if (past?.expertScore === null || past === undefined) {
                        return "You did not rate this one at the time — ratings belong to the run that produced them, so run a new Audition to record yours.";
                      }
                      return `You called it "${
                        EXPERT_CALLS.find((c) => c.score === past.expertScore)
                          ?.label ?? past.expertScore
                      }" at the time.`;
                    })()}
                  </p>
                ) : expertSaved !== null ? (
                  <p className="text-sm text-primary">
                    Saved:{" "}
                    {EXPERT_CALLS.find((c) => c.score === expertSaved)?.label ??
                      expertSaved}
                    . Thank you — your judgment is what the judge is measured
                    against.
                  </p>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {EXPERT_CALLS.map((call) => (
                        <Button
                          key={call.score}
                          variant="outline"
                          size="sm"
                          disabled={savingExpert}
                          onClick={() => void recordExpertCall(call.score)}
                        >
                          {call.label}
                        </Button>
                      ))}
                    </div>
                    <ProTextarea
                      value={expertWhy}
                      onChange={(e) => setExpertWhy(e.target.value)}
                      rows={2}
                      placeholder="Why? (optional — one sentence helps the system learn your taste)"
                    />
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>
        )}
      </DialogContent>
    </Dialog>
    </MasterworkDictationOrigin>
  );
}
