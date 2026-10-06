"use client";

import Link from "next/link";
import {
  TrendingUp,
  CalendarRange,
  HeartPulse,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const TEASERS = [
  {
    href: "/legal/ca-wc/utilities/present-value",
    title: "Present Value",
    icon: TrendingUp,
    blurb: "Discount weekly payments to a lump-sum value.",
  },
  {
    href: "/legal/ca-wc/utilities/weeks",
    title: "Weeks Calculator",
    icon: CalendarRange,
    blurb: "Convert between dates and number of weeks.",
  },
  {
    href: "/legal/ca-wc/utilities/life-expectancy",
    title: "Life Expectancy",
    icon: HeartPulse,
    blurb: "Project life-pension exposure at 70%+ ratings.",
  },
];

export function UtilityTeasers({ className }: { className?: string }) {
  return (
    <section className={cn("mt-6 lg:mt-10", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-2 px-1">
        <h2 className="text-sm font-semibold text-foreground">
          Settlement utilities
        </h2>
        <Link
          href="/legal/ca-wc/utilities"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          See all →
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {TEASERS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                "group rounded-xl border border-border bg-card p-4",
                "transition-colors hover:border-primary/30 hover:bg-card/80",
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground flex items-center gap-1">
                    {t.title}
                    <ArrowRight className="h-3 w-3 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                    {t.blurb}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
