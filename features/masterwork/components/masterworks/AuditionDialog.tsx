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

import { useCallback, useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import {
  EXPERT_CALLS,
  listAuditionRuns,
  saveExpertCall,
  type AuditionRunSummary,
} from "../../audition/auditionRuns";

const AUDITION_PATH = "/masterworks/audition" satisfies keyof paths;

interface RuleFinding {
  rule_id: string;
  winner: string;
  note: string;
}

interface AuditionVerdict {
  verdict: string;
  summary: string;
  findings: RuleFinding[];
  gaps: string[];
  gaps_captured: number;
  quality_score: number | null;
  vanilla_compared: boolean;
  vanilla_score: number | null;
  vanilla_text: string | null;
  vanilla_error: string | null;
  beat_vanilla_rules: number | null;
  vanilla_rules_compared: number | null;
  verdict_sentence: string | null;
}

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

function parseVerdict(raw: unknown): AuditionVerdict | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (data.type !== "masterwork_audition_verdict") return null;
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    verdict: String(data.verdict ?? "parity"),
    summary: String(data.summary ?? ""),
    findings: Array.isArray(data.findings) ? (data.findings as RuleFinding[]) : [],
    gaps: Array.isArray(data.gaps) ? (data.gaps as string[]) : [],
    gaps_captured: Number(data.gaps_captured ?? 0),
    quality_score: num(data.quality_score),
    vanilla_compared: data.vanilla_compared === true,
    vanilla_score: num(data.vanilla_score),
    vanilla_text: typeof data.vanilla_text === "string" ? data.vanilla_text : null,
    vanilla_error: typeof data.vanilla_error === "string" ? data.vanilla_error : null,
    beat_vanilla_rules: num(data.beat_vanilla_rules),
    vanilla_rules_compared: num(data.vanilla_rules_compared),
    verdict_sentence:
      typeof data.verdict_sentence === "string" ? data.verdict_sentence : null,
  };
}

function scoreTone(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 50) return "text-primary";
  if (score >= 35) return "text-foreground";
  return "text-destructive";
}

/** Compact past-scores strip: the Expert sees the line move. */
function HistoryStrip({ runs }: { runs: AuditionRunSummary[] }) {
  if (runs.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-muted/30 p-2">
      <p className="text-xs font-medium text-foreground">Past auditions</p>
      <ul className="mt-1 space-y-0.5">
        {runs.slice(0, 8).map((run) => (
          <li
            key={run.id}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <span className="w-20 shrink-0">
              {new Date(run.startedAt).toLocaleDateString()}
            </span>
            <span className={cn("w-14 shrink-0 font-medium", scoreTone(run.qualityScore))}>
              {run.qualityScore !== null ? `${run.qualityScore}/100` : "—"}
            </span>
            {run.beatVanilla !== null ? (
              <span className={run.beatVanilla ? "text-primary" : "text-destructive"}>
                {run.beatVanilla ? "beat vanilla AI" : "lost to vanilla AI"}
              </span>
            ) : null}
            {run.expertScore !== null ? (
              <span className="ml-auto shrink-0">
                your call:{" "}
                {EXPERT_CALLS.find((c) => c.score === run.expertScore)?.label ??
                  `${run.expertScore}/100`}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AuditionDialog({
  open,
  onOpenChange,
  rulebookId,
  initialCandidate,
  onGapsCaptured,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebookId: string;
  /** Prefill from a finished in-place run, when opened from its result. */
  initialCandidate?: string;
  /** Fired when gap drafts landed on the Rulebook (refresh rule counts). */
  onGapsCaptured?: () => void;
}) {
  const [candidate, setCandidate] = useState(initialCandidate ?? "");
  const [reference, setReference] = useState("");
  const [contextNote, setContextNote] = useState("");
  const [compareVanilla, setCompareVanilla] = useState(false);
  const [vanillaInput, setVanillaInput] = useState("");
  const [showVanillaText, setShowVanillaText] = useState(false);
  const [history, setHistory] = useState<AuditionRunSummary[]>([]);
  const [expertWhy, setExpertWhy] = useState("");
  const [expertSaved, setExpertSaved] = useState<number | null>(null);
  const [savingExpert, setSavingExpert] = useState(false);

  const run = useMasterworkRun<AuditionVerdict>({
    surface: "audition",
    rulebookId,
    path: AUDITION_PATH,
    parseResult: parseVerdict,
  });
  const verdict = run.result;

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
    if (!run.runId) {
      toast.error("This verdict has no saved run to rate — run the Audition again.");
      return;
    }
    setSavingExpert(true);
    try {
      await saveExpertCall(run.runId, score, expertWhy);
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
        <div className="space-y-3">
          <HistoryStrip runs={history} />
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
          {run.error ? (
            <p className="text-sm text-destructive">{run.error}</p>
          ) : null}

          {verdict && verdictCopy ? (
            <div className="space-y-3 border-t border-border pt-3">
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
              {verdict.findings.length > 0 ? (
                <ul className="space-y-1">
                  {verdict.findings.map((f) => (
                    <li key={f.rule_id} className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {f.rule_id}
                      </span>{" "}
                      —{" "}
                      {f.winner === "candidate"
                        ? "yours wins"
                        : f.winner === "reference"
                          ? "the original wins"
                          : "even"}
                      {f.note ? `: ${f.note}` : null}
                    </li>
                  ))}
                </ul>
              ) : null}
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
                {expertSaved !== null ? (
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
      </DialogContent>
    </Dialog>
  );
}
