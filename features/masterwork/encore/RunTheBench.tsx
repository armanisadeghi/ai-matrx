"use client";

// features/masterwork/encore/RunTheBench.tsx
//
// THE TRIAL BENCH GETS A DOOR.
//
// Until now `AuditionProof` could only SAY where the Bench runs — "the command
// line" — because the Bench had no screen. That was honest (no dead control),
// but it left the one thing that can prove a Masterwork beat anybody outside
// the product entirely. This is the door: it sits beside the quick check, and
// it either starts a real six-arm trial or says, in the SERVER's own words,
// why it cannot.
//
// What this screen must never misrepresent (doctrine:
// `aidream/aidream/services/masterworks/bench/FEATURE.md`, and the trial
// program it points at):
//
//   · A VOID TRIAL PROVES NOTHING. The expert's own withheld answer is in the
//     blind pool and has to win it. If it does not, the pass criteria are
//     never evaluated and no claim survives — a landslide for our arm does not
//     rescue it. So a void verdict renders no win, at all.
//   · "NOT SCORED" IS NOT A FAIL. If the panel misses its calibration bar, the
//     evidence is about the judges, not about the Masterwork. The screen says
//     that in those words and shows no verdict badge either way.
//   · THE BENCH IS THE PROOF; THE AUDITION IS A QUICK CHECK. This control sits
//     beside the quick check and never borrows its language.
//
// Server half: `POST /masterworks/{rulebook_id}/bench/runs` (streaming), with
// `GET /masterworks/{rulebook_id}/bench` supplying the form and, when it
// cannot run, the reason.

import { useCallback, useEffect, useState } from "react";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { DurableRunInterruption } from "@/lib/durable-run/DurableRunInterruption";
import { durableRunDialogOnOpenChange } from "@/lib/durable-run/durableRunDialogClose";
import { MasterworkDictationOrigin } from "@/features/masterwork/MasterworkDictationOrigin";
import { useMasterworkRun } from "../durable-run/useMasterworkRun";
import { benchFacts, duration, money } from "./benchFacts";
import {
  BENCH_RUN_PATH,
  parseBenchArm,
  parseBenchVerdict,
  type BenchArmWire,
  type BenchProofState,
  type BenchRunFormWire,
  type BenchVerdictWire,
} from "./benchProof";

/**
 * WHAT EACH ARM IS, IN PLAIN WORDS. The server sends its own `label`, and it
 * is shown too — but a person watching six rows appear needs to know what is
 * being compared without a glossary, and these are the doctrine's six arms.
 */
const ARM_WORDS: Record<string, string> = {
  a0: "frontier model, raw",
  a1: "frontier + the whole corpus",
  a2: "frontier + retrieval + web, to the budget ceiling",
  b: "the cheap model, raw",
  c: "this Masterwork",
  gt: "the expert's own answer",
};

const ARM_ORDER = ["a0", "a1", "a2", "b", "c", "gt"];

/** The consequence, named. Never a generic "Are you sure?". */
const CONSEQUENCE =
  "Starting a trial makes real, paid model calls across all six arms — the " +
  "frontier model three times (once with your whole corpus, once with " +
  "retrieval and the open web up to the budget ceiling), a cheap model, a " +
  "full run of your Masterwork, and then a judge on every arm plus a blind " +
  "panel. It costs real money and takes many minutes, and nothing about it " +
  "is undone by closing this.";

function ArmRow({ arm }: { arm: BenchArmWire }) {
  const words = ARM_WORDS[arm.arm.toLowerCase()] ?? arm.label;
  const cost = money(arm.cost_usd);
  const secs = duration(arm.seconds);
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-border py-1 last:border-b-0">
      <span className="w-8 shrink-0 font-mono text-xs font-medium uppercase text-foreground">
        {arm.arm}
      </span>
      <span className="min-w-0 flex-1 text-xs text-foreground">{words}</span>
      {arm.model ? (
        <span className="text-[10px] text-muted-foreground">{arm.model}</span>
      ) : null}
      {arm.ran ? (
        <>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {cost ?? "—"}
          </span>
          <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
            {secs ?? "—"}
          </span>
        </>
      ) : (
        // A missing arm is a FACT about the trial, never a blank row. The
        // doctrine counts an unmeasurable metric as tied, so an arm that did
        // not run can never quietly become a win.
        <span className="shrink-0 text-xs text-destructive">
          did not run{arm.error ? ` — ${arm.error}` : ""}
        </span>
      )}
      {arm.ran && arm.note ? (
        <span className="w-full text-[10px] text-muted-foreground">
          {arm.note}
        </span>
      ) : null}
    </li>
  );
}

