import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BadgeDollarSign,
  BellRing,
  Gauge,
  Gift,
  MousePointerClick,
  ScrollText,
  ShieldOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export const metadata: Metadata = {
  title: "Billing-Integrity Pledge — AI Matrx",
  description:
    "Our promises in plain language: one-click cancel, pre-charge reminders, limits visible up front, a genuinely generous free tier, no ads, and honest refunds.",
  alternates: { canonical: "/pricing/pledge" },
  openGraph: {
    title: "Billing-Integrity Pledge — AI Matrx",
    description:
      "One-click cancel, pre-charge reminders, visible limits, a generous free tier, no ads, honest refunds.",
    url: "/pricing/pledge",
    type: "website",
  },
};

type Pledge = {
  icon: LucideIcon;
  title: string;
  promise: string;
  detail: string;
};

const PLEDGES: Pledge[] = [
  {
    icon: MousePointerClick,
    title: "One-click cancel",
    promise: "Cancel from the customer portal in a single click.",
    detail:
      "No retention maze, no \"call us to cancel,\" no hunting for a hidden link, no exit survey standing between you and the button. The same portal that started your plan ends it — one click, effective immediately or at period end, your choice.",
  },
  {
    icon: BellRing,
    title: "We remind you before every charge",
    promise: "You get an email before each renewal — trials included.",
    detail:
      "A renewal should never be a surprise line on a statement. We email you ahead of every charge, and especially before a trial converts to paid, so you can decide on purpose. A silent charge is a failure on our part, not a feature of ours.",
  },
  {
    icon: Gauge,
    title: "Limits are visible up front",
    promise: "You always see \"X of Y left\" before you hit a cap.",
    detail:
      "Every metered action shows what remains before you start it — never an ambush halfway through a workflow. If something is limited, you'll know the number in advance, and you'll know it while there's still time to decide.",
  },
  {
    icon: Gift,
    title: "A genuinely generous free tier",
    promise: "Finish a real study session for free.",
    detail:
      "We meter AI generation, and only AI generation — the part that actually costs money to produce. Your saved decks, notes, quizzes, and study history are never capped, never held hostage, and never deleted to pressure an upgrade. The free tier is meant to be used, not to frustrate you into paying.",
  },
  {
    icon: ShieldOff,
    title: "No ads. Ever.",
    promise: "We will never sell your attention or your data to advertisers.",
    detail:
      "Our business is the subscription, full stop. You are the customer, not the product. There are no ads, no ad trackers, and no plan to add them later.",
  },
  {
    icon: BadgeDollarSign,
    title: "Honest refunds and proration",
    promise: "Fair proration on changes, and refunds when they're warranted.",
    detail:
      "Upgrade or downgrade and we prorate the difference cleanly. If something goes wrong on our end, we make it right. We won't hide behind fine print to keep money we didn't earn.",
  },
];

export default function PledgePage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
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
            <ScrollText className="h-3.5 w-3.5" strokeWidth={2} />
            Our billing-integrity pledge
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Six promises about how we&apos;ll charge you.
          </h1>
          <p className="max-w-2xl text-pretty text-base leading-relaxed text-muted-foreground">
            The AI education market is full of paywall traps and cancellation
            dark patterns. We&apos;re building the opposite on purpose. These
            aren&apos;t marketing lines — they&apos;re the standard we hold
            ourselves to, and the standard you should hold us to.
          </p>
        </header>

        {/* Pledges */}
        <div className="mt-12 flex flex-col gap-4">
          {PLEDGES.map(({ icon: Icon, title, promise, detail }, idx) => (
            <section
              key={title}
              className="flex flex-col gap-3 rounded-2xl border border-border bg-card/70 p-6 sm:flex-row sm:gap-5 lg:p-8"
            >
              <div className="flex items-start gap-4 sm:flex-col sm:items-center sm:gap-2">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-foreground/5 text-foreground">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </span>
                <span className="mt-1 text-xs font-medium tabular-nums text-muted-foreground/60 sm:mt-0">
                  {String(idx + 1).padStart(2, "0")}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <h2 className="text-lg font-semibold tracking-tight">
                  {title}
                </h2>
                <p className="text-sm font-medium text-foreground">{promise}</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {detail}
                </p>
              </div>
            </section>
          ))}
        </div>

        {/* Closing CTA */}
        <section className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:justify-between lg:p-8">
          <div className="flex flex-col gap-1.5">
            <h2 className="text-balance text-xl font-semibold tracking-tight">
              See exactly what the incumbents lock away.
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
              We put our stance next to the public record on Chegg, Quizlet, and
              Course Hero. Judge for yourself.
            </p>
          </div>
          <Link
            href="/pricing/compare"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.99]"
          >
            Compare the field
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </section>
      </div>
    </div>
  );
}
