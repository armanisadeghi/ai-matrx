"use client";

// features/masterwork/prediction/PredictionLedgerDialog.tsx
//
// THE PREDICTION LEDGER — the door for the `prediction_ledger` Approach.
//
// ## What the Expert actually does here
//
// She calls live cases in her own work before she knows the answer: "this
// claim is fraudulent", "this candidate will accept", "this bid wins" — with
// how sure she is and ONE line of why. Later she comes back and says what
// happened. The whys behind the calls she got right become rule candidates;
// the whys behind the ones she got wrong are boundary findings — the places
// her own system does not yet know its edges.
//
// That is why the WHY is the required field and the prediction is the cheap
// one. A ledger of outcomes with no reasons distils into nothing.
//
// ## Two halves, one dialog
//
// "Call it" and "What happened" sit side by side (stacked on a phone) because
// they are one habit, not two features: an Expert opens this to log today's
// calls AND to close out the ones that have landed. Splitting them into two
// doors would make closing out an errand.
//
// ## Nothing here fails silently
//
// - The knobs this feature is governed by are read from `platform.feature_knob`.
//   If a knob row is missing, the dialog SAYS SO in place, names the knob and
//   the remedy, and carries on with the declared starting values — a dialog
//   that refused to open over a missing config row would hide the real problem
//   behind a dead door.
// - The server refuses to distil fewer than `min_resolved_to_distill` resolved
//   calls. That refusal arrives as a plain sentence and is shown verbatim,
//   never as "something went wrong".

import { useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { knobBool, knobInt } from "@/lib/knobs/featureKnobs";
import type { paths } from "@/types/python-generated/api-types";
import { MasterworkDictationOrigin } from "../MasterworkDictationOrigin";
import { createSittingStore, type SittingBase } from "../sitting/sitting";
import { useDialogSitting } from "../sitting/useDialogSitting";
import { SittingResumed } from "../sitting/SittingResumed";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";
import { useScrollIntoViewOnAppear } from "@/lib/durable-run/useScrollIntoViewOnAppear";
import { useRunResultOnce } from "../durable-run/useRunResultOnce";
import type { Rulebook } from "../types";
import { durableRunDialogOnOpenChange } from "@/lib/durable-run/durableRunDialogClose";
import { CalibrationReadout } from "./CalibrationReadout";
import { appendPrediction, ledgerOf, resolvePrediction } from "./service";
import {
  CONFIDENCE_WORDS,
  confidenceWords,
  describeScore,
  isoDay,
  isResolved,
  openEntriesByUrgency,
  tally,
  type PredictionEntry,
} from "./scoring";
import { RunStages } from "@/features/masterwork/components/RunStages";

/**
 * Served by `aidream/aidream/services/distillation/prediction_ledger.py`.
 *
 * Cast pending the OpenAPI type sync, the same precedent the unfolding lane
 * set: `pnpm sync-types` needs a machine with database access. Until it runs,
 * a wrong path fails LOUDLY with the real HTTP error and everything else on
 * this screen stays typed. Remedy: `pnpm sync-types`.
 */
const INGEST_PREDICTIONS_PATH = "/masterworks/ingest-predictions" as keyof paths;

/** The feature these knobs belong to — registered by the server half. */
export const PREDICTION_KNOB_FEATURE = "masterwork_prediction_ledger";

/**
 * The values the knobs START at, declared here so a missing row degrades into
 * a visible warning rather than a broken dialog. These are NOT a fallback the
 * system settles into: the banner names the missing knob every time it is used.
 */
export const DECLARED_KNOB_DEFAULTS = {
  reminder_cadence_hours: 72,
  min_resolved_to_distill: 5,
  voice_default_on: true,
};

interface KnobState {
  reminderCadenceHours: number;
  minResolvedToDistill: number;
  voiceDefaultOn: boolean;
  /** The sentence shown in place when a knob row could not be read. */
  problem: string | null;
}

const PENDING_KNOBS: KnobState = {
  reminderCadenceHours: DECLARED_KNOB_DEFAULTS.reminder_cadence_hours,
  minResolvedToDistill: DECLARED_KNOB_DEFAULTS.min_resolved_to_distill,
  voiceDefaultOn: DECLARED_KNOB_DEFAULTS.voice_default_on,
  problem: null,
};

/** A date `days` from today, as YYYY-MM-DD — the due-date field's opening guess. */
export function defaultDueDate(days = 30, from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  return isoDay(d);
}

export interface PredictionDistillSummary {
  added: number;
  duplicatesSkipped: number;
  entriesUsed: number;
}

export function parsePredictionSummary(
  raw: unknown,
): PredictionDistillSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!("added" in data) && !("entries_used" in data)) return null;
  return {
    added: Number(data.added ?? 0),
    duplicatesSkipped: Number(data.duplicates_skipped ?? 0),
    entriesUsed: Number(data.entries_used ?? 0),
  };
}

