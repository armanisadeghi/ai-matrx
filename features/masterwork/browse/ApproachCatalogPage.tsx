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
      <p className="text-sm text-muted-foreground">
        Pick how you want to start. Every one ends the same way — rules in your
        own words that you approve.
      </p>

      <Section
        title="Ready now"
        lede="Start now."
        approaches={ready}
      />
      <Section
        title="Partly here"
        lede="Partly built."
        approaches={partial}
      />
      <Section
        title="On the way"
        lede="Queued to build."
        approaches={soon}
      />

    </div>
  );
}
