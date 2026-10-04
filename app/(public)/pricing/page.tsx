import Link from "next/link";
import { ArrowRight, CalendarX2, Eye, Gauge, ShieldCheck } from "lucide-react";
import { EducationPricing } from "@/features/pricing/education/EducationPricing";
import { loadEducationPricing } from "@/features/pricing/education/loadEducationPricing";
import { PricingGrid } from "@/features/pricing/components/PricingGrid";
import { readPlanCatalogServer } from "@/features/entitlements/catalog/server";
import { SubscriptionControls } from "@/features/pricing/components/SubscriptionControls";
import { requiredStripeMode } from "@/lib/stripe/server";

// /pricing is DB-BACKED end to end:
//  - the plan ladder comes from billing.plan_catalog() (every listed plan, its
//    exact prices in cents and its AI points per window), read here on the
//    server and handed to the client grid so the first paint needs no fetch;
//    a failed read falls through to the grid's own read and its error state.
//  - the education section keeps its own DB read (billing.capability_limit +
//    billing.product/price) — see features/pricing/FEATURE.md.

// The billing-integrity promises shown under the plans — each one is true
// today (the pledge page marks the ones still being built "Before paid
// launch"; none of those appear here).
const PLEDGE = [
  {
    icon: CalendarX2,
    title: "One-click cancel",
    body: "Cancel from the billing portal in one click — no retention maze.",
  },
  {
    icon: Eye,
    title: "Limits you can see",
    body: "Every limit is on this page, and the app shows what you have left.",
  },
  {
    icon: Gauge,
    title: "We meter generation only",
    body: "Studying, reviewing and keeping what you made are never metered.",
  },
  {
    icon: ShieldCheck,
    title: "No ads, no silent charges",
    body: "We never sell your attention, and nothing is charged that you didn't choose.",
  },
];

export default async function PricingPage() {
  const [pricing, catalog] = await Promise.all([loadEducationPricing(), readPlanCatalogServer()]);

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10 sm:px-6 lg:gap-12 lg:px-8 lg:py-14">
        <header className="mx-auto flex max-w-2xl flex-col items-center gap-3 text-center">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Pricing
          </span>
          <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            Pick the plan that fits your work
          </h1>
        </header>

        <PricingGrid initialPlans={catalog.ok ? catalog.plans : undefined} />
        <SubscriptionControls livemode={requiredStripeMode() === "live"} />

        <section
          aria-labelledby="pricing-education"
          className="flex flex-col gap-6 border-t border-border/60 pt-10"
        >
          <h2 id="pricing-education" className="text-xl font-semibold tracking-tight">
            Studying? Education plans
          </h2>
          <EducationPricing pricing={pricing} />
        </section>

        <section
          aria-labelledby="pricing-pledge"
          className="flex flex-col gap-6 border-t border-border/60 pt-10"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <h2 id="pricing-pledge" className="text-xl font-semibold tracking-tight">
              Priced to earn trust, not to trap you
            </h2>
            {/* Two siblings, one style: neither reads as primary or disabled. */}
            <div className="matrx-touch-targets flex flex-wrap items-center gap-x-5">
              {[
                { href: "/pricing/pledge", label: "Read the full pledge" },
                { href: "/pricing/compare", label: "How we compare" },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  data-tap-target
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ))}
            </div>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLEDGE.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex flex-col gap-1.5">
                <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </span>
                <span className="text-sm font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{body}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
