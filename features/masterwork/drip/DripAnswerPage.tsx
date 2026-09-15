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
    if (!answer.trim()) {
      toast.error("Say something first — a sentence is plenty.");
      return;
    }
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
            <Button
              size="lg"
              className="w-full"
              disabled={saving}
              onClick={() => submit(question)}
            >
              {saving ? <LoadingSpinner size="sm" /> : null}
              Send my answer
            </Button>
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
        <section className="space-y-3" data-surface-value="drip_answer_none">
          <h1 className="text-xl font-semibold text-foreground">
            Nothing to answer right now
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
                The daily question isn&apos;t switched on for this Rulebook yet. It takes
                one tap.
              </>
            )}
          </p>
          <Button asChild size="sm" variant="outline">
            <Link href={`/masterwork/${rulebook.id}?drip=1`}>
              {drip.subscription ? "Open your daily question" : "Turn it on"}
            </Link>
          </Button>
        </section>
      )}

      <DripStreakReadout
        drip={drip}
        rules={rulebook.rules ?? []}
        minAnswersToDistill={minAnswers}
      />
    </div>
  );
}
