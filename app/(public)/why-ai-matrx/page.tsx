import Link from "next/link";
import {
  ArrowRight,
  Check,
  Compass,
  Gauge,
  Info,
  Infinity as InfinityIcon,
  TrendingUp,
  X,
  type LucideIcon,
} from "lucide-react";

import { createRouteMetadata } from "@/utils/route-metadata";
import { AGENT_ICON } from "@/components/icons/domain-icons";

export const metadata = createRouteMetadata("/why-ai-matrx", {
  title: "Why AI Matrx",
  description:
    "Every AI tool you have bought gives you the average of the internet. We capture the judgment of the specific people your company runs on, compress it until a cheap model can execute it, and prove it against their own withheld work.",
  canonicalPath: "/why-ai-matrx",
  keywords: [
    "expert distillation",
    "tacit knowledge capture",
    "enterprise AI",
    "expert judgment",
  ],
});

/**
 * WHY AI MATRX — the differentiator page.
 *
 * Source of truth for every word on this page:
 * `common-docs/systems/masterwork/doctrine/advantage-stack.md`
 *   §1 The Story (the ten beats) · §2 The Bright Line · §4.2 The three wins.
 *
 * 🚨 CLAIM DISCIPLINE (advantage-stack §9). This page may carry POSITIONING
 * only — "we bottle your outlier, not the average" is always sayable. It may
 * NOT state a benchmark result, a cost multiple, or any "beat the frontier
 * model" sentence until a five-arm trial is on record. The three wins below
 * are described as the kinds of result a trial can produce, never as results
 * we hold. Do not "improve" this page by adding numbers.
 *
 * Server component on purpose: a prospect's first paint costs no JS and every
 * word ships in the crawlable HTML.
 */

type Beat = {
  n: number;
  title: string;
  body: string;
};

/** advantage-stack.md §1 — the ten beats, rewritten for the web. */
const BEATS: Beat[] = [
  {
    n: 1,
    title:
      "Your company runs on a handful of people who are unreasonably good at specific things.",
    body: "The adjuster who knows which claims are lying. The estimator whose bids come in right. The engineer who smells the bug. The partner who knows which deals to walk away from. Their judgment is why the numbers work.",
  },
  {
    n: 2,
    title: "None of it is written down.",
    body: "Not really. The SOP describes what should happen. These people describe what actually happens — and they only describe it when someone asks the right question.",
  },
  {
    n: 3,
    title:
      "Every AI tool you have bought so far gives you the average of the internet.",
    body: "That is genuinely useful for the average task. It is worthless for the task where your expert's entire value is that they disagree with the average.",
  },
  {
    n: 4,
    title: "Models learned the field. They did not learn your person.",
    body: "Training on ten thousand practitioners teaches a model the consensus of ten thousand practitioners. Isolating one person's deviation from that consensus is the opposite operation. No amount of scale performs it, because it is not a capability problem — it is a data problem, and the data does not exist.",
  },
  {
    n: 5,
    title: "So we make it exist.",
    body: "We sit with your expert. We ask the questions that surface what they did not know they knew. We watch them work. We interview their boss and the junior they keep correcting. We mine their documents, their sheets, their tickets, their email. We analyse their finished work against a baseline of their peers, and we extract the difference.",
  },
  {
    n: 6,
    title: "That output has never existed, for anyone, in any form.",
    body: "It is not retrievable, not searchable, not in a training corpus. We created it in your building, and it belongs to you.",
  },
  {
    n: 7,
    title: "Then we compress it until a cheap model can execute it.",
    body: "Not a prompt — a pipeline. Explicit steps, checklists, decision forks, severity weights, and a short, named list of the irreducible intuition we could not formalise, tracked openly rather than hidden.",
  },
  {
    n: 8,
    title: "Then we prove it.",
    body: "Against your expert's real, withheld work. Against the best frontier model on earth, handed the same source material, full tooling, web access and a hundred times the budget. Blind-judged, with dollars and seconds on every arm.",
  },
  {
    n: 9,
    title:
      "And we prove it in the only way that matters: your expert looks at the output and says “yes — that’s mine.”",
    body: "Including the strange call. Especially the strange call.",
  },
  {
    n: 10,
    title: "Then it compounds.",
    body: "Every correction your people make to our output becomes a new rule. The system gets more like your expert every week it runs, inside your walls, where nobody else can see it.",
  },
];