export function describePredictionDistill(s: PredictionDistillSummary): string {
  if (s.added === 0) {
    return (
      `Read ${s.entriesUsed} of your calls and found nothing new to add — either the ` +
      "reasons behind them are already in your rules, or they were too similar to each " +
      "other to tell apart. Record a few more calls and come back."
    );
  }
  return (
    `Read ${s.entriesUsed} of your calls and added ${s.added} suggested ` +
    `${s.added === 1 ? "rule" : "rules"} as drafts for you to approve` +
    (s.duplicatesSkipped
      ? `, skipping ${s.duplicatesSkipped} you already have.`
      : ".")
  );
}

/** Refusals of a new call, each naming what to do about it. */
export function validateNewPrediction(input: {
  caseLabel: string;
  prediction: string;
  why: string;
  dueAt: string;
}): string | null {
  if (!input.caseLabel.trim()) {
    return "Name the case first — a file number, a client, whatever you would call it in your own notes. It is how you will recognise it when the answer comes in.";
  }
  if (!input.prediction.trim()) {
    return "Say what you think is going to happen, in one sentence.";
  }
  if (!input.why.trim()) {
    return "The why is the part that becomes a rule — say in one line what makes you think so. Without it this is just a guess with a date on it.";
  }
  if (!input.dueAt.trim()) {
    return "Put a date on it — roughly when you will know how this turned out.";
  }
  return null;
}

interface PredictionSitting extends SittingBase {
  caseLabel: string;
  prediction: string;
  confidence: number;
  why: string;
  dueAt: string;
}

const predictionSittings = createSittingStore<PredictionSitting>({
  keyPrefix: "matrx.masterwork.prediction-call.v1:",
  isUsable: (sitting) =>
    typeof sitting.prediction === "string" &&
    (sitting.caseLabel?.trim().length > 0 ||
      sitting.prediction.trim().length > 0 ||
      sitting.why?.trim().length > 0),
});

