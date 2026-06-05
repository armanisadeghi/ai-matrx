// app/(core)/features/page.tsx
//
// Public "browse the platform" surface — a single server-rendered grid
// linking every shipped module landing. The page is identical for
// guests and authed users (it's a directory, not a workspace), so no
// `getServerAuth()` branch is needed.
//
// Adding a new module landing? Update
// `features/auth/components/module-landing/landings/directory.ts` —
// this page renders straight from that registry.

import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Compass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  MODULE_LANDING_DIRECTORY,
  MODULE_LANDING_GROUPS,
} from "@/features/auth/components/module-landing/landings/directory";

export const metadata: Metadata = {
  title: "Features — Browse the AI Matrx platform",
  description:
    "Chat, agents, files, notes, tasks, knowledge bases, code workspaces, sandboxes — every surface of the AI Matrx platform, with one click to dive in.",
  openGraph: {
    title: "AI Matrx — Every surface, in one place",
    description:
      "Browse every module of the AI Matrx platform. Free to start, no credit card.",
    type: "website",
  },
};

export default function FeaturesIndexPage() {
  return (
    <div className="min-h-dvh">
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent"
        />
        <div
          aria-hidden
          className="absolute -top-20 -right-20 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 pt-16 sm:pt-24 pb-10 sm:pb-14 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary mb-6">
            <Compass className="h-3.5 w-3.5" />
            Browse the platform
          </div>
          <h1 className="text-[clamp(2rem,1.5rem+2.5vw,3.75rem)] font-bold tracking-tight text-foreground leading-[1.1]">
            Every surface,{" "}
            <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              one click away.
            </span>
          </h1>
          <p className="mt-6 mx-auto max-w-2xl text-[clamp(1rem,0.95rem+0.25vw,1.25rem)] text-muted-foreground leading-relaxed">
            AI Matrx is a platform, not a feature. Dive into the surface that
            fits the job — chat, agents, knowledge bases, file systems, code
            workspaces, sandboxes — every one designed to feed the others.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8 gap-2"
              asChild
            >
              <Link href="/sign-up?source=features-index">
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto min-h-[44px] text-base px-8"
              asChild
            >
              <Link href="#groups">See every module</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Grouped grid */}
      <section
        id="groups"
        className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16 space-y-14"
      >
        {MODULE_LANDING_GROUPS.map((group) => {
          const entries = MODULE_LANDING_DIRECTORY.filter(
            (entry) => entry.group === group,
          );
          if (entries.length === 0) return null;
          return (
            <div key={group}>
              <h2 className="text-2xl font-semibold tracking-tight mb-6">
                {group}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {entries.map((entry) => {
                  const Icon = entry.icon;
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      className={cn(
                        "group block rounded-2xl border border-border bg-card p-6",
                        "transition-all duration-300",
                        "hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5",
                      )}
                    >
                      <div className="flex items-start gap-4 mb-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:scale-110 transition-transform duration-300">
                          <Icon className="h-5 w-5" />
                        </div>
                        <h3 className="text-base font-semibold leading-tight pt-1.5">
                          {entry.label}
                        </h3>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                        {entry.teaser}
                      </p>
                      <div className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                        Explore <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>

      {/* Final CTA */}
      <section className="border-t border-border bg-card/50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-[clamp(1.5rem,1.25rem+1.5vw,2.5rem)] font-bold tracking-tight">
            Pick a surface, start building
          </h2>
          <p className="mt-4 text-muted-foreground text-lg mb-8">
            Free to start, no credit card. Every surface above plays nicely
            with the rest the moment you sign up.
          </p>
          <Button
            size="lg"
            className="min-h-[44px] text-base px-10 gap-2"
            asChild
          >
            <Link href="/sign-up?source=features-index-cta">
              Get Started Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