/** The verdict, said the way the doctrine says it — and no other way. */
function Verdict({ verdict }: { verdict: BenchVerdictWire }) {
  const facts = benchFacts(verdict);
  // A void trial and an uncalibrated panel both mean NO CLAIM SURVIVES. They
  // are different sentences because they blame different things: a void blames
  // the trial, "not scored" blames the bench's own judges.
  const claimable = !verdict.void && !verdict.not_scored;
  return (
    <div className="space-y-2 rounded-md border border-border p-2">
      <p className="flex items-start gap-1.5 text-sm font-medium text-foreground">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{verdict.headline}</span>
      </p>
      {verdict.void ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-foreground">
          This trial proves nothing. The expert&apos;s own withheld answer was
          in the blind pool and did not win it, so the trial is void and no
          claim is made from it — however our arm scored.
          {verdict.void_reason ? ` ${verdict.void_reason}` : ""}
        </p>
      ) : null}
      {verdict.not_scored ? (
        <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-foreground">
          The panel was not calibrated, so this trial was not scored. That is
          not a fail and not a pass — it is evidence about the judges, not
          about this Masterwork.
          {verdict.not_scored_reason ? ` ${verdict.not_scored_reason}` : ""}
        </p>
      ) : null}
      {claimable ? (
        <p className="text-xs text-foreground">
          {verdict.win_claimed
            ? `${verdict.win_claimed} win claimed against arm ${verdict.arm.toUpperCase()}`
            : "No win claimed."}
          {verdict.budget_multiple !== null
            ? ` at ${verdict.budget_multiple}× our cost`
            : ""}
          {verdict.passed ? " · passed" : " · did not pass"}
        </p>
      ) : null}
      {claimable && verdict.win_rationale ? (
        <p className="text-xs text-muted-foreground">{verdict.win_rationale}</p>
      ) : null}
      {facts.length > 0 ? (
        <p className="text-xs text-muted-foreground">{facts.join(" · ")}</p>
      ) : null}
      {verdict.total_cost_usd !== null ? (
        <p className="text-xs text-muted-foreground">
          Whole trial: {money(verdict.total_cost_usd)}
        </p>
      ) : null}
      {/* Where the record lives, and whether it is a row or files. The Bench
          says which it wrote; the screen never guesses. */}
      {verdict.storage_note ? (
        <p className="text-[10px] text-muted-foreground">
          {verdict.storage_note}
        </p>
      ) : null}
      {verdict.report_path ? (
        <p className="break-all text-[10px] text-muted-foreground">
          Full report: <code>{verdict.report_path}</code>
        </p>
      ) : null}
    </div>
  );
}

export interface RunTheBenchProps {
  rulebookId: string;
  /** The answer from `GET .../bench` — it carries the form, or the reason. */
  bench: BenchProofState;
  /** Fired when a verdict lands, so the panel re-reads the banked record. */
  onVerdict?: () => void;
  className?: string;
}

