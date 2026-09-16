"use client";

// features/masterwork/teach-back/TeachBack.tsx
//
// THE TEACH-BACK — the Expert's screen. One lane, one page, reached from the
// Approach catalog card and from `/masterwork/[id]/teach-back`.
//
// What happens here, in the Expert's terms: we read everything they've given us
// and explain how we think they decide, out loud, in about a minute. They
// interrupt — "no, not like that", "you missed the part where…", "that's right
// but only when…". Every interruption becomes rules AND steers the next
// explanation, which says it back again with their correction in it. It ends
// when they say "yes, that's it", and that sign-off is recorded on the rules
// the explanation was built from.
//
// ## Four things this screen must never do
//
// 1. **Never claim the explanation is theirs when it isn't.** On an empty
//    Rulebook we describe what a competent generalist would do. The banner over
//    the explanation says which it is, every round, in plain words — never a
//    badge, never nothing.
// 2. **Never show a dead speaker.** Audio is armed inside the click that starts
//    a round (`primeAudioOutput`), because WebKit silently plays nothing
//    otherwise. If the browser blocks it, the text is already on screen and the
//    play control says what happened.
// 3. **Never invent the count.** "Round 3 of 6" comes from the server's own
//    `round_index` / `round_count`; the cap is the org knob and the screen has
//    no opinion about it.
// 4. **Never say "signed" without a signature.** "Yes, that's it" writes the
//    verdict through the ONE expert-signature path, and if that write fails the
//    screen says so and does not finish the session behind their back.
//
// Server half: `aidream/aidream/services/distillation/teach_back.py`.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Loader2,
  Pause,
  Play,
  Square,
  ThumbsUp,
  Volume2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { knobBool, knobInt } from "@/lib/knobs/featureKnobs";
import { cn } from "@/lib/utils";
import { primeAudioOutput } from "@/features/audio/unlock";
import { useSpeech } from "@/features/audio/service/useSpeech";
import { saveOutputFeedback } from "@/lib/output-feedback/service";
import {
  EXPERT_SIGNATURE_SURFACE,
  MASTERWORK_DISTILLATION_RUN_SUBJECT_TYPE,
} from "../review/signature";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";
import type { Rulebook } from "../types";
import {
  DECLARED_KNOB_DEFAULTS,
  TEACH_BACK_KNOB_FEATURE,
  TEACH_BACK_PATH,
  buildTeachBackRequest,
  describeBasis,
  describeCorrection,
  parseTeachBackRound,
  type TeachBackRound,
  type TeachBackRoundResult,
} from "./service";

interface KnobState {
  rounds: number;
  explanationSeconds: number;
  voiceDefaultOn: boolean;
  /** The sentence shown in place when a knob row could not be read. */
  problem: string | null;
}

const PENDING_KNOBS: KnobState = {
  rounds: DECLARED_KNOB_DEFAULTS.rounds,
  explanationSeconds: DECLARED_KNOB_DEFAULTS.explanation_seconds,
  voiceDefaultOn: DECLARED_KNOB_DEFAULTS.voice_default_on,
  problem: null,
};

