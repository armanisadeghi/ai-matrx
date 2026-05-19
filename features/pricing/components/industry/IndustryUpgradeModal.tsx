"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Crown,
  X,
  Zap
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { BillingToggle } from "../BillingToggle";
import {
  PLANS,
  TRIAL_DAYS,
  formatPrice,
  type BillingCycle,
  type Plan,
} from "@/features/pricing/data";
import { INDUSTRIES, type IndustryId } from "./industries";

interface IndustryUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  industry: IndustryId;
  initialCycle?: BillingCycle;
  /** Override the recommended plan from industries.ts. */
  initialPlanId?: string;
  /** Allow trial CTA copy override. */
  ctaSuffix?: string;
  onSelect?: (plan: Plan, cycle: BillingCycle) => void;
}

const TRUST_POINTS = [
  { icon: Zap, label: `${TRIAL_DAYS}-day trial` },
  { icon: ShieldCheck, label: "Cancel anytime" },
  { icon: Crown, label: "All frontier models" },
];

export function IndustryUpgradeModal({
  open,
  onOpenChange,
  industry,
  initialCycle = "annual",
  initialPlanId,
  ctaSuffix,
  onSelect,
}: IndustryUpgradeModalProps) {
  const cfg = INDUSTRIES[industry];
  const Icon = cfg.icon;

  const recommendedId = initialPlanId ?? cfg.recommendedPlanId;
  const recommendedPlan = PLANS.find((p) => p.id === recommendedId);

  // Show recommended + neighboring tiers in the same category, capped at 4 picks.
  const sameCategory = recommendedPlan
    ? PLANS.filter((p) => p.category === recommendedPlan.category)
    : [];
  const visible = sameCategory.length ? sameCategory.slice(0, 4) : PLANS.slice(0, 4);

  const [cycle, setCycle] = useState<BillingCycle>(initialCycle);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    recommendedId,
  );
  const selected = visible.find((p) => p.id === selectedId) ?? recommendedPlan;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-border/70 p-0 sm:max-w-5xl [&>button.absolute]:hidden">
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr]">
          {/* LEFT: industry-flavored hero */}
          <div className="relative flex flex-col justify-between gap-7 bg-foreground px-7 py-8 text-background lg:px-9 lg:py-10">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.6),transparent_45%),radial-gradient(circle_at_75%_75%,rgba(255,255,255,0.4),transparent_50%)]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 [mask-image:linear-gradient(to_bottom,transparent,black_25%,black_75%,transparent)]"
            >
              <svg
                width="100%"
                height="100%"
                xmlns="http://www.w3.org/2000/svg"
                className="opacity-[0.06]"
              >
                <defs>
                  <pattern
                    id={`grid-${industry}`}
                    width="32"
                    height="32"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 32 0 L 0 0 0 32"
                      fill="none"
                      stroke="white"
                      strokeWidth="0.5"
                    />
                  </pattern>
                </defs>
                <rect
                  width="100%"
                  height="100%"
                  fill={`url(#grid-${industry})`}
                />
              </svg>
            </div>

            <div className="relative flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/10 ring-1 ring-background/20">
                  <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <span className="text-sm font-medium tracking-tight">
                  AI Matrx · {cfg.label}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md p-1.5 text-background/70 transition-colors hover:bg-background/10 hover:text-background"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex flex-col gap-5">
              <span className="inline-flex w-fit items-center gap-2 rounded-full bg-background/10 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-background/80 ring-1 ring-background/15">
                {cfg.eyebrow}
              </span>
              <h2 className="text-balance text-2xl font-semibold leading-[1.1] tracking-tight lg:text-[28px]">
                {cfg.headline}
              </h2>
              <p className="max-w-md text-pretty text-sm leading-relaxed text-background/70">
                {cfg.subhead}
              </p>

              {/* Industry proof points — compact strip */}
              <div className="mt-2 grid grid-cols-3 gap-2">
                {cfg.proof.map((p) => (
                  <div
                    key={p.label}
                    className="flex flex-col gap-0.5 rounded-lg bg-background/[0.06] p-2.5 ring-1 ring-background/10"
                  >
                    <span className="text-base font-semibold tracking-tight text-background">
                      {p.metric}
                    </span>
                    <span className="text-[10px] leading-tight text-background/65">
                      {p.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Guardrail callout */}
              <div className="flex items-start gap-2.5 rounded-lg border border-background/10 bg-background/[0.04] p-3">
                <ShieldCheck
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-background/70"
                  strokeWidth={2}
                />
                <p className="text-[11px] leading-relaxed text-background/75">
                  {cfg.guardrail}
                </p>
              </div>
            </div>

            <div className="relative flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-background/65">
              {TRUST_POINTS.map(({ icon: I, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                  <I className="h-3.5 w-3.5" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* RIGHT: plan picker */}
          <div className="flex flex-col gap-5 bg-background px-6 py-7 lg:px-8 lg:py-9">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  Recommended for {cfg.label.toLowerCase()} teams
                </h3>
                <p className="text-xs text-muted-foreground">
                  Switch or cancel anytime during the trial.
                </p>
              </div>
              <BillingToggle value={cycle} onChange={setCycle} size="sm" />
            </div>

            <div className="flex flex-col gap-2">
              {visible.map((plan) => {
                const active = plan.id === selectedId;
                const isRecommended = plan.id === recommendedId;
                const { value, suffix } = formatPrice(plan, cycle);
                return (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedId(plan.id)}
                    className={cn(
                      "group flex items-center justify-between gap-4 rounded-xl border px-4 py-3 text-left transition-all",
                      active
                        ? "border-foreground bg-foreground/[0.03] shadow-[inset_0_0_0_1px_var(--foreground)]"
                        : "border-border/70 hover:border-foreground/40 hover:bg-accent/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                          active
                            ? "border-foreground bg-foreground"
                            : "border-border bg-background",
                        )}
                      >
                        {active && (
                          <Check
                            className="h-3 w-3 text-background"
                            strokeWidth={3.5}
                          />
                        )}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {plan.name}
                          </span>
                          {isRecommended && (
                            <span className="rounded-full bg-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-background">
                              Best for {cfg.label.toLowerCase()}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {plan.tagline}
                        </span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-semibold tabular-nums">
                        {value}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {suffix || "—"}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-muted/30 p-4">
                <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  What {cfg.label.toLowerCase()} teams use in {selected.name}
                </div>
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {selected.features
                    .filter((f) => f.included)
                    .slice(0, 6)
                    .map((f) => (
                      <li
                        key={f.label}
                        className="flex items-start gap-2 text-xs"
                      >
                        <Check
                          className="mt-0.5 h-3 w-3 shrink-0 text-foreground"
                          strokeWidth={3}
                        />
                        <span>{f.label}</span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            <div className="mt-auto flex flex-col gap-2">
              <button
                type="button"
                disabled={!selected}
                onClick={() => selected && onSelect?.(selected, cycle)}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-3 text-sm font-medium text-background transition-all hover:bg-foreground/90 active:scale-[0.99] disabled:opacity-40"
              >
                Start {TRIAL_DAYS}-day {cfg.label} trial
                {ctaSuffix ? ` · ${ctaSuffix}` : ""}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </button>
              <p className="text-center text-[11px] text-muted-foreground">
                No charge today. We'll remind you 3 days before the trial ends.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
