import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Gauge,
  Info,
  MousePointerClick,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "How We Compare — AI Matrx",
  description:
    "What the incumbents lock away versus what's free here. A public-record comparison against Chegg, Quizlet, and Course Hero — and the Matrx stance on each.",
  alternates: { canonical: "/pricing/compare" },
  openGraph: {
    title: "How We Compare — AI Matrx",
    description:
      "What the incumbents lock away versus what's free here — a public-record comparison.",
    url: "/pricing/compare",
    type: "website",
  },
};

// Public-record facts only. Every competitor claim below is a matter of public
// record (regulatory action / published consumer ratings). Do not add claims
// beyond these without a verifiable public source.
type PublicRecord = {
  subject: string;
  fact: string;
  source: string;
  matrxStance: string;
};

const PUBLIC_RECORD: PublicRecord[] = [
  {
    subject: "Chegg",
    fact: "Paid a $7.5M settlement to the U.S. Federal Trade Commission over cancellation dark patterns that made it hard for subscribers to stop being charged.",
    source: "U.S. FTC settlement (public record)",
    matrxStance:
      "One-click cancel from the customer portal — no maze, no phone call, no exit gauntlet.",
  },
  {
    subject: "Quizlet",
    fact: "Paywall changes to previously-free features drove its consumer rating on Trustpilot to roughly 1.4 out of 5 stars.",
    source: "Trustpilot consumer rating (public, approximate)",
    matrxStance:
      "We meter AI generation, never the content you already made. Your saved decks stay free to study, forever.",
  },
  {
    subject: "Course Hero",
    fact: "Holds a consumer rating of roughly 1.6 out of 5 stars, with recurring complaints about billing and access.",
    source: "Trustpilot consumer rating (public, approximate)",
    matrxStance:
      "Limits visible up front and honest, prorated billing — you always see \"X of Y left\" before a cap.",
  },
];

type Row = {
  dimension: string;
  incumbent: string;
  matrx: string;
};

const TABLE_ROWS: Row[] = [
  {
    dimension: "Cancelling your plan",
    incumbent:
      "Retention flows, hidden links, and \"contact us\" hurdles — the pattern the FTC fined Chegg $7.5M over.",
    matrx: "One click in the customer portal. Same place you started.",
  },
  {
    dimension: "Previously-free features",
    incumbent:
      "Moved behind a paywall over time — a driver of Quizlet's ~1.4★ consumer rating.",
    matrx:
      "The core study loop stays free. We never retroactively lock what was free.",
  },
  {
    dimension: "What gets metered",
    incumbent:
      "Your access to content you already created or unlocked can be gated to pressure an upgrade.",
    matrx:
      "Only AI generation is metered. Saved decks, notes, and history are never capped or deleted.",
  },
  {
    dimension: "Seeing your limits",
    incumbent:
      "Caps discovered mid-workflow, often at the moment you need the feature most.",
    matrx:
      "Every metered action shows \"X of Y left\" before you start it. No mid-workflow ambush.",
  },
  {
    dimension: "Renewals & charges",
    incumbent:
      "Silent renewals and trial-to-paid conversions land as surprise statement lines.",
    matrx:
      "We email you before every charge — trials included. A silent charge is a defect, not a tactic.",
  },
  {
    dimension: "Ads",
    incumbent:
      "Consumer complaints span billing friction and access; attention is monetized in the market broadly.",
    matrx: "No ads. Ever. You're the customer, not the product.",
  },
];

type Stance = {
  icon: LucideIcon;
  title: string;
  body: string;
};

const STANCES: Stance[] = [
  {
    icon: Sparkles,
    title: "Free study loop",
    body: "Finish a real study session without paying. Generation is metered; studying what you made is not.",
  },
  {
    icon: Gauge,
    title: "Visible limits",
    body: "You see the number before the cap, every time. Nothing is discovered mid-workflow.",
  },
  {
    icon: MousePointerClick,
    title: "One-click cancel",
    body: "No retention maze — the exact dark pattern regulators are now fining.",
  },
  {
    icon: Check,
    title: "Meter generation, not content",
    body: "We charge for the expensive part (AI generation), never for keeping what you already have.",
  },
];

