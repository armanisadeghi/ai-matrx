import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  BrainCircuit,
  Clock,
  DollarSign,
  EyeOff,
  Info,
  Quote,
  ShieldAlert,
  Target,
  type LucideIcon,
} from "lucide-react";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/how-we-prove-it", {
  title: "How We Prove It",
  description:
    "The five-arm bench: identical prompts, cost and time on every arm, your expert's real work sitting blind in the judging pool — and the rule that voids the whole trial if your expert does not win it.",
  canonicalPath: "/how-we-prove-it",
  keywords: [
    "AI evaluation",
    "blind evaluation",
    "benchmark",
    "expert ground truth",
  ],
});

/**
 * HOW WE PROVE IT — the proof-architecture page.
 *
 * Source of truth: `common-docs/systems/masterwork/doctrine/advantage-stack.md`
 *   §4 Proof Architecture v2 (the arms, the void rule, the programme metrics)
 *   and §1 beats 8–9.
 *
 * 🚨 CLAIM DISCIPLINE (advantage-stack §9). This page describes the METHOD.
 * It carries no scores, no dollar figures, no multiples and no "we beat the
 * frontier model" sentence — those are earned one at a time by a logged
 * five-arm trial with the expert's own work winning the blind panel, and each
 * one must name its arm and its budget where it is published. Never add a
 * number to this page from memory, an internal deck, or an estimate.
 *
 * Server component: crawlable, zero JS.
 */

type Arm = {
  code: string;
  name: string;
  setup: string;
  role: string;
  tone: "baseline" | "frontier" | "floor" | "ours" | "truth";
};

/** advantage-stack.md §4.1 — the arms. */
const ARMS: Arm[] = [
  {
    code: "A0",
    name: "Frontier model, cold",
    setup:
      "The best model available, a competent prompt, and nothing else. No source material.",
    role: "Establishes what you already get for free from the tools you have bought. If this arm already makes the unusual calls, the subject fails our gate and we tell you so instead of selling you a trial.",
    tone: "baseline",
  },
  {
    code: "A1",
    name: "Frontier model, fully briefed",
    setup:
      "The same model, handed the entire source corpus in context — the books, the manuals, the SOPs, the archive.",
    role: "Removes “well, it never saw the material” as an explanation for any gap. It saw all of it.",
    tone: "frontier",
  },
  {
    code: "A2",
    name: "Frontier model, every advantage money buys",
    setup:
      "The same model plus retrieval, tools, live web access and full agentic scaffolding — run up to a ceiling of a hundred times what our arm costs, with the whole spend curve reported.",
    role: "The arm that has to be beaten. A ceiling with a published curve is a benchmark; “unlimited tokens” is a shrug, so we set the ceiling and show what each score band cost to reach.",
    tone: "frontier",
  },
  {
    code: "B",
    name: "Cheap model, raw",
    setup:
      "The same inexpensive model our workflow runs on, with no workflow at all.",
    role: "The floor. This is the arm that proves the result came from the captured method and not from the model underneath it — without it, any win is unattributable.",
    tone: "floor",
  },
  {
    code: "C",
    name: "Our workflow on the cheap model",
    setup:
      "The captured method — the checklists, the decision forks, the severity weights, the negative space — executed by the same cheap model as the floor arm.",
    role: "The product. Scored on the same rubric, against the same prompts, with its own cost and latency on the row.",
    tone: "ours",
  },
  {
    code: "GT",
    name: "Your expert's real work",
    setup:
      "Work your expert actually produced, withheld from every arm, dropped into the judging pool unlabelled.",
    role: "Ground truth — and the trial's own integrity check. It is judged blind alongside the machines.",
    tone: "truth",
  },
];

const ARM_TONE: Record<Arm["tone"], string> = {
  baseline: "bg-muted text-muted-foreground",
  frontier:
    "bg-sky-600/10 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300",
  floor: "bg-muted text-muted-foreground",
  ours: "bg-primary/10 text-primary",
  truth:
    "bg-emerald-600/10 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300",
};

