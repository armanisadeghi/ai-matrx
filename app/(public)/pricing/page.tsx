import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ScrollText, Scale, ShieldCheck } from "lucide-react";
import { PricingLandingRoute } from "@/features/pricing/components/PricingLandingRoute";

export const metadata: Metadata = {
  title: "Pricing — AI Matrx",
  description:
    "Simple, honest pricing for the AI Matrx harness. A generous free tier, limits visible up front, one-click cancel, and no silent charges — ever.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — AI Matrx",
    description:
      "A generous free tier, limits visible up front, one-click cancel, and no silent charges — ever.",
    url: "/pricing",
    type: "website",
  },
};

// NOTE(P8): Plans render from the static PLANS[] in features/pricing/data.ts.
// TODO(P8): swap to DB-backed billing.product/price once seeded. Do not invent
// new prices here — the numbers live in one place (data.ts) until the DB owns them.

export default function PricingPage() {
  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        {/* Trust banner — the billing-integrity promise, above the plans */}
        <section className="pt-10 lg:pt-14">
          <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card/60 p-6 sm:flex-row sm:items-center sm:justify-between lg:p-8">
            <div className="flex flex-col gap-2">
              <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} />
                Billing integrity, in writing
              </span>
              <h1 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
                Priced to earn trust, not to trap you.
              </h1>
              <p className="max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground">
                One-click cancel. Limits you can see before you hit them. A free
                tier generous enough to finish real work. We meter AI
                generation, never the content you&apos;ve already made.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:items-end">
              <Link
                href="/pricing/pledge"
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02] active:scale-[0.99]"
              >
                <ScrollText className="h-4 w-4" strokeWidth={2} />
                Read our billing pledge
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/pricing/compare"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                <Scale className="h-3.5 w-3.5" strokeWidth={2} />
                How we compare to the incumbents
              </Link>
            </div>
          </div>
        </section>

        <PricingLandingRoute />

        {/* Footer trust reminder */}
        <section className="border-t border-border/40 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            Every plan is backed by our{" "}
            <Link
              href="/pricing/pledge"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              billing-integrity pledge
            </Link>
            . No ads, no dark patterns, no silent charges.
          </p>
        </section>
      </div>
    </div>
  );
}
