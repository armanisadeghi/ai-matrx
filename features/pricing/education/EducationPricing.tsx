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
// authed) and degrades honestly: anon → sign-up while pre-launch signup grants
// Premium (PRELAUNCH_COMPLIMENTARY_PREMIUM), else login; billing-not-configured
// → a respectful notice. No dark patterns — the pledge is the product.

import { useEffect, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import { announceComingSoon } from "@/lib/coming-soon/announce";

// REC-62 (W1-ORG-APPLY, 2026-09-22): a Stripe customer, subscription and payout
// account belong to an ORGANIZATION, and nothing on the server picks one. These
// calls therefore go through `fetchWithOrganization`, which carries the person's
// selected organization in `X-Organization-Id` and — when the server answers the
// standard organization_required envelope — opens the picker, waits for their
// answer and replays the call once. Cancelling leaves nothing written.
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import {
  ArrowRight,
  Check,
  Infinity as InfinityIcon,
  Loader2,
  Gift,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { selectEntitlementTier } from "@/features/entitlements/state/selectors";
import { readMyPlanSource } from "@/features/entitlements/plan-service";
import { PRELAUNCH_COMPLIMENTARY_PREMIUM } from "./pricingPolicy";
import type { EducationPricing as EducationPricingData } from "./loadEducationPricing";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

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
  "Export your library anytime",
  "Every card cited back to your own material",
];

// Every line is true of the Premium tier today: billing.capability_limit holds
// NO premium rows for these capabilities, so the resolver answers unlimited.
// (A "priority generation" line used to sit here; no tier-aware priority
// exists anywhere in either repo, so it was removed — never re-add a line
// without the code that makes it true.)
const PREMIUM_INCLUDES = [
  "Unlimited flashcards, quizzes, mind maps & notes",
  "Unlimited AI tutor & live grading",
  "Unlimited study audio",
];

const CTA_CLASS = "w-full gap-2";

export function EducationPricing({
  pricing,
}: {
  pricing: EducationPricingData;
}) {
  const loginHref = useLoginHref();
  const signUpHref = useLoginHref("/sign-up");
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const tier = useAppSelector(selectEntitlementTier);
  const isPremium = isAuthenticated && tier === "premium";
  // The snapshot's `isSubscribed` is just `tier in (premium, trial)`, so the
  // grant source is read from the person's own billing.user_plan row.
  const [planSource, setPlanSource] = useState<string | null>(null);
  useEffect(() => {
    if (!isPremium) return;
    let cancelled = false;
    void readMyPlanSource().then((source) => {
      if (!cancelled) setPlanSource(source);
    });
    return () => {
      cancelled = true;
    };
  }, [isPremium]);
  const isComplimentary = isPremium && planSource === "complimentary";
  const [isPending, startTransition] = useTransition();
  const [checkingOut, setCheckingOut] = useState(false);

  const startFree = () => {
    startTransition(() => router.push("/education/start"));
  };

  const upgrade = async () => {
    if (!pricing.premium) return;
    setCheckingOut(true);
    try {
      const res = await fetchWithOrganization("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId: pricing.premium.priceId }),
      });
      if (res.status === 401) {
        router.push(loginHref);
        return;
      }
      if (res.status === 503) {
        void announceComingSoon("education.premium-checkout");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        error?: string;
      };
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

  // The Premium card's one action, decided once:
  //  - already Premium → a status, not a button;
  //  - signed out while every new account is provisioned onto Premium free →
  //    create the account (paying $10 for what signup grants would be a trap);
  //  - otherwise → Stripe Checkout.
  let premiumAction: ReactNode;
  if (isPremium) {
    premiumAction = (
      <div className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-background/15 px-4 py-2.5 text-sm font-medium">
        <Check className="h-4 w-4" />
        {isComplimentary ? "Premium is on — complimentary" : "Your current plan"}
      </div>
    );
  } else if (!isAuthenticated && PRELAUNCH_COMPLIMENTARY_PREMIUM) {
    premiumAction = (
      <Button
        asChild
        size="lg"
        className={`${CTA_CLASS} bg-background text-foreground hover:bg-background/90`}
      >
        <Link href={signUpHref} data-tap-target>
          Create a free account
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    );
  } else {
    premiumAction = (
      <Button
        type="button"
        size="lg"
        onClick={upgrade}
        disabled={!premium || checkingOut}
        className={`${CTA_CLASS} bg-background text-foreground hover:bg-background/90`}
      >
        {checkingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {premium ? "Upgrade to Premium" : "Not available yet"}
        {premium && !checkingOut ? <ArrowRight className="h-3.5 w-3.5" /> : null}
      </Button>
    );
  }

  return (
    <section className="grid gap-6 py-8 lg:grid-cols-2 lg:py-10">
      {/* Free */}
      <div className="matrx-touch-targets flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Free
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">
              $0
            </span>
            <span className="text-sm text-muted-foreground">forever</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Generous enough to finish real study work. We meter only AI
            generation — never the content you&apos;ve already made.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={startFree}
          disabled={isPending}
          className={CTA_CLASS}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {isPremium ? "Open study tools" : "Start free"}
          <ArrowRight className="h-3.5 w-3.5" />
        </Button>

        <div className="flex flex-col gap-2.5">
          {pricing.freeHighlights.map((h) => (
            <div
              key={`${h.capability}:${h.period}`}
              className="flex items-start gap-2.5 text-sm"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                strokeWidth={2.25}
              />
              <span>
                <span className="font-medium tabular-nums">{h.limit}</span>{" "}
                {h.unit} / {h.period}
              </span>
            </div>
          ))}
          {FREE_ALWAYS.map((line) => (
            <div
              key={line}
              className="flex items-start gap-2.5 text-sm text-muted-foreground"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={2}
              />
              <span>{line}</span>
            </div>
          ))}
        </div>
        <p className="mt-auto text-xs text-muted-foreground">
          AI generation is also paced over rolling 5-hour windows, so one
          session can&apos;t spend the month.
        </p>
      </div>

      {/* Premium */}
      <div className="matrx-touch-targets flex flex-col gap-5 rounded-2xl border border-foreground bg-foreground p-6 text-background lg:p-8">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-background/60">
            Premium
          </span>
          {premium ? (
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {formatPrice(premium.amountCents, premium.currency)}
              </span>
              <span className="text-sm text-background/60">
                / {premium.interval}
              </span>
            </div>
          ) : (
            <div className="text-2xl font-semibold tracking-tight">
              Coming soon
            </div>
          )}
          <p className="text-sm text-background/70">
            Unlimited AI generation across every study tool.
          </p>
          {premium?.isTest && (
            <p className="text-xs italic text-background/60">
              Introductory test pricing — final pricing coming soon.
            </p>
          )}
        </div>

        {PRELAUNCH_COMPLIMENTARY_PREMIUM && !isAuthenticated ? (
          <p className="inline-flex items-start gap-2 rounded-lg bg-background/10 px-3 py-2 text-sm">
            <Gift className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Before launch, every new account gets Premium free — no card
              needed.
            </span>
          </p>
        ) : null}

        {premiumAction}

        <div className="flex flex-col gap-2.5 text-sm">
          {PREMIUM_INCLUDES.map((line) => (
            <div key={line} className="flex items-start gap-2.5">
              <InfinityIcon
                className="mt-0.5 h-4 w-4 shrink-0 text-background/80"
                strokeWidth={2.25}
              />
              <span>{line}</span>
            </div>
          ))}
        </div>
        <p className="mt-auto text-center text-xs text-background/60">
          One-click cancel. No silent charges.
        </p>
      </div>
    </section>
  );
}