/** advantage-stack.md §2 — the bright line, as a two-column table. */
const BRIGHT_LINE: Array<{ theirs: string; ours: string }> = [
  {
    theirs: "The book, the five thousand articles, the full corpus",
    ours: "The elicitation transcript from an interview only we ran",
  },
  {
    theirs: "The SOPs, the manuals, the guidelines",
    ours: "The compressed distillate we built and ablation-tested",
  },
  {
    theirs: "Historical job tickets and past outputs",
    ours: "The contrastive analysis isolating this expert from their peers",
  },
  {
    theirs: "Their public videos, talks and blog posts",
    ours: "The decision tree built by pushing them through forty edge cases",
  },
  {
    theirs:
      "Retrieval over all of it, web access, tools, agentic scaffolding",
    ours: "The negative-space list of what they never do",
  },
  {
    theirs: "A large budget and a competent prompt",
    ours: "The severity weights, the rubric, the correction log",
  },
];

/** advantage-stack.md §4.2 — the three wins, in plain language. */
type WinCard = {
  icon: LucideIcon;
  name: string;
  plain: string;
  condition: string;
  earnedOn: string;
  durability: string;
  durabilityTone: "strongest" | "strong" | "weakest";
};

const WINS: WinCard[] = [
  {
    icon: InfinityIcon,
    name: "No budget reaches it",
    plain:
      "The frontier model cannot produce this answer no matter how much you spend on it, because the thing it would need was never written down anywhere.",
    condition:
      "The heavily-funded frontier arm cannot reach your expert's real work at any budget we are willing to run.",
    earnedOn:
      "Judgment that lives in someone's head. No amount of spending conjures an artifact that never existed.",
    durability:
      "Permanent. This is the strongest thing we can ever claim, and the rarest.",
    durabilityTone: "strongest",
  },
  {
    icon: AGENT_ICON,
    name: "Better, not just cheaper",
    plain:
      "Our workflow on a cheap model produces better work than the frontier model with every advantage money can buy.",
    condition:
      "Our arm beats the heavily-funded frontier arm on the things that actually matter in the work, not on word count.",
    earnedOn:
      "Examples of your expert's finished work, where the comparison against a peer baseline is something we assembled and nobody else has.",
    durability:
      "Strong. It rests on an artifact we built, which does not get cheaper for somebody else to copy.",
    durabilityTone: "strong",
  },
  {
    icon: Gauge,
    name: "Same quality, a fraction of the cost",
    plain:
      "Our workflow matches the frontier model's quality while running on a cheap model, for far less money and far less waiting.",
    condition:
      "Our arm ties the heavily-funded frontier arm, at a fraction of the cost and the latency.",
    earnedOn:
      "Public material we compressed ahead of time. Honest caveat: a capable agent can compress on the fly, so in this case we precomputed rather than invented.",
    durability:
      "Weakest, and we say so. Frontier prices fall fast, so this one has a half-life — we report it with its decay and never as a headline.",
    durabilityTone: "weakest",
  },
];

const DURABILITY_STYLES: Record<WinCard["durabilityTone"], string> = {
  strongest:
    "border-emerald-600/30 bg-emerald-600/5 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/5 dark:text-emerald-300",
  strong: "border-border bg-muted/40 text-muted-foreground",
  weakest: "border-amber-600/30 bg-amber-600/5 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/5 dark:text-amber-300",
};

