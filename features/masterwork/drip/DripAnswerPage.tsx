"use client";

// features/masterwork/drip/DripAnswerPage.tsx
//
// THE ONE-FIELD ANSWER PAGE — where the link in the text message lands.
//
// ## Why this is a page and not a dialog
//
// The person opening this is standing somewhere, on a phone, having just read
// one sentence on a lock screen. They are not "in the app". Everything on this
// screen exists to get one answer out of them in under a minute:
//
//   * the question, big, and nothing above it competing for the eye;
//   * ONE field, with the microphone already armed — talking is faster than
//     typing and this whole Approach is a bet on that;
//   * one button;
//   * the streak underneath, where it can be seen but cannot get in the way.
//
// There is no navigation, no settings, no rules list. All of that is on the
// Rulebook page, one tap away, for the day they actually want it.
//
// ## 🚨 EVERY EMPTY STATE HERE IS A SENTENCE WITH A NEXT STEP
//
// Nothing asked yet · today already answered · the drip was never turned on ·
// it paused itself. Four states, four sentences, four doors. A person who
// tapped a link and got a blank screen would never tap the next one.

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, PauseCircle } from "lucide-react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { knobInt } from "@/lib/knobs/featureKnobs";
import { MasterworkDictationOrigin } from "../MasterworkDictationOrigin";
import type { Rulebook } from "../types";
import { DripStreakReadout } from "./DripStreakReadout";
import { DRIP_KNOB_FEATURE } from "./DailyDripDialog";
import { answerDripDay, dripOf } from "./service";
import {
  DRIP_PROBES,
  answeredDays,
  dayLabel,
  isPaused,
  openQuestion,
  type DripDay,
} from "./scoring";

