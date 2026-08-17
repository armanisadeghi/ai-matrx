"use client";

// features/masterwork/encore/EncoreHomePage.tsx
//
// Encore — the Operator's home. Every released Masterwork the viewer can
// reach, shelved by scope, each card ending in ONE primary action: Run.
// Deliberately jargon-free (THE MISMATCH RULE): an Operator is a smart novice
// — the system supplies the expertise. No "workflow", no "compile", no
// version talk. Doors: the card opens the run page; "By <expert>" opens the
// Rulebook for viewers who can read it.

import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Play, Theater } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import {
  listEncoreShelves,
  type EncoreMasterwork,
  type EncoreShelf,
} from "./service";

const SHELF_TITLES: Record<EncoreShelf["scope"], string> = {
  mine: "Yours",
  orgs: "From your organization",
  public: "Open to everyone",
};

function EncoreCard({ masterwork }: { masterwork: EncoreMasterwork }) {
  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <Link
        href={`/encore/${masterwork.id}`}
        className="font-medium text-foreground hover:underline"
      >
        {masterwork.name}
      </Link>
      {masterwork.rulebook ? (
        <Link
          href={`/masterwork/${masterwork.rulebook.id}`}
          className="mt-0.5 w-fit text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          By {masterwork.rulebook.expert}
        </Link>
      ) : null}
      {masterwork.description ? (
        <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
          {masterwork.description}
        </p>
      ) : null}
      <div className="mt-auto pt-3">
        <Button asChild size="sm" className="w-full sm:w-auto">
          <Link href={`/encore/${masterwork.id}`}>
            <Play className="mr-1 h-4 w-4" />
            Run
          </Link>
        </Button>
      </div>
    </div>
  );
}

export function EncoreHomePage() {
  const [shelves, setShelves] = useState<EncoreShelf[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listEncoreShelves()
      .then((s) => {
        if (!cancelled) setShelves(s);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load Encore.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }
  if (shelves === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (shelves.length === 0) {
    return (
      <div className="mx-auto flex h-full max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
        <Theater className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Nothing to run yet. When an expert releases a Masterwork, it appears
          here — ready to run with their judgment built in.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/masterwork">
            <BookOpen className="mr-1 h-4 w-4" />
            Build one in Masterwork Studio
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 pb-8 sm:px-6">
      <p className="text-sm text-muted-foreground">
        Each of these runs with a real expert&apos;s judgment built in — pick
        one and press Run.
      </p>
      {shelves.map((shelf) => (
        <section key={shelf.scope}>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {SHELF_TITLES[shelf.scope]}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shelf.masterworks.map((m) => (
              <EncoreCard key={m.id} masterwork={m} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
