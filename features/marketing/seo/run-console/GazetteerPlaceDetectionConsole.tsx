"use client";

/**
 * KI-015 — the GAZETTEER PLACE DETECTION engine's body in the run console.
 *
 * Same console, same tier prop, same Schedule tab, same cascade — a THIRD
 * engine. What differs from its two siblings is structural: topic placement
 * and situational refresh both have a per-brand notion of "owed work"
 * (a brand's own queue, a brand's own stale segments), so their bodies are
 * brand tables. This engine has no such thing — `seo.fn_backfill_keyword_places`
 * scans ONE shared keyword corpus across every site
 * (`seo.keyword_classification_queue` carries no `site_id` at all), so a
 * single pass covers every brand at once. The body is a single global
 * scoreboard and one Run now, never a brand list to tick.
 *
 * REUSES THE BENCH BUTTON'S OWN CALLS, NOT A COPY. `getPlaceDetectionStatus`
 * and `runPlaceDetectionPass` are the exact functions
 * `PlaceDetectionStrip.tsx` already presses (`../value-system/rules/data.ts`)
 * — a console with its own copy of the RPC call would drift from the button
 * an operator already uses, which is the whole class of defect this feature
 * exists to prevent. `getPlaceDetectionStatus(null, …)` reads the GLOBAL
 * ledger; the DB function requires `public.is_admin()` for that mode, the
 * same admin gate the system-tier console already sits behind.
 *
 * WHY THERE IS NO LIVE-RUN WINDOW. Zero AI spend, pure SQL, seconds not
 * minutes — nothing to narrate. Same reasoning as the situational engine.
 */

import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Check,
  Loader2,
  MapPinned,
  Play,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { cn } from "@/styles/themes/utils";
import { formatCount } from "@/features/marketing/search-console/types";
import { extractErrorMessage } from "@/utils/errors";
import {
  getPlaceDetectionStatus,
  runPlaceDetectionPass,
} from "../value-system/rules/data";
import { useSurfaceRuntimeRegistration } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import type { SurfaceScopePayload } from "@/features/surfaces/types";
import type { RunConsoleLiveState } from "./run-console-scope";
import type { PlaceDetectionRunOutcome } from "./types";