type Rule = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const RULES: Rule[] = [
  {
    icon: Target,
    title: "Identical prompts on every arm",
    body: "Every arm is asked for exactly the same thing, in exactly the same words. The separation between arms is made by removing tools and material, and every tool call is logged so the air gap can be audited afterwards rather than taken on trust.",
  },
  {
    icon: DollarSign,
    title: "Dollars on every row",
    body: "Every arm reports what it cost to run. The heavily-resourced arm reports its whole spend curve, so you can see what it had to spend to reach each score band — which is a far more useful number than any single headline.",
  },
  {
    icon: Clock,
    title: "Seconds on every row",
    body: "Every arm reports its wall-clock latency too. A result that is better but takes four hours is a different product from one that is better in nine seconds, and we will not let a report hide which one you are being sold.",
  },
  {
    icon: EyeOff,
    title: "Blind judging, with the human in the pool",
    body: "The judges do not know which output came from which arm. Your expert's own withheld work is in the pool as one more unlabelled entry. Before a judge is trusted on two thousand cases, it has to reproduce your expert's calls on twenty.",
  },
];

/** advantage-stack.md §4.4 — programme metrics. */
const METRICS: Array<{ name: string; body: string }> = [
  {
    name: "Cost to parity",
    body: "What the heavily-resourced arm has to spend before it matches ours.",
  },
  {
    name: "Capture cost",
    body: "How many hours of your expert's time the artifact consumed. Their time is the scarcest thing in the engagement and we report it like a cost, because it is one.",
  },
  {
    name: "Walls hit",
    body: "Every place a real person got stuck inside the capture product. A first-class metric, because the capture experience is the product, not the packaging.",
  },
  {
    name: "Stage-by-stage contribution",
    body: "Every step of our own pipeline is run with and without itself, quarterly. A step that moves nothing gets removed. Every corner has to show its number.",
  },
];

