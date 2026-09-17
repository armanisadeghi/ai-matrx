"use client";

// features/masterwork/drip/DailyDripDialog.tsx
//
// THE DAILY DRIP's door: turn it on, see the streak, answer today's question,
// and turn a run of answers into rules.
//
// ## What this screen is and is not
//
// It is NOT where the answering normally happens. The whole point of the
// Approach is that the question comes to the Expert — on their phone, at their
// hour — and they answer it from wherever they are, on
// `/masterwork/[id]/drip`. This dialog is the settings and the scoreboard: the
// place somebody opens once to start, and then every couple of weeks to see
// what a minute a day has actually bought them.
//
// ## 🚨 EVERY STATE ON THIS SCREEN IS SAID IN WORDS
//
// Not subscribed, running, paused-by-silence, stopped-by-choice, asked-but-
// unanswered, answered-but-not-enough-to-distill — six states, and each one
// says which it is and what the Expert can do about it. The one thing this
// screen may never do is look busy while nothing is happening, or imply a
// question went out when none did.

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Flame,
  Mail,
  MessageSquare,
  PauseCircle,
  Send,
  Smartphone,
} from "lucide-react";
import { useStore } from "react-redux";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { knobBool, knobInt, knobString } from "@/lib/knobs/featureKnobs";
import type { AppStore } from "@/lib/redux/store";
import type { paths } from "@/types/python-generated/api-types";
import { durableRunDialogOnOpenChange } from "@/lib/durable-run/durableRunDialogClose";
import { MasterworkDictationOrigin } from "../MasterworkDictationOrigin";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";
import { useRunResultOnce } from "../durable-run/useRunResultOnce";
import type { Rulebook } from "../types";
import { DripStreakReadout } from "./DripStreakReadout";
import {
  answerDripDay,
  dripOf,
  resumeDrip,
  sendOutcomeSentence,
  sendTodaysQuestion,
  stopDrip,
  subscribeToDrip,
  type DripWriteResult,
} from "./service";
import {
  DRIP_CHANNELS,
  DRIP_PROBES,
  answeredDays,
  dayLabel,
  dripYield,
  hourLabel,
  isActive,
  isPaused,
  localTimezone,
  openQuestion,
  undistilledAnswered,
  type DripChannel,
  type DripDay,
  type DripQuestionSet,
} from "./scoring";

/**
 * Served by `aidream/aidream/services/distillation/drip_ingest.py`.
 *
 * Cast pending the OpenAPI type sync, the same precedent the prediction and
 * unfolding lanes set: `pnpm sync-types` needs a machine with database access.
 * Until it runs, a wrong path fails LOUDLY with the real HTTP error and
 * everything else on this screen stays typed. Remedy: `pnpm sync-types`.
 */
const INGEST_DRIP_PATH = "/masterworks/ingest-drip" as keyof paths;

/** The feature these knobs belong to — registered by the server half. */
export const DRIP_KNOB_FEATURE = "masterwork_daily_drip";

/**
 * The values the knobs START at, declared here so a missing row degrades into a
 * visible warning rather than a broken dialog. These are NOT a fallback the
 * system settles into: the banner names the missing knobs every time it is used.
 */
export const DECLARED_KNOB_DEFAULTS = {
  send_hour_local: 8,
  default_channel: "email" as DripChannel,
  question_set: "mixed" as DripQuestionSet,
  pause_after_silent_days: 7,
  min_answers_to_distill: 3,
};

interface KnobState {
  sendHourLocal: number;
  defaultChannel: DripChannel;
  questionSet: DripQuestionSet;
  pauseAfterSilentDays: number;
  minAnswersToDistill: number;
  /** The sentence shown in place when a knob row could not be read. */
  problem: string | null;
}

const PENDING_KNOBS: KnobState = {
  sendHourLocal: DECLARED_KNOB_DEFAULTS.send_hour_local,
  defaultChannel: DECLARED_KNOB_DEFAULTS.default_channel,
  questionSet: DECLARED_KNOB_DEFAULTS.question_set,
  pauseAfterSilentDays: DECLARED_KNOB_DEFAULTS.pause_after_silent_days,
  minAnswersToDistill: DECLARED_KNOB_DEFAULTS.min_answers_to_distill,
  problem: null,
};

