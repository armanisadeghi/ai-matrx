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
import { BookOpen, Clock3, Play, Theater } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { formatAbsoluteDate, formatRelativeTime } from "@/utils/datetime";
import { AuditionProof } from "./AuditionProof";
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
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <Link
            href={`/masterwork/encore/${masterwork.id}`}
            className="font-medium text-foreground hover:text-primary hover:underline hover:underline-offset-2"
          >
            {masterwork.name}
          </Link>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {masterwork.rulebook ? (
              <Link
                href={`/masterwork/${masterwork.rulebook.id}`}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                By {masterwork.rulebook.expert}
              </Link>
            ) : null}
            {masterwork.rule_count !== null ? (
              <Badge
                variant="outline"
                className="px-1.5 py-0 text-[10px] text-muted-foreground"
              >
                {masterwork.rule_count} rules
              </Badge>
            ) : null}
            <span
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
              title={`Last updated ${formatAbsoluteDate(masterwork.updated_at)}`}
            >
              <Clock3 className="h-3 w-3" />
              {formatRelativeTime(masterwork.updated_at)}
            </span>
          </div>
        </div>
        <Button asChild size="icon" className="h-8 w-8" title="Run">
          <Link
            href={`/masterwork/encore/${masterwork.id}`}
            aria-label={`Run ${masterwork.name}`}
          >
            <Play className="h-4 w-4" />
          </Link>
        </Button>
      </div>
      {masterwork.deliverable ? (
        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
          <span className="text-foreground">Creates: </span>
          {masterwork.deliverable}
        </p>
      ) : null}
      <AuditionProof score={masterwork.auditionScore} className="mt-2" />
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
      <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
        <LoadingSpinner />
        <span>Loading Encore…</span>
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
          <Link href="/masterwork/all">
            <BookOpen className="mr-1 h-4 w-4" />
            Build one in Masterwork Studio
          </Link>
        </Button>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 pb-8 sm:px-6">
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
