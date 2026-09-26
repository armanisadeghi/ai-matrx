"use client";

// features/masterwork/probe/BadExampleProbe.tsx
//
// THE BAD EXAMPLE PROBE — the Expert's screen. One lane, one page, reached
// from the Approach catalog card and from `/masterwork/[id]/probe`.
//
// What happens here, in the Expert's terms: they say what kind of work they
// do, we write a version of it that looks right and is not, and they tell us
// what is wrong with it. Their answer becomes rules, and it also steers the
// next version — each one probing a boundary of their judgment the last answer
// did not reach. It ends when they say "I'd never see that", or when the
// organization's round knob runs out.
//
// ## Three things this screen must never do
//
// 1. **Never show the flaw.** The generator names the boundary it probed
//    (`probe_label`) so the NEXT round can avoid covered ground. It is session
//    state, carried back on the wire, and it is never rendered — a probe whose
//    answer is on the screen is not a probe.
// 2. **Never let the example read as the Expert's.** Every example is labelled
//    as ours, in plain words, above the work itself. The one thing worse than a
//    bad example is a bad example somebody mistakes for their own file.
// 3. **Never invent the count.** "Round 3 of 5" comes from the server's own
//    `round_index` / `round_count`; the cap is the org knob and the screen has
//    no opinion about it.
//
// Server half: `aidream/aidream/services/distillation/probe.py`.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { knobBool, knobInt } from "@/lib/knobs/featureKnobs";
import { WorkingNotice } from "@/lib/progress/WorkingNotice";
import { cn } from "@/lib/utils";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";
import type { Rulebook } from "../types";
import { RunStages } from "../components/RunStages";
import {
  DECLARED_KNOB_DEFAULTS,
  PROBE_KNOB_FEATURE,
  PROBE_PATH,
  buildProbeRequest,
  describeCatch,
  parsePriorRounds,
  parseProbeRound,
  validateCaseBrief,
  type ProbeRound,
  type ProbeRoundResult,
} from "./service";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { asClause } from "@/lib/text/asClause";

interface KnobState {
  rounds: number;
  voiceDefaultOn: boolean;
  /** The sentence shown in place when a knob row could not be read. */
  problem: string | null;
}

const PENDING_KNOBS: KnobState = {
  rounds: DECLARED_KNOB_DEFAULTS.rounds,
  voiceDefaultOn: DECLARED_KNOB_DEFAULTS.voice_default_on,
  problem: null,
};

