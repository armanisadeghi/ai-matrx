"use client";

// features/education/home/blocks/StartHereBlock.tsx
//
// Day 0. A learner who has just signed in owns nothing, so there is nothing to
// rank and nothing to continue — and the honest answer is not an empty
// dashboard with six zeroed widgets. The page becomes the one thing that turns
// an empty account into a full one: bring in your material.
//
// Three doors, not twelve. A brand-new learner cannot evaluate sixteen study
// tools, and showing them all is how a first session ends in a tab close. The
// tools become discoverable the moment the learner has anything to use them on.

import Link from "next/link";
import {
  ArrowRight,
  FilePlus2,
  LibraryBig,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DOORS = [
  {
    href: "/education/library/community",
    icon: LibraryBig,
    title: "Study something that already exists",
    body: "Thousands of free public decks. Find your subject, study a copy, make it yours.",
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    href: "/education/classes/join",
    icon: Users,
    title: "Join your class",
    body: "Got a join code from a teacher? Enter it and their material is yours.",
    tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  {
    href: "/education/tutor",
    icon: Sparkles,
    title: "Just ask a question",
    body: "Stuck on one thing right now? The tutor explains it, then builds you practice.",
    tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
];

export function StartHereBlock() {
  return (
    <section className="flex flex-col gap-4">
      {/* The hero IS the ingest. Everything a learner will ever own here starts
          as a piece of their own material, so that action gets the whole width
          and every other option is visibly secondary. */}
      <Link
        href="/education/start"
        className="group relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-6 transition-colors hover:border-primary/60 sm:p-8"
      >
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <FilePlus2 className="h-7 w-7" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-foreground sm:text-xl">
              Turn anything you&apos;re studying into a study kit
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Drop in a PDF, paste your notes, record the lecture, or snap a photo
              of the page. You get flashcards, a summary, a quiz, a mind map and an
              audio version — all from your own material, in one go.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-transform group-hover:translate-x-0.5">
            Start
            <ArrowRight className="h-4 w-4" />
          </span>
        </div>
      </Link>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Or start another way
        </h3>
        <div className="grid gap-3 sm:grid-cols-3">
          {DOORS.map(({ href, icon: Icon, title, body, tile }) => (
            <Link
              key={href}
              href={href}
              className="group flex flex-col rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <span
                className={cn(
                  "mb-3 flex h-9 w-9 items-center justify-center rounded-lg",
                  tile,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-foreground">
                {title}
              </span>
              <span className="mt-1 text-xs leading-5 text-muted-foreground">
                {body}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
