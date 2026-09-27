"use client";

// features/pricing/education/EducationPricing.tsx
//
// The public education /pricing surface (P8 F5). DB-backed, education-first:
// a genuinely generous Free tier (limits from billing.capability_limit) and a
// Premium plan priced from billing.product/price. Replaces the generic
// agent-harness PLANS[] on the /pricing route (that stays for the (dev)/demos
// upgrade demos — see FEATURE.md for the structure decision).
//
// Actions by state (one destination per outcome):
//  - signed out → both cards go to sign-up, which returns here (/pricing);
//    while pre-launch signup grants Premium (PRELAUNCH_COMPLIMENTARY_PREMIUM)
//    the Premium card says so instead of selling a checkout;
//  - signed in → the current plan carries a "Your plan" badge (a status, never
//    a button); Free users get a real Stripe Checkout (/api/stripe/checkout);
//    everyone signed in gets a real link into the study tools.

import { useEffect, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
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
// NO premium rows for any education capability (month, day OR rolling 5-hour
// windows), so the resolver answers unlimited. Never add a line without the
// code that makes it true (a "priority generation" line was removed for that).
const PREMIUM_PLUS = [
  "Unlimited documents to study from",
  "Unlimited flashcard decks, quizzes, mind maps & notes",
  "Unlimited AI tutor messages & live grading",
  "Unlimited study audio",
  "Unlimited practice tests & memory aids",
  "Unlimited card images",
  "No 5-hour pacing windows",
];

const STUDY_HOME = "/education/start";
const CTA = "w-full gap-2";

function PlanLabel({ name, current, note, inverted }: {
  name: string;
  current: boolean;
  note?: string;
  inverted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.2em]",
          inverted ? "text-background/60" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
      {current ? (
        <Badge
          variant="outline"
          className={cn(
            "gap-1 text-xs font-medium",
            inverted && "border-background/30 text-background",
          )}
        >
          <Check className="h-3 w-3" />
          Your plan{note ? ` · ${note}` : ""}
        </Badge>
      ) : null}
    </div>
  );
}

export function EducationPricing({
  pricing,
}: {
  pricing: EducationPricingData;
}) {
  const loginHref = useLoginHref();
  // Sign-up returns the visitor here, so both cards share one destination.
  const signUpHref = useLoginHref("/sign-up");
  const router = useRouter();
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const tier = useAppSelector(selectEntitlementTier);
  const isPremium = isAuthenticated && tier === "premium";
  const isFreeMember = isAuthenticated && !isPremium;
  // `entitlement_snapshot().is_subscribed` is just `tier in (premium, trial)`,
  // so the grant source is read from the person's own billing.user_plan row.
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
  const [checkingOut, setCheckingOut] = useState(false);

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
  const invertedCta = `${CTA} bg-background text-foreground hover:bg-background/90`;

  return (
    // items-start: each card is its own height — stretching the shorter one
    // to match only manufactures an empty block (final look, 2026-09-27).
    <section className="grid items-start gap-6 lg:grid-cols-2">
      {/* Free */}
      <div className="matrx-touch-targets flex flex-col gap-5 rounded-2xl border border-border bg-card p-6 lg:p-8">
        <div className="flex flex-col gap-1">
          <PlanLabel name="Free" current={isFreeMember} />
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tracking-tight tabular-nums">
              $0
            </span>
            <span className="text-sm text-muted-foreground">forever</span>
          </div>
          <p className="text-sm text-muted-foreground">
            Enough to finish real study work every month.
          </p>
        </div>

        {isPremium ? (
          <p className="flex min-h-10 items-center text-sm text-muted-foreground">
            Everything here is included in your Premium plan.
          </p>
        ) : (
          <Button asChild variant="outline" size="lg" className={CTA}>
            <Link href={isFreeMember ? STUDY_HOME : signUpHref} data-tap-target>
              {isFreeMember ? "Open study tools" : "Start free"}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}

        <ul className="flex flex-col gap-2.5">
          {pricing.freeHighlights.map((h) => (
            <li
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
            </li>
          ))}
          {FREE_ALWAYS.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2.5 text-sm text-muted-foreground"
            >
              <Check
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                strokeWidth={2}
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          AI generation is also paced over rolling 5-hour windows, so one
          session can&apos;t spend the month.
        </p>
      </div>

      {/* Premium */}
      <div className="matrx-touch-targets flex flex-col gap-5 rounded-2xl border border-foreground bg-foreground p-6 text-background lg:p-8">
        <div className="flex flex-col gap-1">
          <PlanLabel
            name="Premium"
            current={isPremium}
            note={isComplimentary ? "complimentary" : undefined}
            inverted
          />
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
            <div className="text-4xl font-semibold tracking-tight">
              Coming soon
            </div>
          )}
          <p className="text-sm text-background/70">
            {isComplimentary
              ? "Complimentary before launch — no card on file."
              : "No limits on AI generation, in any study tool."}
          </p>
        </div>

        {isAuthenticated ? (
          isPremium ? (
            <Button asChild size="lg" className={invertedCta}>
              <Link href={STUDY_HOME} data-tap-target>
                Open study tools
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          ) : (
            <Button
              type="button"
              size="lg"
              onClick={upgrade}
              disabled={!premium || checkingOut}
              className={invertedCta}
            >
              {checkingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {premium ? "Upgrade to Premium" : "Not available yet"}
              {premium && !checkingOut ? <ArrowRight className="h-3.5 w-3.5" /> : null}
            </Button>
          )
        ) : PRELAUNCH_COMPLIMENTARY_PREMIUM ? (
          <Button asChild size="lg" className={invertedCta}>
            <Link href={signUpHref} data-tap-target>
              <Gift className="h-4 w-4" />
              Get Premium free before launch
            </Link>
          </Button>
        ) : (
          <Button asChild size="lg" className={invertedCta}>
            <Link href={loginHref} data-tap-target>
              Sign in to upgrade
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}

        <ul className="flex flex-col gap-2.5 text-sm">
          <li className="font-medium">Everything in Free, plus:</li>
          {PREMIUM_PLUS.map((line) => (
            <li key={line} className="flex items-start gap-2.5">
              <InfinityIcon
                className="mt-0.5 h-4 w-4 shrink-0 text-background/80"
                strokeWidth={2.25}
              />
              <span>{line}</span>
            </li>
          ))}
        </ul>
        {!isAuthenticated && PRELAUNCH_COMPLIMENTARY_PREMIUM ? (
          <p className="text-xs text-background/60">
            Every new account gets Premium at no charge until launch. No card
            needed.
          </p>
        ) : null}
      </div>
    </section>
  );
}