export function BadExampleProbe({
  rulebook,
  canEdit,
  onChanged,
}: {
  rulebook: Rulebook;
  canEdit: boolean;
  /** The page reloads the Rulebook — every answered round lands drafts on it. */
  onChanged?: () => void;
}) {
  const [caseBrief, setCaseBrief] = useState("");
  const [rounds, setRounds] = useState<ProbeRound[]>([]);
  const [critique, setCritique] = useState("");
  const [lastCatch, setLastCatch] = useState<string | null>(null);
  const [finished, setFinished] = useState<ProbeRoundResult | null>(null);

  const [knobs, setKnobs] = useState<KnobState>(PENDING_KNOBS);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [roundCount, voice] = await Promise.all([
          knobInt(PROBE_KNOB_FEATURE, "rounds"),
          knobBool(PROBE_KNOB_FEATURE, "voice_default_on"),
        ]);
        if (cancelled) return;
        setKnobs({ rounds: roundCount, voiceDefaultOn: voice, problem: null });
      } catch (err) {
        if (cancelled) return;
        // NOTHING FAILS SILENTLY. The settings this screen obeys could not be
        // read, so the screen names them and what it is running on instead.
        setKnobs({
          ...PENDING_KNOBS,
          problem:
            `The settings for this feature could not be read (${
              err instanceof Error ? err.message : String(err)
            }). It is running on the starting values — voice on, up to ` +
            `${DECLARED_KNOB_DEFAULTS.rounds} rounds. An administrator can fix ` +
            `this by seeding the "${PROBE_KNOB_FEATURE}" knobs.`,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const run = useMasterworkRun<ProbeRoundResult>({
    surface: "probe",
    rulebookId: rulebook.id,
    path: PROBE_PATH,
    parseResult: parseProbeRound,
  });

  // THE TERMINAL PAYLOAD IS THE NEXT QUESTION. Every other Masterwork lane's
  // result is a summary; this one carries the next bad example, so adopting it
  // is what advances the session. Keyed on the round index so a rejoin that
  // settles from the durable row lands exactly once.
  const result = run.result;
  const [adopted, setAdopted] = useState<number>(-1);
  /** The last round index the SERVER reported — survives `launch` wiping
   *  `run.result`, so the counter never falls back to a mount-local count
   *  while the next round is being written. See `roundNumber`. */
  const [serverRound, setServerRound] = useState(0);
  useEffect(() => {
    if (!result) return;
    if (result.roundIndex === adopted) return;
    setAdopted(result.roundIndex);
    setServerRound(result.roundIndex);
    setLastCatch(describeCatch(result));
    if (result.rulesAdded > 0) onChanged?.();
    if (result.done) {
      setFinished(result);
      return;
    }
    setRounds((previous) => [
      ...previous,
      {
        example_title: result.exampleTitle,
        example_body: result.exampleBody,
        probe_label: result.probeLabel,
        critique: "",
      },
    ]);
    setCritique("");
  }, [result, adopted, onChanged]);

  // THE CASE COMES BACK WITH THE RUN. `caseBrief` is mount-local state, and
  // the rounds are not: a refresh, a navigation away and back, or a later
  // session restores the round from the durable pointer while the case it was
  // about would have come back empty — which left BOTH buttons on a live round
  // silently inert and the Expert's typed critique lost (cold walk 3,
  // 2026-09-16). The launch hands the brief to the run's receipt
  // (`memo` below) and the restore hands it back.
  const restoredCaseBrief = run.memo?.case_brief ?? "";
  useEffect(() => {
    if (!restoredCaseBrief) return;
    setCaseBrief((current) => (current.trim() ? current : restoredCaseBrief));
  }, [restoredCaseBrief]);

  // AND SO DO THE ROUNDS ALREADY ANSWERED (cold walk 6, finding 3, 2026-09-17).
  //
  // The durable row carries the round being written and nothing else, so a
  // reload mid-round-2 left the screen with no example, no answer and no
  // history — "round 1's finished content gone from view", which is most of
  // what made that screen read as broken. The rounds are not the server's to
  // remember (it is handed the whole session on every request), so they ride on
  // the run's own receipt beside the case brief, the same way and for the same
  // reason. Local to this browser, never sent anywhere; a probe is capped at
  // the organization's round knob, so this is a handful of KB at most.
  const restoredRounds = run.memo?.prior_rounds ?? "";
  const seededRounds = useRef(false);
  useEffect(() => {
    if (!restoredRounds || seededRounds.current) return;
    seededRounds.current = true;
    const earlier = parsePriorRounds(restoredRounds);
    if (!earlier.length) return;
    // Only ever a PREFIX: anything already on screen came from the server and
    // is a LATER round than anything on the receipt.
    setRounds((current) => [...earlier, ...current]);
    // The answer the Expert had typed was sent with the launch, so it belongs
    // back in the box it was typed in — exactly as it looks before a reload.
    const lastCritique = earlier[earlier.length - 1]?.critique ?? "";
    if (lastCritique) setCritique((current) => current || lastCritique);
  }, [restoredRounds]);

  const running = run.running;
  const current = rounds.length ? rounds[rounds.length - 1] : null;
  const started = rounds.length > 0 || finished !== null;
  const roundCount = result?.roundCount || knobs.rounds;
  /**
   * 🚨 NEVER INVENT THE COUNT (this file's own rule 3, broken by the restore).
   *
   * The counter read `rounds.length`, which is the number of rounds THIS MOUNT
   * has seen. A restored session has seen exactly one — the last result the
   * durable pointer carries — so a person returning to round 3 of their probe
   * was told, in the product's own words, "Round 1 of 5" (cold-walk-3 fix
   * round, 2026-09-17). The server sends the real index on every round and it
   * survives the restore; it is the only number allowed on screen. The length
   * is the fallback for the first round of a fresh mount, before any result
   * has landed.
   *
   * 🚨 AND IT MUST NOT COME BACK THE MOMENT A ROUND IS IN FLIGHT (cold walk 4,
   * finding 3, 2026-09-16). `run.launch` wipes `run.result` to null
   * SYNCHRONOUSLY, before the network call — so from the press of "Send this
   * and show me the next one" until the next result lands, `result?.roundIndex`
   * is gone and the expression fell straight back to `rounds.length`, the
   * mount-local count the sentence above exists to forbid. On a restored mount
   * that count is 1 no matter what round the server is on, so the walk's second
   * round showed "Round 1 of 5" over round 2's own memo with the answer still
   * in the box: the counter and the case on screen disagreed, in the same
   * component, in the same paint.
   *
   * `serverRound` is the last index the SERVER reported, remembered across
   * launches. The number on screen can now only move forward, and it never
   * again describes a different round from the case beside it.
   */
  const roundNumber = result?.roundIndex || serverRound || rounds.length;
  /** What is still missing before a probe can start, in plain words. */
  const caseBriefProblem = validateCaseBrief(caseBrief);
  /**
   * The case is locked once the probe is under way — but ONLY when we still
   * hold it. A restored round whose brief did not come back must be able to
   * take it again, or the screen locks the person out of their own session.
   */
  const caseLocked = started && !caseBriefProblem;

  const send = async (finish: boolean) => {
    // THE GATE IS THE BUTTON, NOT A BANNER — but a guard that cannot proceed
    // still SAYS SO. `caseBriefProblem` is already the reason on "Write the
    // first one", so a press with an empty case does not normally reach here.
    // It DID on a restored round, where the case brief was gone and this line
    // was a bare `return`: both buttons were inert, nothing was sent, nothing
    // was said, and the critique the Expert had just typed was lost (cold walk
    // 3, 2026-09-16). Nothing fails silently — a press that cannot proceed
    // names the reason and the way out, in the same place `run.error` renders.
    // A not-yet-typed field is still a PROMPT, never an alarm, before the
    // probe has started: there the button's own reason is already on screen.
    if (caseBriefProblem) {
      if (started) {
        run.fail(
          "We couldn't bring back what you told us this probe was about, so " +
            "there is nothing to write the next example from. Say what kind " +
            "of work it is again in the box at the top — everything you have " +
            "already answered is saved on the Rulebook.",
        );
      } else {
        run.fail(`${caseBriefProblem}, then press this again.`);
      }
      return;
    }
    // The Expert's answer rides on the LAST round, because that is the one the
    // server distils. Building it anywhere but here would let the screen send
    // an answer attached to the wrong example.
    const outgoing = rounds.map((round, index) =>
      index === rounds.length - 1 ? { ...round, critique: critique.trim() } : round,
    );
    setRounds(outgoing);
    // No `reset()` first: `launch` already retires the previous receipt, clears
    // the pointer and re-enters `running`. A reset beside it is a second state
    // flip over the same fields for no gain.
    await run.launch(
      buildProbeRequest({
        rulebookId: rulebook.id,
        caseBrief,
        rounds: outgoing,
        finish,
        roundCap: knobs.rounds,
      }),
      finish ? "your last answer" : `round ${rounds.length + 1}`,
      // The brief and the rounds already answered travel with the run's
      // receipt, so a restored round is still a round about the same kind of
      // work and the session it belongs to is still on screen — see
      // `restoredCaseBrief` and `restoredRounds`.
      {
        memo: {
          case_brief: caseBrief.trim(),
          prior_rounds: JSON.stringify(outgoing),
        },
      },
    );
  };

  const restart = () => {
    run.reset();
    // A new probe is a new session — the previous one's rounds must not be
    // seeded back in from a receipt this screen has finished with.
    seededRounds.current = true;
    setRounds([]);
    setCritique("");
    setFinished(null);
    setLastCatch(null);
    setAdopted(-1);
  };

  if (!canEdit) {
    return (
      <p className="text-sm text-muted-foreground">
        You can read this Rulebook, but only someone with edit access can run a
        probe on it — every round writes draft rules onto it.
      </p>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-16 pt-2 sm:px-6">
      {knobs.problem ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
          {knobs.problem}
          <ErrorAlchemyMenu error={knobs.problem} />
        </p>
      ) : null}

      {/* ── THE CASE ─────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-border bg-card p-4">
        <Label htmlFor="probe-case" className="text-sm font-medium">
          What kind of work should we fake?
        </Label>
        <p className="mb-2 mt-1 text-xs text-muted-foreground">
          The job you actually do — the call you make, or the thing you produce.
          We write a version of it that looks right and is not, and you tell us
          what is wrong with it.
        </p>
        <ProTextarea
          id="probe-case"
          value={caseBrief}
          onChange={(e) => setCaseBrief(e.target.value)}
          enableVoice={knobs.voiceDefaultOn}
          // LOCKED ONLY WHEN THERE IS SOMETHING TO LOCK. A disabled empty box
          // over a live round is a dead end: the one thing that would make the
          // round sendable is the one thing the screen refuses to take.
          disabled={caseLocked}
          placeholder="e.g. Deciding whether a pallet of mixed office electronics goes to data destruction or straight to sorting."
          rows={2}
          className="text-base sm:text-sm"
        />
        {caseLocked ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Locked for this probe, so every round is about the same kind of work.
            Finish or stop, then start a new one to change it.
          </p>
        ) : null}
        {started && caseBriefProblem ? (
          <p className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            This probe is still going, but we couldn&apos;t bring back what you
            said it was about. Say it again here and carry on — your answers so
            far are saved on the Rulebook.
            <ErrorAlchemyMenu />
          </p>
        ) : null}
      </section>

      {/* ── THE START ────────────────────────────────────────────────────── */}
      {/* 🚨 NEVER THE SETUP SCREEN OVER A LIVE ROUND (cold walk 5, finding 3).
          A reload mid-round-2 painted this block — a spinning, disabled "Write
          the first one" over "Up to 5 rounds…" — at the same time as the
          in-progress row below reading "Writing round 2…" with a Stop button,
          for about nine seconds, because `started` is answered by the restored
          CONTENT (which arrives with the rejoin) while `running` is true from
          the first paint. `run.restoring` is the third answer both of them were
          missing: there IS a round here and this mount cannot describe it yet,
          so nothing offers to start one. */}
      {!started && !run.restoring ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <GatedActionButton
            onClick={() => void send(false)}
            disabled={running}
            wrapperClassName="flex-col items-stretch sm:flex-row sm:items-center sm:justify-start"
            reasonClassName="sm:max-w-sm"
            reason={caseBriefProblem}
          >
            {running ? <Loader2 className="animate-spin" /> : null}
            Write the first one
          </GatedActionButton>
          {/* THE COST, NAMED BEFORE THE CLICK. A round is two paid calls —
              writing the example and reading the answer — and a probe runs up
              to the organization's round knob. A confirm() per round would be
              intolerable on a lane whose whole point is momentum, so the price
              is stated plainly here, once, before anything is spent. */}
          <p className="text-xs text-muted-foreground">
            Up to {roundCount} rounds, and you can stop after any one of them.
            Each round takes about a minute: we write the example, you say what
            is wrong with it, and we read your answer.
          </p>
        </div>
      ) : null}

      {/* ── WHAT THE LAST ANSWER WAS WORTH ───────────────────────────────── */}
      {lastCatch ? (
        <p className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
          <span>{lastCatch}</span>
        </p>
      ) : null}

      {/* ── THE WORKING STATE ────────────────────────────────────────────── */}
      {/* 🚨 A MOTIONLESS LABEL READS AS STUCK (cold walk 6, finding 6). This
          said "Writing round 1 — a version of this work that looks right and is
          not." and then said exactly that, unchanged, for 61 measured seconds
          while a reasoning model wrote a whole work product. The server's
          sentence is still the only thing that describes the work — the screen
          never writes its own — but it now sits over a clock that moves and an
          honest expectation, which is everything this path actually knows. No
          percentage: nothing here knows a fraction. */}
      {/* THE WHOLE ACCOUNT, NOT JUST THE CURRENT LINE (cold walk 8,
          2026-09-17). This lane showed `run.stage` — the latest step only —
          so every earlier step, including the server's own explanation of why
          a run found nothing, was overwritten by the next one and gone the
          moment the run ended. `run.stages` is the full list and it stays. */}
      <RunStages run={run} />
      {running ? (
        <WorkingNotice
          doing={run.stage || run.waitMessage || "Working…"}
          startedAt={run.startedAt}
          usualMs={run.expectedMs}
          keepsGoingWithoutYou
          action={
            run.cancel ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={run.cancelling}
                onClick={() =>
                  void run.cancel?.("The expert stopped the probe.")
                }
              >
                <Square className="size-3.5" />
                Stop
              </Button>
            ) : null
          }
        />
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
          <ErrorAlchemyMenu error={run.error} />
        </div>
      ) : null}

      {run.stoppedMessage ? (
        <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
          {run.stoppedMessage}
        </p>
      ) : null}

      {/* ── THE ROUND ────────────────────────────────────────────────────── */}
      {current && !finished ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4">
            <p className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3.5" />
              We wrote this. It is meant to look right and be wrong.
            </p>
            {/* NEVER "Untitled". A grey placeholder word in the heading slot
                reads as a half-built screen; the case the Expert typed is the
                true name of what we wrote for them. */}
            <h2 className="mb-2 text-base font-semibold text-foreground">
              {/* NEVER A SENTENCE BUILT FROM EMPTY STATE. With the case brief
                  missing this read "A work that looks right" — a placeholder
                  wearing the voice of a real heading. */}
              {current.example_title ||
                (caseBrief.trim()
                  ? `A ${caseBrief.trim()} that looks right`
                  : "The example we wrote for you")}
            </h2>
            {/* 🚨 A SPECIMEN CARRIES NO ACTIONS (jobs-bar-2026-09-16 lanes-b
                item C, feedback 729b59bd). `actionsVariant="none"` only silenced
                RichDocument's OWN surface — the tables inside this deliberately
                false certificate still drew Export / Send to Workbook / Send to
                Google Sheet / Edit, so the Expert could file our knowingly-wrong
                document as if it were a real record. `specimen` declares what
                this is to every renderer underneath. */}
            <RichDocument imagePolicy="ai"
              content={current.example_body ?? ""}
              source={{ type: "raw" }}
              actionsVariant="none"
              specimen={{
                label: "This is the example we made up",
                notice:
                  "It is meant to look right and be wrong, so there is nothing here to export, send to a workbook or a sheet, or edit — tell us what is wrong with it instead.",
              }}
              contentClassName="text-sm"
            />
          </section>

          {/* The example runs for screens; the answer box was pinned to the top
              of its column, so by the time you had read the thing you were
              meant to criticise, the box to criticise it in was off screen
              (jobs-bar-2026-09-16 lanes-b, item 13). */}
          <section className="rounded-lg border border-border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <Label htmlFor="probe-critique" className="text-sm font-medium">
                What&apos;s wrong with this, and what would you do?
              </Label>
              <span className="shrink-0 text-xs text-muted-foreground">
                Round {roundNumber} of {roundCount}
              </span>
            </div>
            <p className="mb-2 text-xs text-muted-foreground">
              Say it the way you would say it to whoever wrote it.
              {knobs.voiceDefaultOn ? (
                <>
                  {" "}
                  <Mic className="inline size-3" aria-hidden /> Talking is
                  usually faster than typing.
                </>
              ) : null}
            </p>
            <ProTextarea
              id="probe-critique"
              value={critique}
              onChange={(e) => setCritique(e.target.value)}
              enableVoice={knobs.voiceDefaultOn}
              disabled={running}
              placeholder="e.g. Nobody routes on the manifest alone — you open the pallet first, and if the drives are already pulled the whole thing changes."
              rows={7}
              className="text-base sm:text-sm"
            />
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              {/* Was a bare `disabled` with nothing beside it: the payoff button
                  of the whole round sat grey and said nothing
                  (jobs-bar-2026-09-16 lanes-b, item 12). */}
              <GatedActionButton
                onClick={() => void send(false)}
                disabled={running}
                wrapperClassName="flex-col items-stretch sm:flex-row sm:items-center"
                reason={firstBlockingReason([
                  {
                    when: !critique.trim(),
                    reason: "Say what is wrong with it first",
                  },
                ])}
              >
                Send this and show me the next one
              </GatedActionButton>
              <Button
                variant="outline"
                onClick={() => void send(true)}
                disabled={running}
              >
                I&apos;d never see that — stop here
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Stopping still keeps whatever you have already said. Nothing is
              approved by a machine — every rule waits on the Rulebook for you.
            </p>
          </section>
        </div>
      ) : null}

      {/* ── THE END ──────────────────────────────────────────────────────── */}
      {finished ? (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-base font-semibold">That&apos;s the probe done</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            It stopped because {asClause(finished.doneReason || "the probe ran out of rounds")}.
            You answered {finished.answeredRounds}{" "}
            {finished.answeredRounds === 1 ? "round" : "rounds"}.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button asChild>
              <Link href={`/masterwork/${rulebook.id}`}>
                Go and approve what came out of it
              </Link>
            </Button>
            <Button variant="outline" onClick={restart}>
              Probe a different kind of work
            </Button>
          </div>
        </section>
      ) : null}

      {/* ── THE SESSION SO FAR ───────────────────────────────────────────── */}
      {rounds.length > 1 || (rounds.length === 1 && finished) ? (
        <section className="rounded-lg border border-border bg-muted/20 p-4">
          <h3 className="text-sm font-medium">Earlier in this probe</h3>
          <ol className="mt-2 space-y-2">
            {rounds.slice(0, finished ? rounds.length : -1).map((round, index) => (
              <li
                key={`${index}-${round.example_title ?? ""}`}
                className={cn(
                  "rounded-md border border-border bg-card px-3 py-2 text-sm",
                )}
              >
                <p className="font-medium">
                  {index + 1}. {round.example_title || "Untitled"}
                </p>
                {round.critique ? (
                  <p className="mt-1 text-muted-foreground">
                    You said: {round.critique}
                  </p>
                ) : (
                  <p className="mt-1 text-muted-foreground">
                    You did not answer this one.
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
