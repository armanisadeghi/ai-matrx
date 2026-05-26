import type { Metadata } from "next";
import Link from "next/link";
import {
  TrendingUp,
  CalendarRange,
  HeartPulse,
  ArrowRight,
  Calculator,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Settlement utilities · CA WC",
  description:
    "Settlement projection tools — present value, number of weeks, and life expectancy.",
};

const UTILITIES = [
  {
    href: "/legal/ca-wc/utilities/present-value",
    title: "Present Value",
    icon: TrendingUp,
    description:
      "Discount future PD payments to today's dollars. Compare lump-sum settlement offers against the time-value of weekly indemnity.",
  },
  {
    href: "/legal/ca-wc/utilities/weeks",
    title: "Number of Weeks",
    icon: CalendarRange,
    description:
      "Convert dates to weeks of PD payments, or work backwards from an end date to a start. Useful for verifying benefit duration.",
  },
  {
    href: "/legal/ca-wc/utilities/life-expectancy",
    title: "Life Expectancy",
    icon: HeartPulse,
    description:
      "Actuarial life expectancy at MMI. Project life-pension exposure for ratings of 70%+ and lifetime benefit modeling.",
  },
];

export default function UtilitiesHubPage() {
  return (
    <div className="h-dvh w-full overflow-y-auto">
      <div style={{ height: "var(--shell-header-h, 2.75rem)" }} />
      <div className="min-h-dvh bg-background">
        <header className="border-b border-border bg-gradient-to-b from-primary/5 via-background to-background">
          <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-10">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary mb-4">
              <Calculator className="h-3.5 w-3.5" />
              Settlement utilities
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-foreground">
              Projection &amp; modeling tools
            </h1>
            <p className="mt-2 max-w-2xl text-sm sm:text-base text-muted-foreground">
              Quick utilities for settlement modeling and life-pension
              projections. Use these alongside a rating from the PD calculator.
            </p>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {UTILITIES.map((util) => {
              const Icon = util.icon;
              return (
                <Link
                  key={util.href}
                  href={util.href}
                  className="group relative rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 transition-transform group-hover:scale-110">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-semibold mb-2 flex items-center gap-1.5">
                    {util.title}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {util.description}
                  </p>
                </Link>
              );
            })}
          </div>

          <div className="mt-10 rounded-2xl border border-dashed border-border bg-muted/30 p-6">
            <div className="flex items-start gap-3">
              <Calculator className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Need a full PD rating?
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  These utilities supplement the rating engine — for the full
                  AMA-aligned rating with combined per-side calculation, use the{" "}
                  <Link
                    href="/legal/ca-wc/pd-ratings-calculator"
                    className="text-primary hover:underline font-medium"
                  >
                    PD Ratings Calculator
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
