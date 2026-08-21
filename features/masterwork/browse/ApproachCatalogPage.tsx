"use client";

// features/masterwork/browse/ApproachCatalogPage.tsx
//
// THE CATALOG — every way to distill an Expert, on one page you can open,
// bookmark and send to someone.
//
// Arman, 2026-08-21, frustrated: "I don't see them anywhere… no placeholder
// route for them or anything like that… I wanna make sure that the UI is
// absolutely clear, that those things are established, and they say coming
// soon, so we don't lose them." Every Approach WAS registered and rendering —
// but only ever inside a funnel (step 2 of the guided start, the Rulebook's
// picker dialog, the module home's grid). A thing you can only meet by
// starting a task is a thing you cannot find. This page is the standing
// answer: one route, every Approach, honest status on each.
//
// It owns NO data and NO card: the rows come from the ONE registry reader
// (`fetchDistillationApproaches`) and every tile is the ONE `ApproachCard`.
// A new Approach appears here by existing as a row — never by editing a list.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  fetchDistillationApproaches,
  type DistillationApproach,
} from "./approaches";
import { ApproachCard } from "./ApproachCard";

/** Where a card goes: its own page, or the guided start pre-picked to it. */
function hrefFor(a: DistillationApproach): string | undefined {
  if (a.availability === "coming_soon") return undefined;
  if (a.launchHref) return a.launchHref;
  if (a.enabled) return `/masterwork/new?approach=${encodeURIComponent(a.key)}`;
  return undefined;
}

function Section({
  title,
  lede,
  approaches,
}: {
  title: string;
  lede: string;
  approaches: DistillationApproach[];
}) {
  if (approaches.length === 0) return null;
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{lede}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {approaches.map((a) => (
          <ApproachCard key={a.id} approach={a} href={hrefFor(a)} />
        ))}
      </div>
    </section>
  );
}

export function ApproachCatalogPage() {
  const [approaches, setApproaches] = useState<DistillationApproach[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchDistillationApproaches()
      .then((rows) => {
        if (alive) setApproaches(rows);
      })
      .catch((err: unknown) => {
        if (alive)
          setError(err instanceof Error ? err.message : "Could not load");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (error)
    return (
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-sm text-destructive">
          We could not load the ways to build a Rulebook: {error}
        </p>
      </div>
    );

  if (!approaches)
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );

  const ready = approaches.filter((a) => a.availability === "available");
  const partial = approaches.filter((a) => a.availability === "partial");
  const soon = approaches.filter((a) => a.availability === "coming_soon");

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 pb-12 pt-2">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">
          Every way to capture what you know
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Talking, writing, uploading, or nothing at all — each one ends the
          same way: rules in your own words that you approve, one by one. Pick
          whichever fits the ten minutes you actually have.
        </p>
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Link
            href="/masterwork/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Start a Rulebook
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/masterwork/all"
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Your Rulebooks
          </Link>
        </div>
      </header>

      <Section
        title="Ready now"
        lede="Open one and start — nothing to set up."
        approaches={ready}
      />
      <Section
        title="Partly here"
        lede="Some of this works today; the rest is being finished."
        approaches={partial}
      />
      <Section
        title="On the way"
        lede="Named, designed, and queued to build — listed here so none of them gets lost."
        approaches={soon}
      />

      {soon.length > 0 ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          Want one of these sooner? Tell us which — the order is not fixed.
        </p>
      ) : null}
    </div>
  );
}
