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
//  - signed out → Free goes to sign-up and Premium to sign-in, both returning
//    here (/pricing); a new account gets no endless free plan (free time is
//    always dated — billing/new_signup_free_months, 2026-10-04);
//  - signed in → the current plan carries a "Your plan" badge (a status, never
//    a button); Free users get a real Stripe Checkout (/api/stripe/checkout);
//    everyone signed in gets a real link into the study tools.

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { selectEntitlementTier } from "@/features/entitlements/state/selectors";
import type { EducationPricing as EducationPricingData } from "./loadEducationPricing";
import { useLoginHref } from "@/hooks/auth/useLoginHref";

function formatPrice(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: amountCents % 100 === 0 ? 0 : 2,
  }).format(amountCents / 100);
}

// Included in EVERY plan — shown once under both cards, not repeated per card.
const EVERY_PLAN = [
  "Unlimited studying, review & spaced repetition",
  "Keep every deck, note & kit forever",
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
  "No 5-hour pacing",
];

const STUDY_HOME = "/education/kits/new";
const CTA = "w-full gap-2";

// Both cards share one row template on desktop (CSS subgrid): header · action ·
// features · footer, so the feature lists and footers line up Stripe/Linear
// style whatever each card holds.
const CARD =
  "matrx-touch-targets flex flex-col gap-5 rounded-2xl bg-card p-6 lg:row-span-4 lg:grid lg:grid-rows-subgrid lg:gap-5 lg:p-8";

function PlanLabel({
  name,
  badge,
  emphasis,
}: {
  name: string;
  badge?: string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex min-h-6 items-center justify-between gap-2">
      <span
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.2em]",
          emphasis ? "text-primary" : "text-muted-foreground",
        )}
      >
        {name}
      </span>
      {badge ? (
        <Badge
          variant="outline"
          className="gap-1 border-primary/40 text-xs font-medium text-primary"
        >
          <Check className="h-3 w-3" />
          {badge}
        </Badge>
      ) : null}
    </div>
  );
}

function Line({
  icon: Icon,
  children,
  muted,
}: {
  icon: typeof Check;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 text-sm",
        muted && "text-muted-foreground",
      )}
    >
      <Icon
        className="mt-0.5 h-4 w-4 shrink-0 text-primary"
        strokeWidth={2.25}
      />
      <span>{children}</span>
    </li>
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
  const [checkingOut, setCheckingOut] = useState(false);

  const upgrade = async () => {
    if (!pricing.premium) return;
    setCheckingOut(true);
    try {
      const res = await fetchWithOrganization("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey: pricing.premium.planKey,
          cycle: "monthly",
        }),
      });
      if (res.status === 401) {
        router.push(loginHref);
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
  // Card names are the plans' own names (billing.plan); the tier words stand
  // in only when the catalog has no such plan, and say what they are.
  const freeName = pricing.free?.name ?? "Free tier";
  const paidName = premium?.productName ?? "Paid tier";

  // The Premium card's one action.
  let premiumAction: ReactNode;
  if (isPremium) {
    premiumAction = (
      <Button hero variant="primary" asChild className={CTA}>
        <Link href={STUDY_HOME} data-tap-target>
          Open study tools
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    );
  } else if (isAuthenticated) {
    premiumAction = (
      <Button hero
        icon={checkingOut ? <Loader2 className="animate-spin" /> : null} iconEnd={premium && !checkingOut ? (
          <ArrowRight />
        ) : null}
        variant="primary"
        type="button"
        onClick={upgrade}
        disabled={!premium || checkingOut}
        className={CTA}
      >
        {premium ? `Upgrade to ${premium.productName}` : "Not available yet"}
      </Button>
    );
  } else {
    premiumAction = (
      <Button hero variant="primary" asChild className={CTA}>
        <Link href={loginHref} data-tap-target>
          Sign in to upgrade
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
    );
  }

  // The Free card's action. For a Premium member Free is included in their
  // plan: the label's badge says so and the action row stays empty (their one
  // action sits on the Premium card); the subgrid keeps both cards' rows aligned.
  const freeAction = (
    <Button hero asChild variant="outline" className={CTA}>
      <Link href={isAuthenticated ? STUDY_HOME : signUpHref} data-tap-target>
        {isAuthenticated ? "Open study tools" : "Start free"}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </Button>
  );

  return (
    <section className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2 lg:grid-rows-[auto_auto_1fr_auto]">
        {/* Free */}
        <div className={cn(CARD, "border border-border")}>
          <div className="flex flex-col gap-1">
            <PlanLabel
              name={freeName}
              badge={
                isFreeMember
                  ? "Your plan"
                  : isPremium
                    ? "Included in your plan"
                    : undefined
              }
            />
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                $0
              </span>
              <span className="text-sm text-muted-foreground">forever</span>
            </div>
            {pricing.free?.tagline ? (
              <p className="text-sm text-muted-foreground">
                {pricing.free.tagline}
              </p>
            ) : null}
          </div>

          {isPremium ? (
            <div aria-hidden className="hidden lg:block" />
          ) : (
            freeAction
          )}

          <ul className="flex flex-col gap-2.5">
            {pricing.freeHighlights.map((h) => (
              <Line key={`${h.capability}:${h.period}`} icon={Check}>
                <span className="font-medium tabular-nums">{h.limit}</span>{" "}
                {h.unit} / {h.period}
              </Line>
            ))}
            {pricing.freePacing ? (
              <Line icon={Check}>
                Paced per 5 hours — up to{" "}
                <span className="font-medium tabular-nums">
                  {pricing.freePacing.limit}
                </span>{" "}
                {pricing.freePacing.unit} in any 5-hour window
              </Line>
            ) : null}
          </ul>

          <p className="text-sm text-muted-foreground">No card needed.</p>
        </div>

        {/* Premium — the sold plan: primary border and ring, primary action.
            Tokens only; no inverted slab (it glared as near-white in dark). */}
        <div
          className={cn(
            CARD,
            "border-2 border-primary shadow-lg ring-4 ring-primary/10",
            // A Premium member's own plan comes first on a phone.
            isPremium && "order-first lg:order-none",
          )}
        >
          <div className="flex flex-col gap-1">
            <PlanLabel
              name={paidName}
              emphasis
              badge={isPremium ? "Your plan" : undefined}
            />
            {premium ? (
              <div className="flex items-baseline gap-1.5">
                <span className="text-4xl font-semibold tracking-tight tabular-nums">
                  {formatPrice(premium.amountCents, premium.currency)}
                </span>
                <span className="text-sm text-muted-foreground">
                  / {premium.interval}
                </span>
              </div>
            ) : (
              <div className="text-4xl font-semibold tracking-tight">
                Coming soon
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              No limits on AI generation, in any study tool.
            </p>
          </div>

          {premiumAction}

          <ul className="flex flex-col gap-2.5">
            <li className="text-sm font-medium">Everything in Free, plus:</li>
            {PREMIUM_PLUS.map((line) => (
              <Line key={line} icon={InfinityIcon}>
                {line}
              </Line>
            ))}
          </ul>

          <p className="text-sm text-muted-foreground">
            Cancel anytime from the billing portal.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card/60 px-6 py-4 lg:flex-row lg:items-center lg:gap-6 lg:px-8">
        <span className="shrink-0 text-sm font-medium">
          Every plan includes
        </span>
        <ul className="grid flex-1 gap-2 sm:grid-cols-2 lg:gap-x-6">
          {EVERY_PLAN.map((line) => (
            <Line key={line} icon={Check} muted>
              {line}
            </Line>
          ))}
        </ul>
      </div>
    </section>
  );
}