export function PredictionLedgerDialog({
  open,
  onOpenChange,
  rulebook,
  canEdit,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  canEdit: boolean;
  /** The page reloads the Rulebook — a new entry and new drafts both land there. */
  onChanged?: () => void;
}) {
  const [entries, setEntries] = useState<PredictionEntry[]>(
    () => ledgerOf(rulebook).entries,
  );
  useEffect(() => {
    setEntries(ledgerOf(rulebook).entries);
  }, [rulebook]);

  const [knobs, setKnobs] = useState<KnobState>(PENDING_KNOBS);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [hours, minResolved, voice] = await Promise.all([
          knobInt(PREDICTION_KNOB_FEATURE, "reminder_cadence_hours"),
          knobInt(PREDICTION_KNOB_FEATURE, "min_resolved_to_distill"),
          knobBool(PREDICTION_KNOB_FEATURE, "voice_default_on"),
        ]);
        if (cancelled) return;
        setKnobs({
          reminderCadenceHours: hours,
          minResolvedToDistill: minResolved,
          voiceDefaultOn: voice,
          problem: null,
        });
      } catch (err) {
        if (cancelled) return;
        // LAW 4. The settings this screen obeys could not be read, so the
        // screen says which ones and what they are running on instead.
        setKnobs({
          ...PENDING_KNOBS,
          problem:
            `The settings for this feature could not be read (${
              err instanceof Error ? err.message : String(err)
            }). It is running on the starting values — voice on, ` +
            `${DECLARED_KNOB_DEFAULTS.min_resolved_to_distill} outcomes needed before ` +
            "rules can be made. An administrator can fix this by seeding the " +
            `"${PREDICTION_KNOB_FEATURE}" knobs.`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const today = isoDay(new Date());
  // The reminder cadence is how often this feature nudges about an unanswered
  // call, so it is also the honest width of "coming up" on this screen: an
  // entry due inside one cadence window is the one the next nudge will be
  // about. Reading the knob and then highlighting on a hardcoded week would be
  // a screen disagreeing with the setting that governs it.
  const dueSoonThrough = isoDay(
    new Date(Date.now() + knobs.reminderCadenceHours * 3_600_000),
  );
  const counts = tally(entries, today);
  const openEntries = openEntriesByUrgency(entries);

  // ─── "Call it" form ─────────────────────────────────────────────────────
  // A HALF-WRITTEN CALL IS REAL WORK (cold walk 6 census, 2026-09-17: every
  // capture dialog on this page lost typed work on a reload). The call being
  // written — the case, the prediction, the reason and the date — is kept
  // until it is actually recorded, and says so when it comes back.
  const [caseLabel, setCaseLabel] = useState("");
  const [prediction, setPrediction] = useState("");
  const [confidence, setConfidence] = useState(0.7);
  const [why, setWhy] = useState("");
  const [dueAt, setDueAt] = useState(() => defaultDueDate());
  const [saving, setSaving] = useState(false);
  // Whether ANY of this call's words arrived by voice. Stamped on the entry so
  // a later reader knows whether the wording is spoken or written.
  const [usedVoice, setUsedVoice] = useState(false);

  const sitting = useDialogSitting<PredictionSitting>({
    store: predictionSittings,
    scopeId: rulebook.id,
    active: open,
    snapshot: { caseLabel, prediction, confidence, why, dueAt },
    isWorthKeeping: (s) =>
      s.caseLabel.trim().length > 0 ||
      s.prediction.trim().length > 0 ||
      s.why.trim().length > 0,
    apply: (kept) => {
      setCaseLabel(kept.caseLabel);
      setPrediction(kept.prediction);
      setConfidence(kept.confidence);
      setWhy(kept.why);
      if (kept.dueAt) setDueAt(kept.dueAt);
    },
    clearScreen: () => {
      setCaseLabel("");
      setPrediction("");
      setWhy("");
      setUsedVoice(false);
      setDueAt(defaultDueDate());
    },
  });

  // ─── "What happened" ────────────────────────────────────────────────────
  const [noteFor, setNoteFor] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);
  /** The plain-words score of the call just closed out — said immediately. */
  const [justScored, setJustScored] = useState<string | null>(null);

  const run = useMasterworkRun<PredictionDistillSummary>({
    surface: "prediction",
    rulebookId: rulebook.id,
    path: INGEST_PREDICTIONS_PATH,
    parseResult: parsePredictionSummary,
  });
  const running = run.running;
  const summary = run.result;
  useRunResultOnce(run, onChanged);

  // 🚨 THE ANSWER MUST REACH THE PERSON, NOT JUST THE DOM (census wall W17,
  // 2026-09-16). This dialog's body scrolls. Driven live with one scored call,
  // the server refused honestly — "Still waiting on outcomes: 1 of your 2
  // prediction(s) have an answer, and this needs 5…", durably recorded on
  // `platform.masterwork_run` — and this dialog rendered that exact sentence
  // BELOW THE FOLD, behind the footer. On screen: an unchanged dialog and no
  // rules. A refusal nobody can see is the silent zero, so both the refusal and
  // the "read them and added nothing" summary scroll themselves into view.
  const noticeRef = useScrollIntoViewOnAppear<HTMLDivElement>(
    Boolean(run.error) || Boolean(summary),
    run.error ?? (summary ? `result:${run.runId ?? "done"}` : null),
  );

  const reportWrite = (status: "saved" | "conflict" | "not_found"): boolean => {
    if (status === "saved") return true;
    if (status === "conflict") {
      toast.error(
        "Someone else saved this Rulebook while you were typing, and we could not " +
          "merge the two. Nothing was lost — close this and open it again, and your " +
          "call will go in cleanly.",
      );
      return false;
    }
    toast.error("This Rulebook could not be found — it may have been deleted.");
    return false;
  };

  /**
   * What is still missing before a call can be recorded, in plain words —
   * the gate on the button, never a red complaint after the press.
   */
  const missingCallFields = validateNewPrediction({
    caseLabel,
    prediction,
    why,
    dueAt,
  });

  const submitCall = async () => {
    // Gated on the button, which carries this same sentence as its reason.
    // A call that is not filled in yet is a PROMPT, not an alarm — this used
    // to fire the sentence as a red toast (class sweep, 2026-09-16).
    if (missingCallFields) return;
    setSaving(true);
    try {
      const result = await appendPrediction(rulebook.id, {
        caseLabel,
        prediction,
        confidence,
        why,
        dueAt,
        capturedBy: usedVoice ? "voice" : "typed",
      });
      if (!reportWrite(result.status)) return;
      if (result.status === "saved") {
        setEntries(result.entries);
        setCaseLabel("");
        setPrediction("");
        setWhy("");
        setUsedVoice(false);
        setDueAt(defaultDueDate());
        sitting.forget();
        toast.success(
          `Recorded. Come back on or after ${dueAt} and tell us how it turned out.`,
        );
        onChanged?.();
      }
    } finally {
      setSaving(false);
    }
  };

  const settle = async (entry: PredictionEntry, outcome: boolean) => {
    setResolving(entry.id);
    try {
      const result = await resolvePrediction(
        rulebook.id,
        entry.id,
        outcome,
        noteFor[entry.id] ?? "",
      );
      if (!reportWrite(result.status)) return;
      if (result.status === "saved") {
        setEntries(result.entries);
        setNoteFor((prev) => {
          const next = { ...prev };
          delete next[entry.id];
          return next;
        });
        setJustScored(describeScore({ ...entry, outcome }));
        onChanged?.();
      }
    } finally {
      setResolving(null);
    }
  };

  const enoughToDistill = counts.resolved >= knobs.minResolvedToDistill;
  const stillNeeded = Math.max(0, knobs.minResolvedToDistill - counts.resolved);

  const distill = async () => {
    const resolvedIds = entries.filter(isResolved).map((e) => e.id);
    await run.launch(
      { rulebook_id: rulebook.id, entry_ids: resolvedIds, approach: "prediction_ledger" },
      `${resolvedIds.length} resolved calls`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={durableRunDialogOnOpenChange({
        running,
        reset: () => run.reset(),
        onOpenChange,
        runLabel: "Turning your calls into rules",
      })}
    >
      <DialogContent className="matrx-touch-targets max-h-[90dvh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Call it before you know</DialogTitle>
          <DialogDescription>
            Record what you think is going to happen on cases you are working
            right now, and one line on why. When the answer comes in, tell us
            how it went. The reasons behind the ones you call right become
            rules; the reasons behind the ones you miss show your system where
            its edges really are.
          </DialogDescription>
        </DialogHeader>

        {sitting.resumed ? (
          <SittingResumed
            what="the call you were in the middle of writing"
            onDiscard={sitting.discard}
            onAcknowledge={sitting.acknowledge}
          />
        ) : null}

        {knobs.problem ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{knobs.problem}</span>
          </p>
        ) : null}

        <div className="grid gap-5 md:grid-cols-2">
          {/* ───────────────── Call it ───────────────── */}
          <MasterworkDictationOrigin
            surface="masterwork.prediction_ledger"
            rulebookId={rulebook.id}
            rulebookName={rulebook.name}
          >
            <section className="space-y-3" data-surface-value="prediction_call">
              <h3 className="text-sm font-semibold text-foreground">
                Call it
              </h3>

              <div className="space-y-1.5">
                <Label htmlFor="pred-case">Which case is this?</Label>
                <Input
                  id="pred-case"
                  value={caseLabel}
                  onChange={(e) => setCaseLabel(e.target.value)}
                  placeholder="e.g. Claim #4821 — water damage, Tulsa"
                  className="text-base sm:text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pred-call">What do you think will happen?</Label>
                <ProTextarea
                  id="pred-call"
                  value={prediction}
                  onChange={(e) => setPrediction(e.target.value)}
                  onTranscriptionComplete={() => setUsedVoice(true)}
                  enableVoice={knobs.voiceDefaultOn}
                  placeholder="e.g. This claim is fraudulent."
                  rows={2}
                  className="text-base sm:text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label>How sure are you?</Label>
                <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
                  {CONFIDENCE_WORDS.map((rung) => (
                    <button
                      key={rung.value}
                      type="button"
                      onClick={() => setConfidence(rung.value)}
                      className={cn(
                        "min-h-10 rounded-md border px-1.5 py-1 text-center transition-colors",
                        confidence === rung.value
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card hover:border-muted-foreground/40",
                      )}
                    >
                      <span className="block text-[11px] font-medium leading-tight text-foreground">
                        {rung.words}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {Math.round(rung.value * 100)}%
                      </span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  You picked {confidenceWords(confidence)} —{" "}
                  {Math.round(confidence * 100)} times out of 100.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pred-why">Why do you think so? One line.</Label>
                <ProTextarea
                  id="pred-why"
                  value={why}
                  onChange={(e) => setWhy(e.target.value)}
                  onTranscriptionComplete={() => setUsedVoice(true)}
                  enableVoice={knobs.voiceDefaultOn}
                  placeholder="e.g. Third claim in 18 months, all just under the inspection threshold."
                  rows={3}
                  className="text-base sm:text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pred-due">
                  When will you know how it turned out?
                </Label>
                <Input
                  id="pred-due"
                  type="date"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="text-base sm:text-sm"
                />
              </div>

              {canEdit ? (
                <GatedActionButton
                  onClick={() => void submitCall()}
                  disabled={saving}
                  className="w-full"
                  wrapperClassName="w-full flex-col items-stretch justify-start"
                  reason={missingCallFields}
                >
                  {saving ? "Recording…" : "Record this call"}
                </GatedActionButton>
              ) : (
                <p className="text-xs text-muted-foreground">
                  You are looking at someone else&apos;s Rulebook, so you cannot
                  record calls on it. Ask them to share it with you for editing.
                </p>
              )}
            </section>
          </MasterworkDictationOrigin>

          {/* ───────────────── What happened ───────────────── */}
          <section className="space-y-3" data-surface-value="prediction_outcomes">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-foreground">
                What happened
              </h3>
              <span className="text-xs text-muted-foreground">
                {counts.open} waiting · {counts.resolved} answered
              </span>
            </div>

            {justScored ? (
              <p className="rounded-md border border-border bg-muted/40 p-2.5 text-xs text-foreground">
                {justScored}
              </p>
            ) : null}

            {openEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {counts.total === 0
                  ? "Nothing recorded yet. Make your first call on the left."
                  : "Every call you have made has an answer. Make a few more on the left."}
              </p>
            ) : (
              <div className="space-y-2">
                {openEntries.map((entry) => {
                  const overdue = entry.due_at !== "" && entry.due_at < today;
                  const dueSoon =
                    !overdue &&
                    entry.due_at !== "" &&
                    entry.due_at <= dueSoonThrough;
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "rounded-md border p-2.5",
                        overdue
                          ? "border-amber-500/50 bg-amber-500/5"
                          : dueSoon
                            ? "border-primary/40 bg-primary/5"
                            : "border-border bg-card",
                      )}
                    >
                      <p className="text-xs font-medium text-muted-foreground">
                        {entry.case_label}
                      </p>
                      <p className="mt-0.5 text-sm text-foreground">
                        {entry.prediction}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        You were {confidenceWords(entry.confidence)} ·{" "}
                        <span
                          className={cn(
                            "inline-flex items-center gap-1",
                            overdue && "font-medium text-amber-700 dark:text-amber-400",
                          )}
                        >
                          <CalendarClock className="h-3 w-3" />
                          {overdue
                            ? `answer was due ${entry.due_at}`
                            : dueSoon
                              ? `answer due ${entry.due_at} — coming up`
                              : `due ${entry.due_at}`}
                        </span>
                      </p>
                      {canEdit ? (
                        <>
                          <Input
                            value={noteFor[entry.id] ?? ""}
                            onChange={(e) =>
                              setNoteFor((prev) => ({
                                ...prev,
                                [entry.id]: e.target.value,
                              }))
                            }
                            placeholder="A line about how it went (optional)"
                            className="mt-2 text-base sm:text-sm"
                          />
                          <div className="mt-2 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={resolving === entry.id}
                              onClick={() => void settle(entry, true)}
                            >
                              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                              It happened
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={resolving === entry.id}
                              onClick={() => void settle(entry, false)}
                            >
                              <XCircle className="mr-1 h-3.5 w-3.5" />
                              It didn&apos;t
                            </Button>
                          </div>
                        </>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}

            <CalibrationReadout entries={entries} today={today} />
          </section>
        </div>

        {/* ───────────────── Distil ───────────────── */}
        <div ref={noticeRef} className="space-y-2 border-t border-border pt-3">
          {summary ? (
            <p className="text-sm text-foreground">
              {describePredictionDistill(summary)}
            </p>
          ) : null}
          {run.error ? (
            // The server's own sentence, verbatim. The "not enough outcomes"
            // refusal is a real, useful instruction — never a generic failure.
            <p className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{run.error}</span>
            </p>
          ) : null}
          <RunStages
            run={{ ...run, running }}
            waitingMessage="Reading your calls…"
          />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {/* One statement, not two: when the action is blocked the gate beside
              the button carries the sentence, so this line stops repeating it. */}
          <p className="text-xs text-muted-foreground">
            {enoughToDistill
              ? `${counts.resolved} answered calls ready to learn from.`
              : `${counts.resolved} of your ${counts.resolved + counts.open} calls ${counts.resolved === 1 ? "has" : "have"} an answer so far.`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={running}
            >
              Close
            </Button>
            {/* 🚨 THE SENTENCE AND THE BUTTON AGREE (jobs-bar lanes-B, W17,
                2026-09-16). The footer already says "4 more answers and your
                calls can be turned into rules" — and the button beside it sat
                fully enabled and blue, so the screen said two different things
                at once and pressing it spent a round trip to be told what was
                already written next to it. `GatedActionButton` is the ONE way
                this repo says no: the reason is rendered beside the control,
                wired by `aria-describedby`, never a dead button and never a
                silent one. The threshold is a knob, so the sentence names the
                live numbers rather than a constant. Nothing is hidden: if the
                server still refuses for a reason the client cannot know, that
                refusal now scrolls itself onto the screen (see `noticeRef`). */}
            {canEdit ? (
              <GatedActionButton
                onClick={() => void distill()}
                disabled={running}
                reason={firstBlockingReason([
                  {
                    when: counts.resolved === 0,
                    reason:
                      "None of your calls has an answer yet — score one when the outcome lands",
                  },
                  {
                    when: !enoughToDistill,
                    reason: `${stillNeeded} more ${stillNeeded === 1 ? "answer" : "answers"} before these can become rules`,
                  },
                ])}
              >
                {running
                  ? "Reading your calls…"
                  : "Turn the answered ones into rules"}
              </GatedActionButton>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