export function TeachBack({
  rulebook,
  canEdit,
  onChanged,
}: {
  rulebook: Rulebook;
  canEdit: boolean;
  /** The page reloads the Rulebook — every answered round writes drafts on it. */
  onChanged?: () => void;
}) {
  const [topic, setTopic] = useState("");
  const [rounds, setRounds] = useState<TeachBackRound[]>([]);
  // The explainer's own "the part I'm least sure about" for each round. Kept
  // BESIDE the wire rounds, never on them: `TeachBackRound` is the request
  // contract (the server forbids extra keys), and this is a screen affordance —
  // the invitation to interrupt — not something the distiller ever reads.
  const [uncertainParts, setUncertainParts] = useState<string[]>([]);
  const [correction, setCorrection] = useState("");
  const [lastCorrection, setLastCorrection] = useState<string | null>(null);
  const [finished, setFinished] = useState<TeachBackRoundResult | null>(null);
  const [signing, setSigning] = useState(false);
  const [signatureProblem, setSignatureProblem] = useState<string | null>(null);

  const [knobs, setKnobs] = useState<KnobState>(PENDING_KNOBS);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [roundCount, seconds, voice] = await Promise.all([
          knobInt(TEACH_BACK_KNOB_FEATURE, "rounds"),
          knobInt(TEACH_BACK_KNOB_FEATURE, "explanation_seconds"),
          knobBool(TEACH_BACK_KNOB_FEATURE, "voice_default_on"),
        ]);
        if (cancelled) return;
        setKnobs({
          rounds: roundCount,
          explanationSeconds: seconds,
          voiceDefaultOn: voice,
          problem: null,
        });
      } catch (err) {
        if (cancelled) return;
        // NOTHING FAILS SILENTLY. The settings this screen obeys could not be
        // read, so the screen names them and what it is running on instead.
        setKnobs({
          ...PENDING_KNOBS,
          problem:
            `The settings for this feature could not be read (${
              err instanceof Error ? err.message : String(err)
            }). It is running on the starting values — spoken aloud, about ` +
            `${DECLARED_KNOB_DEFAULTS.explanation_seconds} seconds per round, up ` +
            `to ${DECLARED_KNOB_DEFAULTS.rounds} rounds. An administrator can fix ` +
            `this by seeding the "${TEACH_BACK_KNOB_FEATURE}" knobs.`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useMasterworkRun<TeachBackRoundResult>({
    surface: "teach_back",
    rulebookId: rulebook.id,
    path: TEACH_BACK_PATH,
    parseResult: parseTeachBackRound,
  });

  const current = rounds.length ? rounds[rounds.length - 1] : null;

  // THE ONE SPEAK ENTRY POINT (`features/audio/service/speak.ts`), through its
  // React face. `adoptText` re-attaches to audio still playing in the shared
  // queue after a remount, so navigating away and back does not start a second
  // voice over the first.
  const speech = useSpeech({
    label: "Teach-back",
    processMarkdown: false,
    adoptText: current?.explanation,
  });
  const { speak: speakText, status: speechStatus, pause, resume } = speech;

  const speakExplanation = useCallback(
    (text: string) => {
      if (!text.trim()) return;
      // WebKit plays SILENCE for audio started outside a user gesture, with no
      // error. Priming here is what makes the voice real on a phone.
      primeAudioOutput();
      speakText(text);
    },
    [speakText],
  );

  // THE TERMINAL PAYLOAD IS THE NEXT QUESTION. Every other Masterwork lane's
  // result is a summary; this one carries the next explanation, so adopting it
  // is what advances the session. Keyed on the round index so a rejoin that
  // settles from the durable row lands exactly once.
  const result = run.result;
  const [adopted, setAdopted] = useState<number>(-1);
  const voiceOn = knobs.voiceDefaultOn;
  useEffect(() => {
    if (!result) return;
    if (result.roundIndex === adopted && result.done === Boolean(finished)) return;
    setAdopted(result.roundIndex);
    setLastCorrection(describeCorrection(result));
    if (result.rulesAdded > 0) onChanged?.();
    if (result.done) {
      setFinished(result);
      return;
    }
    setRounds((previous) => [
      ...previous,
      {
        subject: result.subject,
        explanation: result.explanation,
        basis: result.basis,
        rule_ids: result.ruleIdsCited,
        correction: "",
      },
    ]);
    setUncertainParts((previous) => [...previous, result.uncertainPart]);
    setCorrection("");
    if (voiceOn) speakExplanation(result.explanation);
    // `finished` is read only to let a done payload settle once; adding it to
    // the deps would re-run this effect on the state it just set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, adopted, onChanged, voiceOn, speakExplanation]);

  const running = run.running;
  const started = rounds.length > 0 || finished !== null;
  const roundCount = result?.roundCount || knobs.rounds;
  const runIdRef = useRef<string>("");
  if (result?.runId) runIdRef.current = result.runId;

  const send = async (input: {
    agreed: boolean;
    withCorrection?: boolean;
    signatureSubjectId?: string;
  }) => {
    // Every round plays audio, and the browser only unlocks output inside a
    // gesture — so prime on the click that STARTS the round, not when the audio
    // eventually arrives seconds later.
    primeAudioOutput();
    const outgoing = rounds.map((round, index) =>
      index === rounds.length - 1 && input.withCorrection
        ? { ...round, correction: correction.trim() }
        : round,
    );
    if (input.withCorrection) setRounds(outgoing);
    await run.launch(
      buildTeachBackRequest({
        rulebookId: rulebook.id,
        topic,
        rounds: outgoing,
        agreed: input.agreed,
        signatureSubjectId: input.signatureSubjectId,
        roundCap: knobs.rounds,
      }),
      input.agreed ? "your sign-off" : `round ${rounds.length + 1}`,
    );
  };

  /**
   * "YES, THAT'S IT" — the release gate (CORE.md §7).
   *
   * 🚨 THE VERDICT LANDS FIRST, through the ONE expert-signature path
   * (`platform.upsert_output_feedback`, `surface_name =
   * masterwork.expert_signature`), against the durable run that produced the
   * explanation on screen. Only then does the session close, carrying the SAME
   * run id so the server can stamp the rules that explanation was built from —
   * the rule and the verdict row can each be found from the other.
   *
   * If the verdict cannot be written, the session does NOT finish. A screen
   * that said "signed" over a failed write would be the exact lie this lane's
   * whole value depends on not telling.
   */
  const signAndFinish = async () => {
    if (!current) return;
    const runId = runIdRef.current;
    setSignatureProblem(null);
    if (!runId) {
      setSignatureProblem(
        "This round didn't record a run we can attach your sign-off to, so we " +
          "won't claim it was signed. Everything you corrected is saved on the " +
          "Rulebook. Send one more round and sign that one.",
      );
      return;
    }
    setSigning(true);
    try {
      await saveOutputFeedback({
        subjectType: MASTERWORK_DISTILLATION_RUN_SUBJECT_TYPE,
        subjectId: runId,
        verdict: "positive",
        surfaceName: EXPERT_SIGNATURE_SURFACE,
        originalContent: current.explanation,
        prose: current.subject
          ? `Teach-back signed: ${current.subject}`
          : "Teach-back signed",
      });
    } catch (err) {
      setSignatureProblem(
        `We couldn't record your sign-off (${
          err instanceof Error ? err.message : String(err)
        }). Nothing else was lost — your rules are on the Rulebook. Press it again.`,
      );
      setSigning(false);
      return;
    }
    setSigning(false);
    await send({ agreed: true, signatureSubjectId: runId });
  };

  const restart = () => {
    run.reset();
    setRounds([]);
    setUncertainParts([]);
    setCorrection("");
    setFinished(null);
    setLastCorrection(null);
    setSignatureProblem(null);
    setAdopted(-1);
  };

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        You can read this Rulebook, but only someone with edit access can run a
        teach-back on it — every correction writes draft rules onto it.
      </p>
    );
  }

  const playing = speechStatus === "playing";
  const paused = speechStatus === "paused";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-16 pt-2 sm:px-6">
      {knobs.problem ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {knobs.problem}
        </p>
      ) : null}

      {/* ── WHAT TO EXPLAIN ──────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-4">
        <Label htmlFor="teach-back-topic" className="text-sm font-medium">
          What should we try to explain back to you?
        </Label>
        <p className="mb-2 mt-1 text-xs text-muted-foreground">
          Leave this empty and we&apos;ll pick the biggest decision we think we
          understand. Name one if you&apos;d rather aim us at something — the
          call you make most often, or the one people get wrong.
        </p>
        {/* 🚨 A LOCKED FIELD IS NOT A FIELD (jobs-bar-2026-09-16, item 10).
            Once a teach-back is running this box can never be typed in again,
            but it went on rendering as a white textarea with a placeholder, a
            caret target and a resize grip — the only sign it was dead was a
            `disabled:opacity-50` you have to compare two screenshots to see, and
            one grey sentence underneath. So the screen offered an input it would
            not accept. Running, it states the topic as a fact instead. */}
        {started ? (
          <p className="mt-1 text-sm text-foreground">
            {topic.trim() || (
              <span className="text-muted-foreground">
                We picked the biggest decision we think we understand.
              </span>
            )}
          </p>
        ) : (
          <ProTextarea
            id="teach-back-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            enableVoice={knobs.voiceDefaultOn}
            placeholder="e.g. How I decide whether a pallet goes to data destruction or straight to sorting."
            /* Three rows, because at 390px this example needs three and at two
               the last line was sliced through the middle of a word — an
               example nobody can finish reading (jobs-bar-2026-09-16, item 29). */
            rows={3}
            className="text-base sm:text-sm"
          />
        )}
        {started ? (
          <p className="mt-2 text-xs text-muted-foreground">
            This is what every round is about. Finish this teach-back, then start
            a new one to change it.
          </p>
        ) : null}
      </section>

      {/* ── THE START ────────────────────────────────────────────────────── */}
      {!started ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button onClick={() => void send({ agreed: false })} disabled={running}>
            {running ? <Loader2 className="animate-spin" /> : null}
            Tell me what you think I do
          </Button>
          {/* THE COST, NAMED BEFORE THE CLICK. A round is one or two paid calls
              — saying it back, and reading your correction — and a session runs
              up to the organization's round knob. A confirm() per round would
              be intolerable on a lane whose whole point is momentum, so the
              price is stated plainly here, once, before anything is spent. */}
          <p className="text-xs text-muted-foreground">
            Up to {roundCount} rounds, about {knobs.explanationSeconds} seconds of
            talking each.{" "}
            {/* 🚨 SAY WHAT ACTUALLY HAPPENS (jobs-bar-2026-09-16, item 9). This
                promised "It reads out loud" and then nothing ever spoke: each
                round arrives as text with a "Read it to me" button beside it.
                A sentence that describes a behaviour the product does not have
                is the same defect as a control that does nothing. */}
            {knobs.voiceDefaultOn
              ? "Each round is on screen, with a button to have it read to you."
              : "The words are on screen; the voice is turned off here."}
          </p>
        </div>
      ) : null}

      {/* ── WHAT THE LAST CORRECTION WAS WORTH ───────────────────────────── */}
      {lastCorrection ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <span>{lastCorrection}</span>
        </p>
      ) : null}

      {/* ── THE WORKING STATE ────────────────────────────────────────────── */}
      {running ? (
        <p className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          {/* The server wrote this sentence for this person; the screen never
              hardcodes its own promise. */}
          <span>{run.stage || run.waitMessage || "Working…"}</span>
          {run.cancel ? (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              disabled={run.cancelling}
              onClick={() => void run.cancel?.("The expert stopped the teach-back.")}
            >
              <Square className="size-3.5" />
              Stop
            </Button>
          ) : null}
        </p>
      ) : null}

      {run.error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>{run.error}</span>
          </p>
          {run.retry ? (
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => void run.retry?.()}
            >
              Try that again
            </Button>
          ) : null}
        </div>
      ) : null}

      {run.stoppedMessage ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {run.stoppedMessage}
        </p>
      ) : null}

      {signatureProblem ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {signatureProblem}
        </p>
      ) : null}

      {/* ── THE ROUND ────────────────────────────────────────────────────── */}
      {current && !finished ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section
            className={cn(
              "rounded-lg border p-4",
              current.basis === "generalist"
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border bg-card",
            )}
          >
            {/* 🚨 WHOSE JUDGMENT THIS IS — every round, in plain words. */}
            <p
              className={cn(
                "mb-2 text-xs",
                current.basis === "generalist"
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-muted-foreground",
              )}
            >
              {describeBasis(current.basis)}
            </p>
            <h2 className="mb-2 text-base font-semibold text-foreground">
              Here&apos;s how I understand{" "}
              {current.subject || "you make this call"}
            </h2>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
              {current.explanation}
            </p>
            {current.rule_ids.length ? (
              <p className="mt-3 text-xs text-muted-foreground">
                Built from {current.rule_ids.length}{" "}
                {current.rule_ids.length === 1 ? "rule" : "rules"} of yours —
                those are the ones your sign-off will land on.
              </p>
            ) : null}
            {/* THE PLAY CONTROL IS ABSENT OR HONEST, never dead: it appears only
                when there is something to say, and it always reflects the one
                app-wide playback queue rather than a local guess. */}
            {current.explanation.trim() ? (
              <div className="mt-3 flex items-center gap-2">
                {playing ? (
                  <Button variant="outline" size="sm" onClick={() => pause()}>
                    <Pause className="size-3.5" />
                    Pause
                  </Button>
                ) : paused ? (
                  <Button variant="outline" size="sm" onClick={() => resume()}>
                    <Play className="size-3.5" />
                    Carry on
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => speakExplanation(current.explanation)}
                  >
                    <Volume2 className="size-3.5" />
                    {speechStatus === "loading" ? "Starting…" : "Read it to me"}
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">
                  You can interrupt at any point.
                </span>
              </div>
            ) : null}
          </section>

          <section className="rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <Label htmlFor="teach-back-correction" className="text-sm font-medium">
                Where&apos;s that wrong?
              </Label>
              <span className="shrink-0 text-xs text-muted-foreground">
                Round {rounds.length} of {roundCount}
              </span>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Say it the way you&apos;d say it to a new hire who just got it
              wrong. &ldquo;No, not like that.&rdquo; &ldquo;You missed the part
              where…&rdquo; &ldquo;That&apos;s right, but only when…&rdquo;
              {/* 🚨 NO DECORATIVE MICROPHONE (jobs-bar-2026-09-16, item 11).
                  A mic glyph dropped into a sentence is not a control, and on a
                  lane that really does take dictation it reads as one: the
                  Expert taps it, nothing happens, and the microphone that DOES
                  work is the one inside the box below. Name that one instead of
                  drawing a second, dead one. */}
              {knobs.voiceDefaultOn ? (
                <>
                  {" "}
                  Talking is usually faster than typing — the microphone is in
                  the box below.
                </>
              ) : null}
            </p>
            <ProTextarea
              id="teach-back-correction"
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              enableVoice={knobs.voiceDefaultOn}
              disabled={running || signing}
              placeholder="e.g. No, not like that — nobody routes on the manifest alone. And you missed the part where if the drives are already pulled the whole thing changes."
              rows={7}
              className="text-base sm:text-sm"
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={() => void send({ agreed: false, withCorrection: true })}
                disabled={running || signing || !correction.trim()}
              >
                {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Send this and try again
              </Button>
              <Button
                variant="outline"
                onClick={() => void signAndFinish()}
                disabled={running || signing}
              >
                {signing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ThumbsUp className="size-3.5" />
                )}
                Yes, that&apos;s it
              </Button>
            </div>
            {/* 🚨 A DISABLED BUTTON SAYS WHY (jobs-bar-2026-09-16, item 12).
                "Send this and try again" greys out until there is a correction
                in the box, and said nothing about it — so the Expert who reads
                an explanation, disagrees with it, and reaches for the button
                finds a dead control and no reason for it. */}
            {!correction.trim() && !running && !signing ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Write what we got wrong and &ldquo;Send this and try
                again&rdquo; turns on — or press &ldquo;Yes, that&apos;s
                it&rdquo; if we have it right.
              </p>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">
              &ldquo;Yes, that&apos;s it&rdquo; signs off on the rules this was
              built from. Nothing is approved by a machine — every new rule waits
              on the Rulebook for you.
            </p>
          </section>
        </div>
      ) : null}

      {/* ── WHAT IT WASN'T SURE ABOUT — the invitation to interrupt ──────── */}
      {current && !finished && uncertainParts[rounds.length - 1] ? (
        <p className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
          The part I&apos;m least sure about: {uncertainParts[rounds.length - 1]}
        </p>
      ) : null}

      {/* ── THE END ──────────────────────────────────────────────────────── */}
      {finished ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-base font-semibold">That&apos;s the teach-back done</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It stopped because {finished.doneReason || "it ran out of rounds"}. You
            corrected {finished.answeredRounds}{" "}
            {finished.answeredRounds === 1 ? "round" : "rounds"}.
          </p>
          {finished.signatureNote ? (
            <p
              className={cn(
                "mt-2 flex items-start gap-2 rounded-md border px-3 py-2 text-sm",
                finished.signedRuleIds.length
                  ? "border-emerald-500/40 bg-emerald-500/10"
                  : "border-border bg-muted/40",
              )}
            >
              {finished.signedRuleIds.length ? (
                <ThumbsUp className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              ) : (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              )}
              <span>{finished.signatureNote}</span>
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={`/masterwork/${rulebook.id}`}>
                Go and approve what came out of it
              </Link>
            </Button>
            <Button variant="outline" onClick={restart}>
              Try a different decision
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── THE SESSION SO FAR ───────────────────────────────────────────── */}
      {rounds.length > 1 || (rounds.length === 1 && finished) ? (
        <section className="rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="text-sm font-medium">Earlier in this teach-back</h3>
          <ol className="mt-2 space-y-2">
            {rounds.slice(0, finished ? rounds.length : -1).map((round, index) => (
              <li
                key={`${index}-${round.explanation.slice(0, 24)}`}
                className="rounded-md border border-border bg-card px-3 py-2 text-sm"
              >
                <p className="text-muted-foreground">
                  {index + 1}. I said: {round.explanation}
                </p>
                {round.correction ? (
                  <p className="mt-1 font-medium">
                    You said: {round.correction}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    You didn&apos;t correct this one.
                  </p>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
