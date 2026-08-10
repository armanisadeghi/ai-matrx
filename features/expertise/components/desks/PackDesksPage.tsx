"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Play, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { getPack, listDesksForPack } from "../../service";
import type { ExpertisePack, PackDesk } from "../../types";

/**
 * Desks compiled from this pack: each is a working AI checker (a workflow)
 * stamped with the pack version it was compiled from. A desk behind the
 * pack's current version gets a drift flag — recompile to adopt the new rules.
 */
export function PackDesksPage({ packId }: { packId: string }) {
  const [pack, setPack] = useState<ExpertisePack | null>(null);
  const [desks, setDesks] = useState<PackDesk[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, d] = await Promise.all([
          getPack(packId),
          listDesksForPack(packId),
        ]);
        if (cancelled) return;
        setPack(p);
        setDesks(d);
        if (!p) setError("This pack doesn't exist, or you don't have access.");
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load desks");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [packId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !pack) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/expertise">Back to Expertise</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 pb-8 sm:px-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">
          Desks built from “{pack.name}”
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          A desk is a working AI checker compiled from this pack&apos;s rules —
          cheap auditors check every rule, and the expert persona gives one
          final ruling. The pack is currently at version {pack.version}.
        </p>
      </div>

      {desks.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <Workflow className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            No desks yet. Compile one from the pack page — one button, a few
            minutes, and this pack becomes a working checker.
          </p>
          <Button asChild size="sm" variant="outline" className="mt-3">
            <Link href={`/expertise/${pack.id}`}>Open the pack</Link>
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {desks.map((desk) => {
            const drifted =
              desk.pack_version !== null && desk.pack_version < pack.version;
            return (
              <div
                key={desk.id}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">
                        {desk.name}
                      </span>
                      {desk.desk_kind ? (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {desk.desk_kind === "edit"
                            ? "Checks & corrects"
                            : desk.desk_kind === "generate"
                              ? "Creates & checks"
                              : desk.desk_kind}
                        </Badge>
                      ) : null}
                      {desk.pack_version !== null ? (
                        <Badge
                          variant="outline"
                          className="px-1.5 py-0 text-[10px]"
                        >
                          built from v{desk.pack_version}
                        </Badge>
                      ) : null}
                    </div>
                    {desk.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                        {desk.description}
                      </p>
                    ) : null}
                    {drifted ? (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-primary">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        The pack has newer rules (v{pack.version}) than this
                        desk was built from — recompile the desk to adopt them.
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button asChild size="sm">
                      <a
                        href={`${WORKFLOWS_APP_URL}/workflows/${desk.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Play className="mr-1 h-4 w-4" />
                        Run
                      </a>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`${WORKFLOWS_APP_URL}/runs?workflow=${desk.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-1 h-4 w-4" />
                        Past runs
                      </a>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