export default function WhyAiMatrxPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 lg:px-8">
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section className="flex flex-col gap-4 pt-10 lg:pt-16">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Compass className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
            Why AI Matrx
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-5xl">
            Everyone else sells you the average. We bottle your outlier.
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            There is no context window large enough to hold a thing that was
            never written down. So we go and write it down — with the specific
            people whose judgment your company actually runs on — and then we
            make a cheap model execute it, their way, every time.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link
              href="/how-we-prove-it"
              className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              See how we prove it
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden />
            </Link>
            <Link
              href="/the-landscape"
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold transition-colors hover:bg-accent"
            >
              Compare us to everything else
            </Link>
          </div>
        </section>

        {/* ── The ten beats ────────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              The argument, in ten steps
            </h2>
            <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              This is the whole case. If you disagree with one of these ten,
              that is the conversation worth having — tell us which number.
            </p>
          </div>

          <ol className="grid gap-3 md:grid-cols-2">
            {BEATS.map((beat) => (
              <li
                key={beat.n}
                className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary">
                  {beat.n}
                </span>
                <h3 className="text-pretty text-base font-semibold leading-snug tracking-tight">
                  {beat.title}
                </h3>
                <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
                  {beat.body}
                </p>
              </li>
            ))}
          </ol>

          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 p-5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <TrendingUp className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
            </span>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              <span className="font-semibold text-foreground">
                Every other AI purchase depreciates. This one appreciates,
                because it eats your corrections.
              </span>{" "}
              A model release helps us as much as it helps anyone — our
              advantage sits on top of theirs rather than competing with it, so
              we get faster and cheaper on their research budget.
            </p>
          </div>
        </section>

        {/* ── The bright line ──────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              The bright line
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              One rule makes our comparisons honest and our product
              defensible:{" "}
              <span className="font-semibold text-foreground">
                every input that existed before we walked in belongs to the
                competition too. Everything created during the engagement is
                ours.
              </span>{" "}
              The test is a timestamp, not a judgment call — did this artifact
              exist before the engagement started? Auditable, unarguable,
              logged.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-sm">
              <caption className="sr-only">
                What a competing system is given in our comparisons, and what it
                is never given
              </caption>
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold tracking-tight text-muted-foreground"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Check
                        className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      The competition gets all of this
                    </span>
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold tracking-tight"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <X
                        className="h-4 w-4 text-red-500"
                        strokeWidth={2.5}
                        aria-hidden
                      />
                      And never gets any of this
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {BRIGHT_LINE.map((row, idx) => (
                  <tr
                    key={row.theirs}
                    className={
                      idx % 2 === 0
                        ? "border-b border-border/60 bg-card/40"
                        : "border-b border-border/60 bg-card/70"
                    }
                  >
                    <td className="px-5 py-4 align-top leading-relaxed text-muted-foreground">
                      {row.theirs}
                    </td>
                    <td className="px-5 py-4 align-top leading-relaxed text-foreground">
                      {row.ours}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-card/60 p-5">
            <h3 className="text-sm font-semibold tracking-tight">
              Why this is not cheating, stated plainly for a sceptic
            </h3>
            <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
              Withholding the <em>source</em> would measure information access.
              That is a rigged test and we do not run it. Withholding{" "}
              <em>our artifacts</em> measures whether the artifacts are worth
              anything — which is the entire product question. If an artifact
              could have been produced by anyone with a week and a search bar,
              it is not an artifact, and it goes to the other side of the table.
            </p>
          </div>
        </section>

        {/* ── The three wins ───────────────────────────────────────── */}
        <section className="mt-12 flex flex-col gap-5 lg:mt-16">
          <div className="flex flex-col gap-2">
            <h2 className="text-balance text-xl font-semibold tracking-tight md:text-2xl">
              Three kinds of win — and we always tell you which one we are
              claiming
            </h2>
            <p className="max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
              Vendors blur these together, because the weakest one sounds the
              loudest. We keep them apart. Every report we hand you names the
              win it is claiming, and says how long that claim is good for.
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            {WINS.map((win) => {
              const Icon = win.icon;
              return (
                <article
                  key={win.name}
                  className="flex h-full flex-col gap-3 rounded-2xl border border-border bg-card p-5"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" strokeWidth={2} aria-hidden />
                  </span>
                  <h3 className="text-balance text-base font-semibold tracking-tight">
                    {win.name}
                  </h3>
                  <p className="text-pretty text-sm leading-relaxed text-foreground">
                    {win.plain}
                  </p>
                  <dl className="flex flex-col gap-2 border-t border-border pt-3 text-sm">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        What has to happen
                      </dt>
                      <dd className="text-pretty leading-relaxed text-muted-foreground">
                        {win.condition}
                      </dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        Where it comes from
                      </dt>
                      <dd className="text-pretty leading-relaxed text-muted-foreground">
                        {win.earnedOn}
                      </dd>
                    </div>
                  </dl>
                  <p
                    className={`mt-auto text-pretty rounded-lg border px-3 py-2 text-xs leading-relaxed ${DURABILITY_STYLES[win.durabilityTone]}`}
                  >
                    {win.durability}
                  </p>
                </article>
              );
            })}
          </div>

          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/80">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
            These describe the kinds of result an engagement can produce and the
            conditions each one requires. They are not results we are claiming
            here. We publish a number only when a full trial is on record, and
            we name the arm and the budget when we do.
          </p>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────── */}
        <section className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:justify-between lg:mt-16 lg:p-8">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-balance text-xl font-semibold tracking-tight">
              Point us at the six people whose judgment you cannot afford to
              lose.
            </h2>
            <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
              Keep the seats. Keep the Copilot. Let the engineers keep their
              coding agents. We work on the part none of those touch.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/the-landscape"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-accent/40"
            >
              The landscape
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