export default function ComparePage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
        <Link
          href="/pricing"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to pricing
        </Link>

        {/* Hero */}
        <header className="mt-8 flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <Star className="h-3.5 w-3.5" strokeWidth={2} />
            The public record
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            What they lock away vs. what&apos;s free here.
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
            The incumbents in AI-assisted study built their businesses on
            paywalls that ambush and cancellations that fight back. That&apos;s
            not our opinion — it&apos;s the regulatory and consumer record below.
            Here&apos;s where each stands, and where we stand instead.
          </p>
        </header>

        {/* Our stance strip */}
        <section className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {STANCES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="flex flex-col gap-3 bg-card p-6">
              <Icon className="h-5 w-5 text-foreground" strokeWidth={1.75} />
              <h2 className="font-semibold tracking-tight">{title}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </section>

        {/* Public record cards */}
        <section className="mt-14">
          <h2 className="text-balance text-2xl font-semibold tracking-tight">
            The record, cited.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Each claim below is a matter of public record — regulatory action or
            published consumer ratings. We contrast each with the Matrx stance.
          </p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {PUBLIC_RECORD.map(({ subject, fact, source, matrxStance }) => (
              <article
                key={subject}
                className="flex flex-col gap-3 rounded-2xl border border-border bg-card/70 p-6"
              >
                <h3 className="text-lg font-semibold tracking-tight">
                  {subject}
                </h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {fact}
                </p>
                <p className="mt-auto flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">
                  <Info className="h-3 w-3" strokeWidth={2} />
                  {source}
                </p>
                <div className="mt-1 flex items-start gap-2 rounded-lg border border-border/60 bg-foreground/[0.03] p-3">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                    strokeWidth={2.5}
                  />
                  <p className="text-sm font-medium text-foreground">
                    {matrxStance}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* Comparison table */}
        <section className="mt-14">
          <h2 className="text-balance text-2xl font-semibold tracking-tight">
            Side by side.
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            The typical incumbent practice next to what we commit to instead.
          </p>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-border">
            <table className="w-full min-w-[720px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-5 py-4 font-semibold tracking-tight">
                    Dimension
                  </th>
                  <th className="px-5 py-4 font-semibold tracking-tight text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <X className="h-4 w-4 text-red-500" strokeWidth={2.5} />
                      Typical incumbent
                    </span>
                  </th>
                  <th className="px-5 py-4 font-semibold tracking-tight">
                    <span className="inline-flex items-center gap-1.5">
                      <Check
                        className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
                        strokeWidth={2.5}
                      />
                      AI Matrx
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map((row, idx) => (
                  <tr
                    key={row.dimension}
                    className={
                      idx % 2 === 0
                        ? "border-b border-border/60 bg-card/40"
                        : "border-b border-border/60 bg-card/70"
                    }
                  >
                    <td className="px-5 py-4 align-top font-medium tracking-tight">
                      {row.dimension}
                    </td>
                    <td className="px-5 py-4 align-top leading-relaxed text-muted-foreground">
                      {row.incumbent}
                    </td>
                    <td className="px-5 py-4 align-top leading-relaxed text-foreground">
                      {row.matrx}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground/80">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
            Consumer ratings are approximate and change over time; the Chegg FTC
            settlement figure is drawn from the public regulatory record.
            &quot;Typical incumbent&quot; describes patterns documented across
            these products, not a claim about any single feature at a single
            moment.
          </p>
        </section>

        {/* CTA */}
        <section className="mt-14 flex flex-col items-start gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:justify-between lg:p-8">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-balance text-xl font-semibold tracking-tight">
              Study on a platform built to earn your trust.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              Read the promises we hold ourselves to, then start free — no card,
              no ambush.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/pricing/pledge"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium transition-colors hover:border-foreground/40 hover:bg-accent/40"
            >
              Read the pledge
            </Link>
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              See plans
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