export default function HowWeProveItPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 pt-10 lg:pt-16">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            How we prove it
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            We run the comparison we could lose.
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            Most AI vendors show you a demo. We put our workflow on a cheap
            model, put the best frontier model on earth beside it with a hundred
            times the budget, drop your expert&apos;s real work into the pool
            unlabelled, and let a blind panel sort them out — with dollars and
            seconds on every single row.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/why-ai-matrx"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Why we do it this way
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <Link
              href="/the-landscape"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
            >
              The landscape
            </Link>
          </div>
        </section>

        {/* ── The bench ────────────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              The five-arm bench
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Five machine arms, identical prompts, plus your expert&apos;s own
              withheld work sitting blind in the same judging pool. Quality,
              cost and time are recorded for every arm, every run.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[840px] border-collapse text-left text-sm">
              <caption className="sr-only">
                The five arms of the bench, plus ground truth, with what each is
                given and what each is for
              </caption>
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold tracking-tight"
                  >
                    Arm
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold tracking-tight"
                  >
                    What it is given
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold tracking-tight"
                  >
                    What it is for
                  </th>
                  <th
                    scope="col"
                    className="whitespace-nowrap px-5 py-4 font-semibold tracking-tight"
                  >
                    Measured
                  </th>
                </tr>
              </thead>
              <tbody>
                {ARMS.map((arm, idx) => (
                  <tr
                    key={arm.code}
                    className={
                      idx % 2 === 0
                        ? "border-b border-border/60 bg-card/40"
                        : "border-b border-border/60 bg-card/70"
                    }
                  >
                    <th
                      scope="row"
                      className="px-5 py-4 align-top text-left font-medium"
                    >
                      <span
                        className={`inline-flex items-center rounded-md px-2 py-0.5 font-mono text-xs font-semibold ${ARM_TONE[arm.tone]}`}
                      >
                        {arm.code}
                      </span>
                      <span className="mt-1.5 block text-pretty tracking-tight">
                        {arm.name}
                      </span>
                    </th>
                    <td className="px-5 py-4 align-top leading-relaxed text-muted-foreground">
                      {arm.setup}
                    </td>
                    <td className="px-5 py-4 align-top leading-relaxed text-muted-foreground">
                      {arm.role}
                    </td>
                    <td className="px-5 py-4 align-top">
                      {arm.tone === "truth" ? (
                        <span className="text-xs text-muted-foreground">
                          Judged, not timed
                        </span>
                      ) : (
                        <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                          <li className="flex items-center gap-1.5">
                            <BrainCircuit
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2}
                              aria-hidden
                            />
                            Quality
                          </li>
                          <li className="flex items-center gap-1.5">
                            <DollarSign
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2}
                              aria-hidden
                            />
                            Cost
                          </li>
                          <li className="flex items-center gap-1.5">
                            <Clock
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={2}
                              aria-hidden
                            />
                            Time
                          </li>
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/80">
            <Info
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              strokeWidth={2}
              aria-hidden
            />
            The cheap-model floor arm is the one most vendors skip, and it is
            the one that makes a win mean anything. Without it, a good result
            might simply be the model doing well on its own — and nobody could
            tell the difference, including us.
          </p>
        </section>

        {/* ── The void rule ────────────────────────────────────────── */}
        <section className="mt-12 lg:mt-16">
          <div className="flex flex-col gap-4 rounded-2xl border border-amber-600/30 bg-amber-600/5 p-6 dark:border-amber-400/25 dark:bg-amber-400/[0.04] lg:p-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-600/10 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
              <ShieldAlert className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              If your expert does not win the blind panel, the trial is void.
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Their real work is in the pool, unlabelled, judged by the same
              panel on the same rubric as every machine. If the panel does not
              put the human first, the panel is wrong — or the rubric is
              measuring the wrong thing, or the cases were badly chosen. Either
              way the run is thrown out and nothing from it is ever quoted to
              you. A benchmark whose judge cannot recognise excellence when it
              is sitting right there is not measuring excellence.
            </p>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              This rule exists to stop us. It is the single easiest way for a
              vendor to fool a customer, and the single easiest way for a team
              to fool itself.
            </p>
          </div>
        </section>

        {/* ── The rules ────────────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              What makes it a benchmark and not a demo
            </h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2">
            {RULES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex flex-col gap-3 bg-card p-6">
                <Icon
                  className="h-5 w-5 text-foreground"
                  strokeWidth={1.75}
                  aria-hidden
                />
                <h3 className="text-balance font-semibold tracking-tight">
                  {title}
                </h3>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── The sentence ─────────────────────────────────────────── */}
        <section className="mt-12 lg:mt-16">
          <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 lg:p-8">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Quote className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              The result that actually settles it is one sentence long.
            </h2>
            <blockquote className="max-w-3xl border-l-2 border-primary/40 pl-4 text-pretty text-lg font-medium leading-relaxed tracking-tight md:text-2xl">
              &ldquo;Yes — that&apos;s mine.&rdquo;
            </blockquote>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Your expert reads the output and recognises their own judgment in
              it. Including the strange call — especially the strange call, the
              one their peers would argue with, the one that is the reason you
              employ them and not somebody cheaper.
            </p>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Every rule in the captured method cites where it came from: the
              interview turn, the worked example, the correction. So they can
              say it rule by rule rather than taking the whole thing on faith —
              and so can anyone who has to defend a decision later.
            </p>
          </div>
        </section>

        {/* ── Programme metrics ────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              What else we track, and hand you
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              A score on its own is easy to dress up. These are the numbers that
              make a score honest.
            </p>
          </div>
          <dl className="grid gap-3 sm:grid-cols-2">
            {METRICS.map((metric) => (
              <div
                key={metric.name}
                className="flex flex-col gap-1.5 rounded-2xl border border-border bg-card p-5"
              >
                <dt className="text-balance text-base font-semibold tracking-tight">
                  {metric.name}
                </dt>
                <dd className="text-pretty text-sm leading-relaxed text-muted-foreground">
                  {metric.body}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Claim discipline ─────────────────────────────────────── */}
        <section className="mt-12 lg:mt-16">
          <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-6">
            <h2 className="text-balance text-base font-semibold tracking-tight">
              What you will not find on this page
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
              A score, a multiple, or a sentence about beating a frontier model.
              We publish those one engagement at a time, from a logged run, and
              we name the arm and the budget every time we do. Marketing that
              outruns the bench destroys the bench — so this page describes the
              method, and the numbers arrive with the trial they came from.
            </p>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
              We also will not tell you AI replaces your expert. It does part of
              their job, their way, so they get their time back. That is what is
              actually true, it is what people actually want, and it is the only
              version the expert themselves will cooperate with — and without
              their cooperation there is no product at all.
            </p>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <section className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:justify-between lg:mt-16 lg:p-8">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-balance text-xl font-semibold tracking-tight">
              Use this on us.
            </h2>
            <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              We publish the seven questions we think every buyer should put to
              an AI vendor — and we expect you to put all seven to us first.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/the-landscape"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-accent/40"
            >
              The seven questions
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              Talk to us
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
