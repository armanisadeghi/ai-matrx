"use client";

// features/masterwork/encore/EncoreRunPage.tsx
//
// The Encore run experience for ONE released Masterwork: what it does, who
// is behind it, the input box, the live streamed run, the result, and this
// Operator's own recent runs. The run machinery is the canonical
// TryMasterworkBox (typed run start + adoptForeignStream +
// followWorkflowRunStream + refresh rejoin) — never a second renderer.
//
// Operator copy only (THE MISMATCH RULE): no "workflow", no "compile", no
// version numbers. The Expert-facing doors (Rulebook, Studio) render only
// for viewers who can actually open them.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { TryMasterworkBox } from "../components/masterworks/TryMasterworkBox";
import {
  getEncoreMasterwork,
  listMyEncoreRuns,
  type EncoreMasterwork,
  type EncoreRun,
} from "./service";

function runWhen(run: EncoreRun): string {
  const ms = Date.now() - new Date(run.created_at).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 60) return `${Math.max(minutes, 1)}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const RUN_STATUS_STYLES: Record<string, string> = {
  completed: "bg-primary",
  failed: "bg-destructive",
  cancelled: "bg-muted-foreground",
};

const RUN_STATUS_LABELS: Record<string, string> = {
  completed: "Finished",
  failed: "Didn't finish",
  cancelled: "Stopped",
  running: "Working",
  pending: "Starting",
};

export function EncoreRunPage({ masterworkId }: { masterworkId: string }) {
  const userId = useAppSelector(selectUserId);
  const [masterwork, setMasterwork] = useState<EncoreMasterwork | null>(null);
  const [runs, setRuns] = useState<EncoreRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshRuns = useCallback(() => {
    listMyEncoreRuns(masterworkId)
      .then(setRuns)
      .catch(() => undefined); // History is enrichment — never blanks the page.
  }, [masterworkId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await getEncoreMasterwork(masterworkId);
        if (cancelled) return;
        setMasterwork(m);
        if (!m) setError("This isn't here, or you don't have access to it.");
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [masterworkId]);

  useEffect(() => {
    refreshRuns();
  }, [refreshRuns]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !masterwork) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">{error}</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/encore">Back to Encore</Link>
        </Button>
      </div>
    );
  }

  const ownsRulebook =
    masterwork.rulebook !== null &&
    userId !== null &&
    masterwork.rulebook.created_by === userId;

  if (masterwork.released_at === null) {
    // A draft never runs from Encore — the Expert finishes it in the Studio.
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm text-muted-foreground">
          This one isn&apos;t ready to run yet — the expert behind it hasn&apos;t
          released it.
        </p>
        {ownsRulebook && masterwork.rulebook ? (
          <Button asChild variant="outline" size="sm">
            <Link href={`/masterwork/${masterwork.rulebook.id}/masterworks`}>
              <Wrench className="mr-1 h-4 w-4" />
              Open in Studio
            </Link>
          </Button>
        ) : (
          <Button asChild variant="outline" size="sm">
            <Link href="/encore">Back to Encore</Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8 sm:px-6">
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="text-base font-semibold text-foreground">
          {masterwork.name}
        </h2>
        {masterwork.rulebook ? (
          <Link
            href={`/masterwork/${masterwork.rulebook.id}`}
            className="mt-0.5 inline-block text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            By {masterwork.rulebook.expert}
          </Link>
        ) : null}
        {masterwork.description ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {masterwork.description}
          </p>
        ) : null}
        {ownsRulebook && masterwork.rulebook ? (
          <p className="mt-2">
            <Link
              href={`/masterwork/${masterwork.rulebook.id}/masterworks`}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              <Wrench className="h-3 w-3" />
              Open in Studio
            </Link>
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <TryMasterworkBox
          masterworkId={masterwork.id}
          masterworkKind={masterwork.masterwork_kind}
          onRunFinished={refreshRuns}
        />
      </div>

      {runs.length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your recent runs
          </h3>
          <div className="mt-2">
            {runs.map((run) => (
              <a
                key={run.id}
                href={`${WORKFLOWS_APP_URL}/runs/${run.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center gap-2 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    RUN_STATUS_STYLES[run.status] ?? "bg-muted-foreground/50",
                  )}
                />
                <span>{RUN_STATUS_LABELS[run.status] ?? run.status}</span>
                <span>· {runWhen(run)}</span>
                <ExternalLink className="ml-auto h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