export function DripAnswerPage({
  rulebook,
  onAnswered,
}: {
  rulebook: Rulebook;
  /** The lane route reloads the Rulebook so the streak below is never stale. */
  onAnswered?: () => void;
}) {
  const drip = useMemo(() => dripOf(rulebook), [rulebook]);
  const question = openQuestion(drip.days);
  const answered = answeredDays(drip.days);
  const latestAnswered = answered.length ? answered[answered.length - 1] : null;

  const [answer, setAnswer] = useState("");
  const [usedVoice, setUsedVoice] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<DripDay | null>(null);

  // 🚨 The scoreboard's "N more answers and these become rules" sentence is
  // governed by a knob an organization can move. Reading it here rather than
  // hardcoding a copy is the difference between two screens agreeing about the
  // same person and one of them quietly lying. The read is cached and this page
  // renders without waiting on it; until it lands the sentence that depends on
  // it is simply not shown.
  const [minAnswers, setMinAnswers] = useState<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    void knobInt(DRIP_KNOB_FEATURE, "min_answers_to_distill")
      .then((value) => {
        if (!cancelled) setMinAnswers(value);
      })
      .catch(() => {
        /* The scoreboard drops one sentence; nothing on this page needs it. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (day: DripDay) => {
    // The button is gated on the same condition, so an empty answer cannot
    // reach here. A person who has not typed yet is NOT in an error state —
    // this used to fire a red toast at them (class sweep, 2026-09-16).
    if (!answer.trim()) return;
    setSaving(true);
    try {
      const result = await answerDripDay(
        rulebook.id,
        day.day,
        answer,
        usedVoice ? "voice" : "typed",
      );
      if (result.status === "saved") {
        setJustSaved({ ...day, answer: answer.trim() });
        setAnswer("");
        setUsedVoice(false);
        onAnswered?.();
        return;
      }
      if (result.status === "conflict") {
        toast.error(
          "Something else changed this Rulebook at the same moment. Nothing was lost — try saving again.",
        );
        return;
      }
      toast.error(
        "That question could not be found — it may have been answered somewhere else already.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-6">
      {justSaved ? (
        <section
          className="space-y-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-5"
          data-surface-value="drip_answer_saved"
        >
          <p className="flex items-center gap-2 text-base font-medium text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-5 w-5" />
            Got it. That&apos;s today done.
          </p>
          <p className="text-sm text-muted-foreground">
            Tomorrow&apos;s question comes at your usual time. Nothing else to do.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/masterwork/${rulebook.id}`}>See your Rulebook</Link>
          </Button>
        </section>
      ) : question ? (
        <MasterworkDictationOrigin
          surface="masterwork.daily_drip"
          rulebookId={rulebook.id}
          rulebookName={rulebook.name}
        >
          <section className="space-y-4" data-surface-value="drip_answer">
            <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              {dayLabel(question.day)}
              {" · "}
              {DRIP_PROBES[question.probe as keyof typeof DRIP_PROBES]?.label ??
                question.probe}
            </p>
            {/* The question, and nothing above it competing for the eye. */}
            <h1 className="text-xl font-semibold leading-snug text-foreground sm:text-2xl">
              {question.question}
            </h1>
            <ProTextarea
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              onTranscriptionComplete={() => setUsedVoice(true)}
              placeholder="Tap the microphone and just say it. A sentence or two is plenty."
              minHeight={140}
              autoGrow
              autoFocus
            />
            <GatedActionButton
              size="lg"
              className="w-full"
              wrapperClassName="w-full flex-col items-stretch justify-start"
              disabled={saving}
              reason={firstBlockingReason([
                { when: !answer.trim(), reason: "Say something first — a sentence is plenty" },
              ])}
              onClick={() => submit(question)}
            >
              {saving ? <LoadingSpinner size="sm" /> : null}
              Send my answer
            </GatedActionButton>
            <p className="text-xs text-muted-foreground">
              It goes straight into {rulebook.name}, in your own words, with today&apos;s
              date and this question attached to it.
            </p>
          </section>
        </MasterworkDictationOrigin>
      ) : isPaused(drip) ? (
        <section
          className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-5"
          data-surface-value="drip_answer_paused"
        >
          <p className="flex items-center gap-2 text-base font-medium text-amber-800 dark:text-amber-300">
            <PauseCircle className="h-5 w-5" />
            Your daily question is paused
          </p>
          <p className="text-sm text-muted-foreground">
            {drip.subscription?.pause_reason ||
              "Several questions in a row went unanswered, so we stopped asking."}{" "}
            Nothing is lost — start it again from your Rulebook and it picks up where it
            left off.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/masterwork/${rulebook.id}?drip=1`}>Start it again</Link>
          </Button>
        </section>
      ) : (
        /* 🚨 THE DOOR STATE IS A SCREEN, NOT A LEFTOVER (jobs-bar-2026-09-16,
           items 18–19). Its three siblings above — answered, paused, today's
           question — are each a framed card. This one, the FIRST thing anyone
           who has not started the drip ever sees, was three loose lines of text
           pushed against the left edge under a page header reading "Today's
           question" when there is no question. And it promised "It takes one
           tap" for a control that leaves this page, loads the Masterwork, and
           opens a dialog with three more choices in it. So: a card like its
           siblings, a sentence that describes what actually happens, and the
           terms stated before the opt-in rather than after it. */
        <section
          className="space-y-3 rounded-lg border border-border bg-card p-5"
          data-surface-value="drip_answer_none"
        >
          <h1 className="flex items-center gap-2 text-base font-medium text-foreground">
            <CalendarClock className="h-5 w-5 text-muted-foreground" />
            {latestAnswered || drip.subscription
              ? "Nothing to answer right now"
              : "You haven't started the daily question"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {latestAnswered ? (
              <>
                You answered {dayLabel(latestAnswered.day)}&apos;s question already. The
                next one comes at your usual time.
              </>
            ) : drip.subscription ? (
              <>
                Your first question hasn&apos;t gone out yet — it arrives at the time you
                picked.
              </>
            ) : (
              <>
                One short question a day about the work you actually did, at a time you
                pick. Answering takes about a minute, and your answers become rules in{" "}
                {rulebook.name}. Miss a day and nothing breaks — miss a week and we stop
                asking rather than fill up your phone.
              </>
            )}
          </p>
          <Button asChild size={drip.subscription ? "sm" : "default"} variant={drip.subscription ? "outline" : "default"}>
            <Link href={`/masterwork/${rulebook.id}?drip=1`}>
              {drip.subscription
                ? "Open your daily question"
                : "Choose a time and start"}
            </Link>
          </Button>
          {drip.subscription ? null : (
            <p className="text-xs text-muted-foreground">
              Next you pick where it arrives and what time — you can stop it whenever
              you like.
            </p>
          )}
        </section>
      )}

      {/* The scoreboard is for a drip that HAS a history. On a Masterwork that
          never started one it printed a lone "Nothing has been asked yet." under
          the card that had just said the same thing in better words
          (jobs-bar-2026-09-16, item 20). */}
      {drip.subscription || answered.length > 0 ? (
        <DripStreakReadout
          drip={drip}
          rules={rulebook.rules ?? []}
          minAnswersToDistill={minAnswers}
        />
      ) : null}
    </div>
  );
}