export function RunTheBench({
  rulebookId,
  bench,
  onVerdict,
  className,
}: RunTheBenchProps) {
  const form: BenchRunFormWire | null =
    bench.status === "loading" ? null : bench.form;
  const canRun = bench.status !== "loading" && bench.canRunHere && form !== null;

  const [open, setOpen] = useState(false);
  const [taskPrompt, setTaskPrompt] = useState("");
  const [caseInput, setCaseInput] = useState("");
  const [groundTruth, setGroundTruth] = useState("");
  const [budget, setBudget] = useState<string>("");
  const [arms, setArms] = useState<BenchArmWire[]>([]);
  const [starting, setStarting] = useState(false);
  const [seenVerdict, setSeenVerdict] = useState<string | null>(null);

  const onDomainEvent = useCallback(
    (name: string, data: Record<string, unknown>) => {
      if (name !== "masterwork_bench_arm") return;
      const row = parseBenchArm(data);
      if (!row) return;
      setArms((prev) => [...prev.filter((a) => a.arm !== row.arm), row]);
    },
    [],
  );

  const run = useMasterworkRun<BenchVerdictWire>({
    surface: "bench",
    rulebookId,
    path: BENCH_RUN_PATH,
    parseResult: parseBenchVerdict,
    onDomainEvent,
  });

  const verdict = run.result;
  // A verdict has landed: the banked record is what the panel should show
  // next, so ask the server again rather than mirroring the event into it.
  // Keyed by trial id so it fires once per finished trial, not per render.
  useEffect(() => {
    if (!verdict || verdict.trial_id === seenVerdict) return;
    setSeenVerdict(verdict.trial_id);
    onVerdict?.();
  }, [verdict, seenVerdict, onVerdict]);

  // ─────────────────────────────────────────────────────────────────────────
  // THE DOOR CANNOT OPEN. It is then not a control at all — never a greyed
  // button, never a button that does nothing. The sentence is the server's.
  // ─────────────────────────────────────────────────────────────────────────
  if (bench.status === "loading") return null;
  // 🚨 A TRIAL ALREADY RUNNING IS NOT A CLOSED DOOR (production walk 4, wall
  // W3). While one was in flight this block said "Run the Bench: not from
  // here" — a sentence about WHO the viewer is — to the admin whose trial it
  // was. There is nothing to start because one is already going, and that is
  // what the screen says, in the server's own words.
  if (bench.running) {
    return (
      <div
        className={cn(
          "mt-2 rounded-md border border-dashed border-border px-2 py-1.5",
          className,
        )}
        data-testid="bench-door-running"
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Run the Bench: one is already running</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {bench.running.headline}
        </p>
      </div>
    );
  }
  if (!canRun || !form) {
    const reason =
      bench.howToRun.trim() ||
      (bench.status === "unavailable"
        ? bench.reason
        : "The server did not say why a trial cannot be started here.");
    return (
      <div
        className={cn(
          "mt-2 rounded-md border border-dashed border-border px-2 py-1.5",
          className,
        )}
      >
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>Run the Bench: not from here</span>
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{reason}</p>
      </div>
    );
  }

  const budgetNumber = budget.trim() === "" ? null : Number(budget);
  const budgetValid =
    budgetNumber === null ||
    (Number.isFinite(budgetNumber) && budgetNumber > 0);
  const liveCost = arms.reduce((sum, a) => sum + a.cost_usd, 0);

  /**
   * 🚨 AN UNMET PRECONDITION IS A PROMPT, NEVER AN ALARM. These two used to be
   * red toasts fired after the click — a person who simply had not typed the
   * task yet was shown an error, which teaches her to fear a button that is
   * about to spend real money across six arms. Same fix as the Bad Example
   * probe and the Triad game: the reason rides ON the control, live, before
   * the click. The early returns below stay as unreachable backstops.
   */
  const blockedReason = firstBlockingReason([
    {
      when: taskPrompt.trim().length < 10,
      reason:
        "Write the task first — every arm gets this same wording, so it has to stand on its own",
    },
    {
      when: !budgetValid,
      reason: "The budget multiple has to be a number greater than zero",
    },
  ]);

  const start = async () => {
    if (blockedReason) return;
    const ok = await confirm({
      title: "Run a bench trial?",
      description: CONSEQUENCE,
      confirmLabel: "Run the trial",
      cancelLabel: "Not now",
      variant: "destructive",
    });
    if (!ok) return;
    setStarting(true);
    setArms([]);
    run.reset();
    try {
      await run.launch(
        {
          task_prompt: taskPrompt.trim(),
          ...(caseInput.trim() ? { case_input: caseInput.trim() } : {}),
          ...(groundTruth.trim()
            ? { ground_truth_text: groundTruth.trim() }
            : {}),
          ...(budgetNumber !== null ? { budget_multiple: budgetNumber } : {}),
          masterwork_id: form.masterwork_id,
        },
        "bench trial",
        { pathParams: { rulebook_id: rulebookId } },
      );
    } finally {
      setStarting(false);
    }
  };

  const orderedArms = [...arms].sort(
    (a, b) =>
      ARM_ORDER.indexOf(a.arm.toLowerCase()) -
      ARM_ORDER.indexOf(b.arm.toLowerCase()),
  );

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => setOpen(true)}
      >
        <FlaskConical className="mr-1 h-3.5 w-3.5" />
        Run the Bench
      </Button>
      <MasterworkDictationOrigin
        surface="masterwork.bench"
        rulebookId={rulebookId}
      >
        <Dialog
          open={open}
          onOpenChange={durableRunDialogOnOpenChange({
            running: run.running,
            reset: run.reset,
            onOpenChange: setOpen,
            runLabel: "The bench trial",
            whereItLives: form.durable
              ? undefined
              : form.durable_note,
          })}
        >
          <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                Run the Bench
              </DialogTitle>
              <DialogDescription>
                Six answers to the same job — the best frontier model three
                ways, a cheap model, your Masterwork, and the expert&apos;s own
                answer — judged blind, with dollars and seconds on every one.
                This is the trial that can establish a win. The quick check
                beside it cannot.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="bench-task">The job, in one brief</Label>
                <ProTextarea
                  id="bench-task"
                  value={taskPrompt}
                  onChange={(e) => setTaskPrompt(e.target.value)}
                  rows={4}
                  enableTextStats
                  placeholder="What all six arms are asked to do — the same wording reaches every one of them…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bench-case">
                  The case or input{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <ProTextarea
                  id="bench-case"
                  value={caseInput}
                  onChange={(e) => setCaseInput(e.target.value)}
                  rows={3}
                  enableTextStats
                  placeholder="The material the job is about, if there is any…"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bench-gt">
                  The expert&apos;s real answer{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <ProTextarea
                  id="bench-gt"
                  value={groundTruth}
                  onChange={(e) => setGroundTruth(e.target.value)}
                  rows={4}
                  enableTextStats
                  placeholder="What the expert actually said or wrote for this job — it goes into the blind pool and has to win it…"
                />
                <p className="text-xs text-muted-foreground">
                  This is the arm every claim depends on: if the expert&apos;s
                  own answer is in the pool and does not win the blind panel,
                  the trial is void and proves nothing.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bench-budget">Budget multiple</Label>
                <Input
                  id="bench-budget"
                  type="number"
                  min={1}
                  value={budget === "" ? String(form.budget_multiple) : budget}
                  onChange={(e) => setBudget(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {form.budget_multiple_source}
                </p>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-2 text-xs text-muted-foreground">
                <p>
                  Judge: <span className="text-foreground">{form.judge_model}</span>
                  {" · "}Frontier arms:{" "}
                  <span className="text-foreground">{form.frontier_model}</span>
                  {" · "}Cheap arm:{" "}
                  <span className="text-foreground">{form.cheap_model}</span>
                </p>
                <p className="mt-0.5">
                  Arm C runs{" "}
                  <span className="text-foreground">
                    {form.masterwork_name}
                  </span>{" "}
                  — the same way the product runs it.
                </p>
                {/* The note always; the COUNT only when the server actually
                    counted. It does not on this read (see `corpus_sources`) —
                    the number arrives in the stage line once a trial starts. */}
                <p className="mt-0.5">
                  {form.corpus_sources !== null
                    ? `${form.corpus_sources} pre-engagement ${
                        form.corpus_sources === 1 ? "source" : "sources"
                      }. `
                    : ""}
                  {form.corpus_note}
                </p>
              </div>

              {/* A REFRESH LOSES THE VIEW OF A RUN THAT KEEPS SPENDING. The
                  person is told before the button, not after. */}
              {!form.durable ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-foreground">
                  {form.durable_note}
                </p>
              ) : null}

              <p className="text-xs text-muted-foreground">{CONSEQUENCE}</p>
              <GatedActionButton
                reason={blockedReason}
                disabled={run.running || starting}
                onClick={() => void start()}
              >
                {run.running ? "Trial running…" : "Run the trial"}
              </GatedActionButton>

              {run.running ? (
                <div className="space-y-1">
                  {run.waitMessage ? (
                    <p className="text-xs text-muted-foreground">
                      {run.waitMessage}
                    </p>
                  ) : null}
                  {run.stage ? (
                    <p className="text-xs text-foreground">{run.stage}</p>
                  ) : null}
                  <DurableRunInterruption interruption={run.interruption} />
                </div>
              ) : null}

              {orderedArms.length > 0 ? (
                <div className="rounded-md border border-border p-2">
                  <p className="text-xs font-medium text-foreground">
                    Arms finished
                  </p>
                  <ul className="mt-1">
                    {orderedArms.map((arm) => (
                      <ArmRow key={arm.arm} arm={arm} />
                    ))}
                  </ul>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Spent so far: {money(liveCost) ?? "$0.00"}
                  </p>
                </div>
              ) : null}

              {run.stoppedMessage ? (
                <p className="text-xs text-muted-foreground">
                  {run.stoppedMessage}
                </p>
              ) : null}

              <DurableRunFailure
                error={run.error}
                retry={run.retry}
                running={run.running}
              />

              {verdict ? <Verdict verdict={verdict} /> : null}
            </div>
          </DialogContent>
        </Dialog>
      </MasterworkDictationOrigin>
    </>
  );
}
