"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Eye, GitBranch, Layers, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { PricingGrid } from "./PricingGrid";
import type { CatalogPlan } from "@/features/entitlements/catalog/types";

interface PricingLandingProps {
  onSelect?: (plan: CatalogPlan) => void;
  className?: string;
}

const PILLARS = [
  {
    icon: Layers,
    title: "Three-tier memory",
    body: "Working, episodic, and semantic. Externalized so it survives any context window.",
  },
  {
    icon: GitBranch,
    title: "Stateful orchestration",
    body: "Checkpoints at every node. Human-in-the-loop hooks where it matters.",
  },
  {
    icon: ShieldCheck,
    title: "Determinism at the edges",
    body: "Tools execute deterministically. Permissions, schemas, audit trails are not negotiable.",
  },
  {
    icon: Eye,
    title: "Trajectory-level observability",
    body: "Every model call, tool, and state transition is replayable from any checkpoint.",
  },
];

const FAQS = [
  {
    q: "How is this different from LangChain or CrewAI?",
    a: "Those are toolkits — you assemble the harness. We are the harness, with observability, memory, and orchestration shipped as one production runtime.",
  },
];

export function PricingLanding({ onSelect, className }: PricingLandingProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className={cn("flex flex-col gap-20 py-12 lg:py-20", className)}>
      <PricingGrid onSelect={onSelect} />

      {/* Pillars */}
      <section className="border-t border-border/40 pt-16">
        <div className="mb-10 flex flex-col gap-3 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Every plan ships with
          </span>
          <h3 className="mx-auto max-w-2xl text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            The boring infrastructure that makes intelligence usable.
          </h3>
        </div>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border/60 bg-border/60 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex flex-col gap-3 bg-card p-6 transition-colors hover:bg-card/80"
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              <h4 className="font-semibold tracking-tight">{title}</h4>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison strip */}
      <section className="rounded-2xl border border-border/60 bg-muted/30 p-8 lg:p-10">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center">
          <div className="flex flex-col gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Build vs. buy
            </span>
            <h3 className="text-balance text-2xl font-semibold tracking-tight md:text-3xl">
              "We built our own harness" should sound like "we built our own
              database."
            </h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 rounded-xl border border-border/60 bg-background p-4">
              <span className="text-xs font-medium text-muted-foreground">
                DIY harness
              </span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                ~6 months
              </span>
              <span className="text-xs text-muted-foreground">
                LangGraph + glue + observability + RBAC + audit
              </span>
            </div>
            <div className="flex flex-col gap-1.5 rounded-xl border border-foreground bg-foreground p-4 text-background">
              <span className="text-xs font-medium text-background/70">
                AI Matrx
              </span>
              <span className="text-2xl font-semibold tracking-tight tabular-nums">
                ~2 days
              </span>
              <span className="text-xs text-background/70">
                Deploy production agents with the harness already in place
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-3xl">
        <div className="mb-8 text-center">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            FAQ
          </span>
          <h3 className="mt-3 text-balance text-2xl font-semibold tracking-tight md:text-3xl">
            Common questions, direct answers.
          </h3>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border/60 divide-y divide-border/60">
          {FAQS.map((faq, idx) => {
            const open = openFaq === idx;
            return (
              <div key={faq.q} className="bg-card">
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : idx)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-accent/30"
                >
                  <span className="font-medium tracking-tight">{faq.q}</span>
                  <span
                    className={cn(
                      "text-xs text-muted-foreground transition-transform",
                      open && "rotate-45",
                    )}
                  >
                    +
                  </span>
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-300 ease-out",
                    open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                      {faq.a}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="relative overflow-hidden rounded-3xl border border-border/60 bg-foreground px-8 py-14 text-center text-background lg:px-16 lg:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-20 [background-image:radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.5),transparent_45%),radial-gradient(circle_at_75%_75%,rgba(255,255,255,0.3),transparent_50%)]"
        />
        <div className="relative mx-auto flex max-w-2xl flex-col items-center gap-5">
          <h3 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
            The frontier labs build the engines. <br />
            We build the vehicle.
          </h3>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/sign-up"
              className="inline-flex items-center gap-2 rounded-lg bg-background px-5 py-2.5 text-sm font-medium text-foreground transition-transform hover:scale-[1.02] active:scale-[0.99]"
            >
              Start free
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-lg border border-background/30 px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-background/10"
            >
              Talk to enterprise
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
