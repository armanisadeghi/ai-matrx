"use client";

// features/pricing/education/EducationPricing.tsx
//
// The public education /pricing surface (P8 F5). DB-backed, education-first:
// a genuinely generous Free tier (limits from billing.capability_limit) and a
// Premium plan priced from billing.product/price. Replaces the generic
// agent-harness PLANS[] on the /pricing route (that stays for the (dev)/demos
// upgrade demos — see FEATURE.md for the structure decision).
//
// The Premium CTA starts a real Stripe Checkout session (/api/stripe/checkout,
// authed) and degrades honestly: anon → login, billing-not-configured → a
// respectful notice. No dark patterns — the pledge is the product.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Infinity as InfinityIcon,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEntitlementTier } from "@/features/entitlements/state/selectors";
import type { EducationPricing as EducationPricingData } from "./loadEducationPricing";

function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

const FREE_ALWAYS = [
  "Unlimited studying, review & spaced repetition",
  "Keep every deck, note & kit — forever",
  "Export your data anytime",
  "Every card cited back to your own material",
];

export function EducationPricing({ pricing }: { pricing: EducationPricingData }) {
  const router = useRouter();
  const tier = useAppSelector(selectEntitlementTier);
  const isPremium = tier === "premium" || tier === "trial";
  const [isPending, startTransition] = useTransition();
  const [checkingOut, setCheckingOut] = useState(false);

  const startFree = () => {
    startTransition(() => router.push("/education/start"));
  };

  const upgrade = async () => {
    if (!pricing.premium) return;
    setCheckingOut(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: pricing.premium.priceId }),
      });
      if (res.status === 401) {
        router.push("/login?next=/pricing");
        return;
      }
      if (res.status === 503) {
        toast.info("Checkout isn't switched on yet — hang tight, it's coming soon.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) {
        toast.error(body.error ?? "Couldn't start checkout. Please try again.");
        return;
      }
      window.location.href = body.url;
    } catch {
      toast.error("Couldn't start checkout. Please try again.");
    } finally {
      setCheckingOut(false);
    }
  };

  const premium = pricing.premium;

  return (
    <section className="grid gap-6 py-10 lg:grid-cols-2 lg:py-14">
      {/* Free */}
      <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Free
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">$0</span>
            <span className="text-sm text-muted-foreground">forever</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Generous enough to finish real study work. We meter only AI
            generation — never the content you&apos;ve already made.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          {pricing.freeHighlights.map((h) => (
            <div key={h.capability} className="flex items-start gap-2.5 text-sm">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" strokeWidth={2.25} />
              <span>
                <span className="font-medium tabular-nums">{h.monthly}</span>{" "}
                {h.label.toLowerCase()} / month
              </span>
            </div>
          ))}
          {FREE_ALWAYS.map((line) => (
            <div key={line} className="flex items-start gap-2.5 text-sm text-muted-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
              <span>{line}</span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={startFree}
          disabled={isPending}
          className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Start free
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Premium */}
      <div className="relative flex flex-col gap-5 rounded-2xl border border-foreground bg-foreground p-6 text-background lg:p-8">
        <span className="absolute right-5 top-5 inline-flex items-center gap-1 rounded-full bg-background/15 px-2.5 py-1 text-[11px] font-medium">
          <Sparkles className="h-3 w-3" /> Premium
        </span>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-background/60">
            {premium ? premium.productName : "Premium"}
          </span>
          {premium ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {formatPrice(premium.amountCents, premium.currency)}
              </span>
              <span className="text-sm text-background/60">/ {premium.interval}</span>
            </div>
          ) : (
            <div className="text-2xl font-semibold tracking-tight">Coming soon</div>
          )}
          <p className="text-sm text-background/70">
            {premium?.description ??
              "Unlimited AI generation across every study tool."}
          </p>
          {premium?.isTest && (
            <p className="text-xs italic text-background/50">
              Introductory test pricing — final pricing coming soon.
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2.5 text-sm">
          {[
            "Unlimited flashcards, quizzes, mind maps & notes",
            "Unlimited AI tutor & live grading",
            "Unlimited study audio",
            "Priority generation on capacity",
          ].map((line) => (
            <div key={line} className="flex items-start gap-2.5">
              <InfinityIcon className="mt-0.5 h-4 w-4 shrink-0 text-background/80" strokeWidth={2.25} />
              <span>{line}</span>
            </div>
          ))}
        </div>

        {isPremium ? (
          <div className="mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-background/15 px-4 py-2.5 text-sm font-medium">
            <Check className="h-4 w-4" /> Your current plan
          </div>
        ) : (
          <button
            type="button"
            onClick={upgrade}
            disabled={!premium || checkingOut}
            className={cn(
              "mt-auto inline-flex items-center justify-center gap-2 rounded-lg bg-background px-4 py-2.5 text-sm font-medium text-foreground transition-transform hover:scale-[1.02] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60",
            )}
          >
            {checkingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {premium ? "Upgrade to Premium" : "Not available yet"}
            {premium && !checkingOut ? <ArrowRight className="h-3.5 w-3.5" /> : null}
          </button>
        )}
        <p className="text-center text-xs text-background/60">
          One-click cancel. We email before every renewal. No silent charges.
        </p>
      </div>
    </section>
  );
}
