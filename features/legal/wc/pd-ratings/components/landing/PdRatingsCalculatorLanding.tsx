import Link from "next/link";
import {
  Calculator,
  Activity,
  DollarSign,
  CalendarDays,
  HeartPulse,
  TrendingUp,
  ArrowRight,
  Layers,
  Replace,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STATS = [
  { value: "0–100%", label: "Rating range" },
  { value: "5", label: "Sub-calculators" },
  { value: "AMA Guides", label: "Aligned" },
  { value: "70%+", label: "Life pension threshold" },
];

const SUB_CALCULATORS = [
  {
    icon: Activity,
    title: "PPD Calculator",
    description:
      "Body part + WPI + impairment slider + pain + industrial → adjusted impairment, age + occupation modifiers, combined rating across multiple injuries.",
  },
  {
    icon: DollarSign,
    title: "Present Value",
    description:
      "Discount future PD payments to today’s dollars. Compare settlement offers against the time-value of weekly indemnity.",
  },
  {
    icon: CalendarDays,
    title: "Weeks Calculator",
    description:
      "Convert ratings to weeks of PD, or work backwards from an end date to a start. Pick a mode, get the other.",
  },
  {
    icon: HeartPulse,
    title: "Life Expectancy",
    description:
      "Actuarial life expectancy at MMI for life-pension projections at 70%+ ratings.",
  },
  {
    icon: TrendingUp,
    title: "AWC",
    description:
      "Average Weekly Compensation calculations for indemnity rate determination.",
  },
];

const CHAIN = [
  {
    number: "01",
    title: "Whole Person Impairment (WPI)",
    description:
      "Pulled from the AMA-coded impairment definition + medical findings.",
  },
  {
    number: "02",
    title: "Pain + apportionment",
    description:
      "Add pain (0–3) and industrial percentage (0–100) for each injury.",
  },
  {
    number: "03",
    title: "Age + occupation adjustments",
    description:
      "Combined rating computed per side, adjusted by occupational group and age at date of injury.",
  },
  {
    number: "04",
    title: "Weeks → dollars",
    description:
      "Final percentage drives weeks of PD, total compensation, and (at 70%+) the life pension calculation.",
  },
];

const WHY = [
  {
    icon: ShieldCheck,
    title: "Deterministic",
    description:
      "No model creativity in the math. Calculations execute through validated formulas, not LLM guesses.",
  },
  {
    icon: Layers,
    title: "Multi-injury",
    description:
      "Combine ratings across left, right, and default sides using the AMA combining-values approach — not a sum.",
  },
  {
    icon: Replace,
    title: "Replayable",
    description:
      "Every input, every adjustment, every output is logged and replayable per claim.",
  },
];

export default function PdRatingsCalculatorLanding() {
  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent"
        />
        <div
          aria-hidden
          className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Calculator className="h-3.5 w-3.5" />
            California PD Ratings
          </div>
          <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
            From WPI to{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              final rating, weeks, and dollars
            </span>{" "}
            — in one calculator.
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
            California Permanent Disability ratings (0%–100%) measure how
            much a work-related injury limits earning capacity after MMI. Built
            on AMA Guides, age + occupation adjusted, with weeks of payments,
            present value, life expectancy, and AWC — all in one shell,
            all replayable.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2"
              asChild
            >
              <Link href="/demos/ca-pd-calculator">
                Launch the calculator
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8"
              asChild
            >
              <Link href="/legal/ca-wc">Back to CA WC</Link>
            </Button>
          </div>

          {/* Stat row */}
          <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 max-w-3xl mx-auto">
            {STATS.map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card/60 backdrop-blur px-4 py-3"
              >
                <div className="text-xl md:text-2xl font-bold tracking-tight">
                  {stat.value}
                </div>
                <div className="text-[11px] sm:text-xs text-muted-foreground mt-0.5 uppercase tracking-wider">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What is a PD rating? */}
      <section className="bg-card/50 border-y border-border">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-12 sm:py-16">
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <h2 className="text-[clamp(1.25rem,1rem+1vw,1.875rem)] font-bold tracking-tight mb-4">
              What is a California PD rating?
            </h2>
            <div className="space-y-4 text-base text-muted-foreground leading-relaxed">
              <p>
                California Permanent Disability (PD) ratings measure how much a
                work-related injury limits an injured worker&rsquo;s earning
                capacity after they reach{" "}
                <span className="text-foreground font-medium">
                  Maximum Medical Improvement (MMI)
                </span>
                . Ratings run from{" "}
                <span className="text-foreground font-medium">0% to 100%</span>.
              </p>
              <p>
                Calculations start from a medical evaluation under the{" "}
                <span className="text-foreground font-medium">AMA Guides</span>,
                then are adjusted for age at injury and occupational group. The
                final percentage drives weeks of indemnity payments and total
                compensation.
              </p>
              <p>
                At a rating of{" "}
                <span className="text-foreground font-medium">
                  70% or higher
                </span>
                , the worker also qualifies for a life pension — weekly
                payments that continue for life on top of the PD weeks. Getting
                the rating right is high-stakes for both sides.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Sub-calculators */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12 sm:mb-16">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Five calculators, one shell
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Switch between them without losing context. Inputs you have already
            entered carry over.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {SUB_CALCULATORS.map((tool) => (
            <div
              key={tool.title}
              className={cn(
                "group relative rounded-2xl border border-border bg-card p-6",
                "transition-all duration-300",
                "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4 group-hover:scale-110 transition-transform duration-300">
                <tool.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold mb-2">{tool.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {tool.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How calculations chain */}
      <section className="bg-card/50 border-y border-border">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
              How a rating gets built
            </h2>
            <p className="mt-4 text-muted-foreground text-lg">
              Four chained steps, deterministic at every stage.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8">
            {CHAIN.map((step) => (
              <div key={step.number} className="flex gap-4">
                <div className="flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-2xl bg-primary/10 text-primary font-bold text-lg">
                  {step.number}
                </div>
                <div>
                  <h3 className="font-semibold text-base mb-1">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why this calculator */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-12">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Why this calculator
          </h2>
          <p className="mt-4 text-muted-foreground text-lg max-w-2xl mx-auto">
            Numbers have to be defensible. So they are produced by formulas, not
            by guesses.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {WHY.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-border bg-card p-6"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary mb-4">
                <item.icon className="h-5 w-5" />
              </div>
              <h3 className="text-base font-semibold mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Run a rating
          </h2>
          <p className="mt-4 text-muted-foreground text-lg mb-8">
            Start with a single PPD calculation, or chain into present value,
            weeks, life expectancy, and AWC.
          </p>
          <Button
            size="lg"
            className="min-h-[44px] text-base px-10 gap-2"
            asChild
          >
            <Link href="/demos/ca-pd-calculator">
              Launch the calculator
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
