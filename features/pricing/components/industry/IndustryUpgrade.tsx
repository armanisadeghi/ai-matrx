"use client";

import { useState } from "react";
import { ArrowRight, Check, Quote, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { BillingToggle } from "../BillingToggle";
import { PlanCard } from "../PlanCard";
import { useChoosePlan } from "../useChoosePlan";
import { usePlanCatalog } from "@/features/entitlements/catalog/usePlanCatalog";
import { annualSavingsPercent } from "@/features/entitlements/catalog/format";
import type { BillingCycle, CatalogPlan } from "@/features/entitlements/catalog/types";
import { INDUSTRIES, type IndustryId } from "./industries";

interface IndustryUpgradeProps {
  industry: IndustryId;
  /** Override what choosing a plan does (demos). Defaults to useChoosePlan. */
  onSelect?: (plan: CatalogPlan) => void;
  /** Show as inline page section (default) or compact card. */
  variant?: "page" | "compact";
  className?: string;
}

export function IndustryUpgrade({
  industry,
  onSelect,
  variant = "page",
  className,
}: IndustryUpgradeProps) {
  const cfg = INDUSTRIES[industry];
  const [cycle, setCycle] = useState<BillingCycle>("annual");
  const catalog = usePlanCatalog();
  const { signedIn, choose } = useChoosePlan();
  const handleSelect = onSelect ?? choose;
  const recommended =
    catalog.status === "ready"
      ? catalog.plans.find((p) => p.planKey === cfg.recommendedPlanId)
      : undefined;
  const Icon = cfg.icon;

  if (variant === "compact") {
    return (
      <div
        className={cn(
          "flex flex-col gap-4 rounded-2xl border border-border/70 bg-card p-5",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground text-background">
            <Icon className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {cfg.eyebrow}
            </span>
            <h3 className="text-base font-semibold leading-snug tracking-tight">
              {cfg.headline}
            </h3>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {cfg.subhead}
        </p>
        {recommended && (
          <button
            type="button"
            onClick={() => handleSelect(recommended)}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background transition-transform hover:scale-[1.01]"
          >
            Try {recommended.name} for {cfg.label}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-12 lg:gap-16", className)}>
      {/* Hero */}
      <section className="grid gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-14">
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background px-3 py-1 text-[11px] font-semibold uppercase tracking-wider">
              <Icon className="h-3 w-3" strokeWidth={2.5} />
              {cfg.eyebrow}
            </span>
          </div>
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight md:text-5xl lg:text-6xl">
            {cfg.headline}
          </h1>
          <p className="max-w-xl text-pretty text-base leading-relaxed text-muted-foreground md:text-lg">
            {cfg.subhead}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {recommended && (
              <button
                type="button"
                onClick={() => handleSelect(recommended)}
                className="inline-flex items-center gap-2 rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-transform hover:scale-[1.02]"
              >
                Choose {recommended.name}
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg border border-border/80 bg-background px-5 py-2.5 text-sm font-medium hover:bg-accent/40"
            >
              See {cfg.label} demo
            </button>
          </div>
        </div>

        {/* Proof column */}
        <div className="relative flex flex-col gap-5 rounded-3xl border border-border/60 bg-muted/30 p-6 lg:p-8">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Why {cfg.label.toLowerCase()} teams pick AI Matrx
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {cfg.proof.map((p) => (
              <div
                key={p.label}
                className="flex flex-col gap-1 rounded-xl bg-background p-3 ring-1 ring-border/60"
              >
                <span className="text-xl font-semibold tracking-tight">
                  {p.metric}
                </span>
                <span className="text-[11px] leading-tight text-muted-foreground">
                  {p.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-start gap-3 rounded-xl border border-border/60 bg-background p-4">
            <ShieldCheck
              className="mt-0.5 h-4 w-4 shrink-0"
              strokeWidth={1.75}
            />
            <p className="text-xs leading-relaxed text-muted-foreground">
              {cfg.guardrail}
            </p>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section>
        <div className="mb-6 flex items-baseline justify-between gap-4">
          <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            Where {cfg.label.toLowerCase()} teams actually use it
          </h2>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
          {cfg.useCases.map((u) => (
            <div
              key={u.title}
              className="flex flex-col gap-3 bg-card p-6 transition-colors hover:bg-card/80"
            >
              <u.icon className="h-5 w-5" strokeWidth={1.75} />
              <h3 className="font-semibold tracking-tight">{u.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {u.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Quote */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-card px-7 py-9 lg:px-12 lg:py-12">
        <Quote
          className="absolute right-8 top-8 h-16 w-16 text-muted-foreground/10"
          strokeWidth={1}
        />
        <div className="relative flex max-w-2xl flex-col gap-4">
          <p className="text-pretty text-xl font-medium leading-snug tracking-tight md:text-2xl">
            "{cfg.quote.body}"
          </p>
          <span className="text-sm font-medium text-muted-foreground">
            — {cfg.quote.attribution}
          </span>
        </div>
      </section>

      {/* Plan recommendation */}
      <section className="grid gap-6 lg:grid-cols-[1fr_1.1fr] lg:items-center">
        <div className="flex flex-col gap-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Recommended for {cfg.label.toLowerCase()}
          </span>
          <h2 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            {recommended ? `Start on ${recommended.name}.` : "Start on the right plan."}
            <br />
            Move up if your trajectory says so.
          </h2>
          <div className="mt-3 flex flex-col gap-2">
            {[
              "Cancel or downgrade anytime",
              "Migrate workspaces & memory between tiers",
            ].map((line) => (
              <div
                key={line}
                className="inline-flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Check
                  className="h-3.5 w-3.5 shrink-0 text-foreground"
                  strokeWidth={3}
                />
                {line}
              </div>
            ))}
          </div>
          <div className="mt-2">
            <BillingToggle
              value={cycle}
              onChange={setCycle}
              savingsPercent={recommended ? annualSavingsPercent(recommended) : null}
            />
          </div>
        </div>
        {recommended && (
          <PlanCard plan={recommended} cycle={cycle} signedIn={signedIn} onSelect={handleSelect} />
        )}
      </section>
    </div>
  );
}