export interface DripDistillSummary {
  added: number;
  duplicates: number;
  quotesVerified: number;
  quotesUnverified: number;
}

export function parseDripSummary(raw: unknown): DripDistillSummary | null {
  const data = (raw ?? {}) as Record<string, unknown>;
  if (data.type !== "masterwork_ingest_complete") return null;
  return {
    added: Number(data.added ?? 0),
    duplicates: Number(data.duplicates_skipped ?? 0),
    quotesVerified: Number(data.quotes_verified ?? 0),
    quotesUnverified: Number(data.quotes_unverified ?? 0),
  };
}

const CHANNEL_ICON: Record<DripChannel, typeof Mail> = {
  email: Mail,
  in_app: MessageSquare,
  sms: Smartphone,
};

/**
 * The hours worth offering. A drip at 3am is a drip nobody answers.
 *
 * 5am to 9pm, every hour, with no gaps. 1pm and 3pm used to be simply missing
 * from this list (jobs-bar-2026-09-16, item 22) — nothing said why, because
 * there is no why: an Expert who takes her lunch at one and wanted the question
 * to land right after it could not have it, and read the hole as a rule about
 * her day that nobody had explained to her.
 */
const HOURS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21];

import { createSittingStore, type SittingBase } from "../sitting/sitting";
import { useDialogSitting } from "../sitting/useDialogSitting";
import { SittingResumed } from "../sitting/SittingResumed";
import { IngestOutcome, RunStages } from "../components/RunStages";
import { describeIngest } from "../components/detail/IngestSourceDialog";

/**
 * A HALF-TYPED ANSWER TO TODAY'S QUESTION IS REAL WORK. Cold walk 6
 * (2026-09-17) found this lane in the same class as the Red-Pen lane: the
 * deep link would not reopen, and nothing typed into it survived a reload.
 * The link is fixed in the primitive that owns deep-link arrivals; the answer
 * is kept here.
 */
interface DripSitting extends SittingBase {
  answer: string;
}

const dripSittings = createSittingStore<DripSitting>({
  keyPrefix: "matrx.masterwork.daily-drip-answer.v1:",
  isUsable: (sitting) => (sitting.answer ?? "").trim().length > 0,
});