function age(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(ms / 60_000))} min ago`;
  if (hours < 48) return `${Math.round(hours)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function GazetteerPlaceDetectionConsole({
  batchKeywords,
  minImpressions,
  surfaceName,
  buildScope,
  schedulePanel,
}: {
  /** The `batch_keywords` knob — how many keywords one pass may claim. */
  batchKeywords: number;
  /** The `min_impressions` knob — the demand floor a zero-click keyword needs. */
  minImpressions: number;
  surfaceName: string;
  /**
   * The shell's half of the scope, closed over — same pattern as the
   * situational engine: this body owns the run state, the shell owns tier +
   * knobs, and a builder handed DOWN keeps that state where it lives instead
   * of lifting it into the shell just to satisfy a provider.
   */
  buildScope: (live: RunConsoleLiveState) => SurfaceScopePayload;
  schedulePanel: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<PlaceDetectionRunOutcome[]>([]);
  const [tab, setTab] = useState<"status" | "schedule">("status");

  const status = useQuery({
    queryKey: ["seo", "run-console", "place-detection", "global-status", minImpressions],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      getPlaceDetectionStatus(null, minImpressions, signal),
    staleTime: 30 * 1000,
  });

  useSurfaceRuntimeRegistration({
    surfaceName,
    getScope: () =>
      buildScope({
        selectedSiteIds: [],
        situationalStatus: undefined,
        placeDetectionStatus: status.data ?? null,
        isRunning: running,
        queueLength: running ? 1 : 0,
        outcomes,
      }),
  });

  const startRun = async () => {
    if (running || batchKeywords <= 0) return;
    setRunning(true);
    const finishedAt = new Date().toISOString();
    try {
      const pass = await runPlaceDetectionPass(batchKeywords, minImpressions);
      const outcome: PlaceDetectionRunOutcome = {
        finishedAt: new Date().toISOString(),
        claimed: pass.claimed,
        keywordsWithPlaces: pass.keywords_with_places,
        placesWritten: pass.places_written,
        localIntentStamped: pass.local_intent_stamped,
        humanProtected: pass.human_protected,
        skipped: pass.skipped,
        autonomyMode: pass.autonomy_mode,
        error: null,
      };
      setOutcomes((current) => [outcome, ...current]);
      if (pass.skipped) {
        toast.error(
          pass.skipped === "autonomy_off"
            ? "Place detection is turned off — nothing ran."
            : "Place detection is set to wait for a person, and this pass covers every site's shared keywords, so there is nobody it can ask. Nothing ran.",
        );
      } else {
        toast.success(
          pass.claimed === 0
            ? "Nothing left above the demand floor."
            : `Read ${formatCount(pass.claimed)} keywords · ${formatCount(pass.keywords_with_places)} name a place · ${formatCount(pass.local_intent_stamped)} newly flagged local.`,
        );
      }
      void queryClient.invalidateQueries({
        queryKey: ["seo", "run-console", "place-detection"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["seo", "value-rules", "place-detection"],
      });
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    } catch (error) {
      const message = extractErrorMessage(error);
      setOutcomes((current) => [
        {
          finishedAt,
          claimed: 0,
          keywordsWithPlaces: 0,
          placesWritten: 0,
          localIntentStamped: 0,
          humanProtected: 0,
          skipped: null,
          autonomyMode: null,
          error: message,
        },
        ...current,
      ]);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  const row = status.data;
  const pendingAboveFloor = row ? Math.max(row.queue_pending - row.queue_deferred, 0) : 0;

  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 lg:grid-cols-12">
      <section className="flex min-h-0 flex-col rounded-lg border border-border bg-card lg:col-span-7">
        <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border px-1">
          <button
            type="button"
            onClick={() => setTab("status")}
            className={cn(
              "h-6 rounded px-2 text-xs",
              tab === "status" ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            Corpus
          </button>
          <button
            type="button"
            onClick={() => setTab("schedule")}
            className={cn(
              "h-6 rounded px-2 text-xs",
              tab === "schedule" ? "bg-muted font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            Schedule
          </button>
        </div>

        {tab === "schedule" ? (
          <div className="flex min-h-0 flex-1 flex-col">{schedulePanel}</div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            <div className="flex items-center gap-1.5">
              <MapPinned className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-xs text-muted-foreground">
                One shared corpus, every brand at once — there is no per-brand
                queue to tick.
              </p>
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto h-7 px-1.5"
                title="Re-read the corpus scoreboard"
                onClick={() => void status.refetch()}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>

            {status.isError ? (
              <p className="rounded-md border border-destructive/50 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
                Could not read the place-detection scoreboard:{" "}
                {extractErrorMessage(status.error)}
              </p>
            ) : status.isLoading || !row ? (
              <p className="text-xs text-muted-foreground">Reading the corpus…</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Queue total", value: row.queue_total },
                  { label: "Scanned", value: row.queue_scanned },
                  { label: "Pending", value: row.queue_pending },
                  { label: "Above demand floor", value: pendingAboveFloor },
                  { label: "Name a place", value: row.keywords_with_places },
                  { label: "Explicit local", value: row.keywords_explicit_local },
                  { label: "Pending clicks", value: row.pending_clicks },
                  { label: "Pending impressions", value: row.pending_impressions },
                ].map((tile) => (
                  <div
                    key={tile.label}
                    className="rounded-md border border-border bg-muted/30 px-2 py-1.5"
                  >
                    <div className="text-[10px] text-muted-foreground">{tile.label}</div>
                    <div className="tabular-nums text-sm font-semibold text-foreground">
                      {formatCount(tile.value)}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {row ? (
              <p className="text-[11px] text-muted-foreground">
                Last scanned {age(row.last_scanned_at)}
                {row.next_phrase ? (
                  <>
                    {" "}
                    · next up:{" "}
                    <span className="text-foreground">“{row.next_phrase}”</span>
                  </>
                ) : null}
              </p>
            ) : null}

            <Button
              size="sm"
              className="mt-1 w-fit gap-1 text-xs"
              disabled={running || batchKeywords <= 0}
              onClick={() => void startRun()}
              title={
                batchKeywords <= 0
                  ? "The seo.keyword_place_detection knob batch_keywords has no row"
                  : `Read up to ${formatCount(batchKeywords)} keywords`
              }
            >
              {running ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3" />
              )}
              {running ? "Reading…" : `Run now (up to ${formatCount(batchKeywords)})`}
            </Button>
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-col overflow-y-auto rounded-lg border border-border bg-card p-2 lg:col-span-5">
        <h2 className="mb-1.5 text-xs font-semibold text-foreground">This run</h2>
        {outcomes.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Press Run now. One pass reads the highest-demand unscanned
            keywords, stamps the places and local intent it finds, and leaves
            anything a person already ruled on alone.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {outcomes.map((outcome) => (
              <li
                key={outcome.finishedAt}
                className={cn(
                  "rounded-md border px-2.5 py-1.5",
                  outcome.error
                    ? "border-destructive/50 bg-destructive/10"
                    : "border-border bg-muted/30",
                )}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {outcome.error ? (
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span className="text-xs font-medium text-foreground">
                    {new Date(outcome.finishedAt).toLocaleTimeString()}
                  </span>
                  {outcome.error ? null : outcome.skipped ? (
                    <span className="inline-flex items-center gap-1 text-[11px] text-warning">
                      <UserCheck className="h-3 w-3" />
                      {outcome.skipped === "autonomy_off"
                        ? "off — nothing ran"
                        : "waiting for a person — nothing ran"}
                    </span>
                  ) : outcome.claimed === 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      nothing left above the demand floor
                    </span>
                  ) : (
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      read {formatCount(outcome.claimed)} · named a place{" "}
                      {formatCount(outcome.keywordsWithPlaces)} · places{" "}
                      {formatCount(outcome.placesWritten)} · local{" "}
                      {formatCount(outcome.localIntentStamped)}
                      {outcome.humanProtected > 0
                        ? ` · ${formatCount(outcome.humanProtected)} left alone`
                        : ""}
                    </span>
                  )}
                </div>
                {outcome.error ? (
                  <p className="mt-0.5 text-[10px] text-destructive">{outcome.error}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