export function DailyDripDialog({
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
  /** The page reloads the Rulebook — a new answer and new drafts both land there. */
  onChanged?: () => void;
}) {
  const store = useStore() as AppStore;
  const [drip, setDrip] = useState(() => dripOf(rulebook));
  useEffect(() => {
    setDrip(dripOf(rulebook));
  }, [rulebook]);

  const [knobs, setKnobs] = useState<KnobState>(PENDING_KNOBS);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const [hour, channel, set, pauseAfter, minAnswers] = await Promise.all([
          knobInt(DRIP_KNOB_FEATURE, "send_hour_local"),
          knobString(DRIP_KNOB_FEATURE, "default_channel"),
          knobString(DRIP_KNOB_FEATURE, "question_set"),
          knobInt(DRIP_KNOB_FEATURE, "pause_after_silent_days"),
          knobInt(DRIP_KNOB_FEATURE, "min_answers_to_distill"),
        ]);
        if (cancelled) return;
        setKnobs({
          sendHourLocal: hour,
          defaultChannel: (channel as DripChannel) || "email",
          questionSet: (set as DripQuestionSet) || "mixed",
          pauseAfterSilentDays: pauseAfter,
          minAnswersToDistill: minAnswers,
          problem: null,
        });
      } catch (err) {
        if (cancelled) return;
        // LAW 4. The settings this screen obeys could not be read, so the
        // screen says which ones and what it is running on instead.
        setKnobs({
          ...PENDING_KNOBS,
          problem:
            `The settings for this feature could not be read (${
              err instanceof Error ? err.message : String(err)
            }). It is running on the starting values — ` +
            `${hourLabel(DECLARED_KNOB_DEFAULTS.send_hour_local)} by email, ` +
            `paused after ${DECLARED_KNOB_DEFAULTS.pause_after_silent_days} silent days, ` +
            `${DECLARED_KNOB_DEFAULTS.min_answers_to_distill} answers before rules. ` +
            `An administrator can fix this by seeding the "${DRIP_KNOB_FEATURE}" knobs.`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ─── The form (pre-filled from the subscription, else from the knobs) ────
  const sub = drip.subscription;
  const [channel, setChannel] = useState<DripChannel>(knobs.defaultChannel);
  const [hour, setHour] = useState<number>(knobs.sendHourLocal);
  const [questionSet, setQuestionSet] = useState<DripQuestionSet>(knobs.questionSet);
  useEffect(() => {
    setChannel(sub?.channel ?? knobs.defaultChannel);
    setHour(sub?.send_hour_local ?? knobs.sendHourLocal);
    setQuestionSet(sub?.question_set ?? knobs.questionSet);
  }, [sub, knobs]);

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);

  const sitting = useDialogSitting<DripSitting>({
    store: dripSittings,
    scopeId: rulebook.id,
    active: open,
    snapshot: { answer },
    isWorthKeeping: (s) => s.answer.trim().length > 0,
    apply: (kept) => setAnswer(kept.answer ?? ""),
    clearScreen: () => {
      setAnswer("");
      setUsedVoice(false);
    },
  });

  const running = isActive(drip);
  const paused = isPaused(drip);
  const stopped = Boolean(sub) && !sub?.active;
  const today = openQuestion(drip.days);
  const answered = answeredDays(drip.days);
  const pending = undistilledAnswered(drip.days);
  const report = useMemo(
    () => dripYield(drip.days, rulebook.rules ?? []),
    [drip.days, rulebook.rules],
  );

  const run = useMasterworkRun<DripDistillSummary>({
    surface: "drip",
    rulebookId: rulebook.id,
    path: INGEST_DRIP_PATH,
    parseResult: parseDripSummary,
  });
  useRunResultOnce(run, onChanged);

  const reportWrite = (status: DripWriteResult["status"]): boolean => {
    if (status === "saved") return true;
    if (status === "conflict") {
      toast.error(
        "Someone else saved this Rulebook while you were typing, and we could not " +
          "merge the two. Nothing was lost — close this and open it again.",
      );
      return false;
    }
    toast.error(
      "That question could not be found — it may have been answered somewhere else already.",
    );
    return false;
  };

  const save = async () => {
    setSaving(true);
    try {
      const result = await subscribeToDrip(rulebook.id, {
        channel,
        sendHourLocal: hour,
        questionSet,
        timezone: localTimezone(),
      });
      if (!reportWrite(result.status)) return;
      if (result.status === "saved") {
        setDrip(result.drip);
        toast.success(
          `Set. One question a day at ${hourLabel(hour)}, ${
            DRIP_CHANNELS.find((c) => c.key === channel)?.label.toLowerCase() ?? channel
          }.`,
        );
        onChanged?.();
      }
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "That could not be saved. Nothing was turned on — try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const sendNow = async () => {
    setSending(true);
    try {
      const outcome = sendOutcomeSentence(await sendTodaysQuestion(store, rulebook.id));
      if (outcome.ok) toast.success(outcome.sentence);
      else toast.error(outcome.sentence);
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Today's question could not be sent.");
    } finally {
      setSending(false);
    }
  };

  const submitAnswer = async (day: DripDay) => {
    // Gated on the button, so an empty answer never reaches here. Not having
    // typed yet is a PROMPT, not an alarm (class sweep, 2026-09-16).
    if (!answer.trim()) return;
    setAnswering(true);
    try {
      const result = await answerDripDay(
        rulebook.id,
        day.day,
        answer,
        usedVoice ? "voice" : "typed",
      );
      if (!reportWrite(result.status)) return;
      if (result.status === "saved") {
        setDrip(result.drip);
        setAnswer("");
        sitting.forget();
        setUsedVoice(false);
        toast.success("Got it. That's today done.");
        onChanged?.();
      }
    } finally {
      setAnswering(false);
    }
  };

  const enoughToDistill = answered.length >= knobs.minAnswersToDistill;
  const stillNeeded = Math.max(0, knobs.minAnswersToDistill - answered.length);

  const distill = async () => {
    await run.launch(
      {
        rulebook_id: rulebook.id,
        days: pending.map((d) => d.day),
        approach: "daily_drip",
      },
      `${pending.length} days of answers`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={durableRunDialogOnOpenChange({
        running: run.running,
        reset: () => run.reset(),
        onOpenChange,
        runLabel: "Turning your answers into rules",
      })}
    >
      <DialogContent className="matrx-touch-targets max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>One question a day</DialogTitle>
          <DialogDescription>
            Every day at the time you pick, we send you one short question about
            the work you actually did — what you decided that a new hire would
            have gotten wrong, what you fixed in someone else&apos;s work, what
            you turned down and why. Answer it by talking for a minute. Miss a
            day and nothing breaks.
          </DialogDescription>
        </DialogHeader>

        {sitting.resumed ? (
          <SittingResumed
            what="the answer you had started typing"
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

        {/* ─────────── The state, said in words, before anything else ─────── */}
        {paused ? (
          <div
            className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300"
            data-surface-value="drip_paused"
          >
            <PauseCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>
                {sub?.pause_reason ||
                  `${report.silentRun} questions in a row went unanswered, so we stopped asking.`}{" "}
                Nothing is lost — starting again picks up where it left off.
              </p>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const result = await resumeDrip(rulebook.id);
                      if (reportWrite(result.status) && result.status === "saved") {
                        setDrip(result.drip);
                        toast.success("Started again. The next question goes out at your time.");
                        onChanged?.();
                      }
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  Start asking me again
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* ─────────── Today's open question ─────────── */}
        {today ? (
          <MasterworkDictationOrigin
            surface="masterwork.daily_drip"
            rulebookId={rulebook.id}
            rulebookName={rulebook.name}
          >
            <section
              className="space-y-3 rounded-lg border border-border bg-muted/30 p-4"
              data-surface-value="drip_today"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarClock className="h-3.5 w-3.5" />
                  {dayLabel(today.day)}
                  {" · "}
                  {DRIP_PROBES[today.probe as keyof typeof DRIP_PROBES]?.label ?? today.probe}
                </span>
              </div>
              <p className="text-base font-medium leading-snug text-foreground">
                {today.question}
              </p>
              {canEdit ? (
                <>
                  <ProTextarea
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    onTranscriptionComplete={() => setUsedVoice(true)}
                    placeholder="Talk or type. A sentence or two is plenty."
                    minHeight={90}
                    autoGrow
                  />
                  <GatedActionButton
                    size="sm"
                    disabled={answering}
                    wrapperClassName="justify-start"
                    reason={firstBlockingReason([
                      {
                        when: !answer.trim(),
                        reason: "Say something first — a sentence is plenty",
                      },
                    ])}
                    onClick={() => submitAnswer(today)}
                  >
                    {answering ? <LoadingSpinner size="sm" /> : null}
                    Save my answer
                  </GatedActionButton>
                </>
              ) : null}
            </section>
          </MasterworkDictationOrigin>
        ) : null}

        {/* ─────────── The scoreboard ───────────
            Only once there IS a drip to keep score of. On a first visit it put
            a lone "Nothing has been asked yet." between the explanation and the
            "Start a daily question" heading — a status line about something the
            Expert has not agreed to yet, in the one spot where she is deciding
            whether to (jobs-bar-2026-09-16, item 20). */}
        {drip.subscription || drip.days.length > 0 ? (
          <DripStreakReadout
            drip={drip}
            rules={rulebook.rules ?? []}
            minAnswersToDistill={knobs.minAnswersToDistill}
          />
        ) : null}

        {/* ─────────── Settings ─────────── */}
        {canEdit ? (
          <section className="space-y-4" data-surface-value="drip_settings">
            <h3 className="text-sm font-semibold text-foreground">
              {sub ? "Your daily question" : "Start a daily question"}
            </h3>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Where it arrives</Label>
              <div className="flex flex-wrap gap-2">
                {DRIP_CHANNELS.map((option) => {
                  const Icon = CHANNEL_ICON[option.key];
                  const selected = channel === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setChannel(option.key)}
                      className={cn(
                        "flex max-w-[15rem] flex-1 flex-col items-start gap-1 rounded-md border p-2.5 text-left text-xs transition",
                        selected
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                      aria-pressed={selected}
                    >
                      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </span>
                      {/* 🚨 The note is what the platform can actually keep.
                          Text messages are live, and they need a verified
                          number — saying so here is the difference between a
                          setting and a promise nobody checked. */}
                      <span>{option.note}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">What time</Label>
              <div className="flex flex-wrap gap-1.5">
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    onClick={() => setHour(h)}
                    aria-pressed={hour === h}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition",
                      hour === h
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {hourLabel(h)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Your own time, wherever you are ({localTimezone()}).
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Which questions</Label>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ["mixed", "All three, rotating"],
                    ["contrast", DRIP_PROBES.contrast.label],
                    ["correction_log", DRIP_PROBES.correction_log.label],
                    ["refusal", DRIP_PROBES.refusal.label],
                  ] as ReadonlyArray<[DripQuestionSet, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setQuestionSet(key)}
                    aria-pressed={questionSet === key}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition",
                      questionSet === key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-primary/40",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              If {knobs.pauseAfterSilentDays} questions in a row go unanswered we stop
              asking and tell you, rather than filling up your phone.
            </p>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={saving} onClick={save}>
                {saving ? <LoadingSpinner size="sm" /> : null}
                {running ? "Save these settings" : "Start asking me"}
              </Button>
              {running ? (
                <>
                  <Button size="sm" variant="outline" disabled={sending} onClick={sendNow}>
                    {sending ? <LoadingSpinner size="sm" /> : <Send className="h-3.5 w-3.5" />}
                    Send today&apos;s question now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        const result = await stopDrip(rulebook.id);
                        if (reportWrite(result.status) && result.status === "saved") {
                          setDrip(result.drip);
                          toast.success("Stopped. Your answers so far are all still here.");
                          onChanged?.();
                        }
                      } finally {
                        setSaving(false);
                      }
                    }}
                  >
                    Stop asking me
                  </Button>
                </>
              ) : null}
              {stopped ? (
                <span className="self-center text-xs text-muted-foreground">
                  Stopped — your {answered.length} answer
                  {answered.length === 1 ? "" : "s"} are still here.
                </span>
              ) : null}
            </div>
          </section>
        ) : null}

        {/* ─────────── Turn answers into rules ─────────── */}
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {/* 🚨 THE HONEST WAITING STATE. A drip spends most of its life with
                too little to distil, and that is neither a failure nor a
                success — the sentence says exactly how far off it is. */}
            {!enoughToDistill ? (
              answered.length === 0 ? (
                <>No answers yet. The first question has to go out and come back.</>
              ) : (
                <>
                  {stillNeeded} more answer{stillNeeded === 1 ? "" : "s"} and these can be
                  turned into rules.
                </>
              )
            ) : pending.length === 0 ? (
              <>
                <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                Every answer so far has been read into rules. Answer a few more mornings.
              </>
            ) : (
              <>
                <Flame className="mr-1 inline h-3.5 w-3.5" />
                {pending.length} day{pending.length === 1 ? "" : "s"} of answers ready to
                become rules.
              </>
            )}
          </p>
          <Button
            size="sm"
            disabled={!canEdit || run.running || !enoughToDistill || pending.length === 0}
            onClick={distill}
          >
            {run.running ? <LoadingSpinner size="sm" /> : null}
            Turn my answers into rules
          </Button>
        </DialogFooter>

        {/* 🚨 THIS LANE USED TO WRITE ITS OWN SUMMARY, and with nothing added
            it read "0 new rules added. 0 quotes checked word-for-word against
            what you actually said." — a clean zero congratulating itself: the
            same defect `describeIngest` was fixed for on 2026-09-15 and the
            same one cold walk 8 found on the Meeting Scavenger. There is ONE
            honest summary on this platform and this lane now prints it. */}
        {run.result ? (
          <IngestOutcome
            summary={describeIngest({
              added: run.result.added,
              duplicatesSkipped: run.result.duplicates,
              quotesUnverified: run.result.quotesUnverified,
              failedChunks: 0,
              skippedWords: 0,
              followupSeed: null,
              alreadyDistilled: 0,
            })}
            added={run.result.added}
            run={run}
          />
        ) : (
          <RunStages run={run} waitingMessage="Turning your answers into rules…" />
        )}
      </DialogContent>
    </Dialog>
  );
}
