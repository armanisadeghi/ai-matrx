"use client";

/**
 * PreviewPane — the right half: the run page itself, not a picture of it.
 *
 * `RunSurfaceView` is the same component the product mounts for a live run,
 * fed from the same Redux slice by the same selectors, rendering the same kind
 * components. Two ways to feed it, both real:
 *
 *   • a past run of this workflow — genuine data, adopted through the normal
 *     adapter (replay, then live if it is still going);
 *   • the sample run — the platform's own events folded by the platform's own
 *     reducer, with a scrubber so the author can stand at any moment of the
 *     job rather than only at its end.
 *
 * There is no third mode, because a drawing of a run page is exactly what this
 * rebuild exists to delete.
 */

import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { RunSurfaceView } from "../components/RunSurfaceView";
import type { RunSurfaceConfig } from "../surface/config";
import { listRecentRuns, type RecentRunSummary } from "../surface/service";
import type { WorkflowDefinitionLike } from "../trigger-points";
import { momentFromTrigger } from "./vocabulary";
import type { ScreenId } from "./layout-model";
import { momentAfterStep, sampleMoments } from "./sample-run";
import { useSamplePreviewRun } from "./useSamplePreviewRun";
import { FieldLabel, Segmented, SelectField } from "./parts";

type PreviewSource = "sample" | "real";

/** Where the scrubber has to stand for a given screen to be the live one. */
function momentForScreen(
  config: RunSurfaceConfig,
  definition: WorkflowDefinitionLike,
  screenId: ScreenId,
  lastMoment: number,
): number | null {
  const page = config.pages.find((p) => p.id === screenId);
  if (!page) return null;
  const moment = momentFromTrigger(page.activateOn);
  switch (moment.kind) {
    case "always":
      return 1;
    case "stepStarts":
      return Math.max(1, momentAfterStep(definition, moment.nodeId) - 1);
    case "stepFinishes":
      return momentAfterStep(definition, moment.nodeId);
    case "deliverable":
    case "runFinishes":
      return lastMoment;
    case "custom":
      return null;
  }
}

function runOptionLabel(run: RecentRunSummary): string {
  const when = new Date(run.createdAt).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${when} · ${run.status}`;
}

export function PreviewPane({
  definitionId,
  definition,
  config,
  screenId,
}: {
  definitionId: string;
  definition: WorkflowDefinitionLike;
  config: RunSurfaceConfig;
  screenId: ScreenId;
}) {
  const moments = sampleMoments(definition);
  const lastMoment = moments.length - 1;

  const [runs, setRuns] = useState<RecentRunSummary[] | null>(null);
  const [source, setSource] = useState<PreviewSource>("sample");
  const [realRunId, setRealRunId] = useState<string>("");
  const [moment, setMoment] = useState(() => Math.min(2, lastMoment));

  useEffect(() => {
    let cancelled = false;
    void listRecentRuns(definitionId)
      .then((rows) => {
        if (cancelled) return;
        setRuns(rows);
        // Ruling: bind to real data when it exists. The sample is the
        // fallback AND the time machine — one click away either way.
        if (rows.length > 0) {
          setRealRunId(rows[0].id);
          setSource("real");
        }
      })
      .catch(() => {
        if (!cancelled) setRuns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [definitionId]);

  // Selecting a screen on the left walks the sample run to the moment that
  // screen takes over, so the preview always shows what is being edited.
  useEffect(() => {
    if (source !== "sample") return;
    const target = momentForScreen(config, definition, screenId, lastMoment);
    if (target === null) return;
    const frame = window.requestAnimationFrame(() => {
      setMoment(Math.min(target, lastMoment));
    });
    return () => window.cancelAnimationFrame(frame);
    // Only when the chosen screen changes — never fighting a manual scrub.
  }, [screenId, source]);

  const sampleRunId = useSamplePreviewRun(definition, moment, source === "sample");
  const previewRunId = source === "real" ? realRunId : sampleRunId;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-background">
      <div className="shrink-0 space-y-2 border-b border-border bg-card px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Exactly what they will see
          </span>
          <div className="ml-auto w-56">
            <Segmented<PreviewSource>
              ariaLabel="Where the preview gets its data"
              value={source}
              options={[
                { value: "sample", label: "Sample run" },
                { value: "real", label: "A real run" },
              ]}
              onChange={setSource}
            />
          </div>
        </div>

        {source === "real" ? (
          runs === null ? (
            <p className="text-xs text-muted-foreground">Looking for past runs…</p>
          ) : runs.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              This workflow has never run, so there is no real data to show yet.
              Switch back to the sample run.
            </p>
          ) : (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <SelectField
                  ariaLabel="Which past run"
                  value={realRunId}
                  options={runs.map((run) => ({
                    value: run.id,
                    label: runOptionLabel(run),
                  }))}
                  onChange={setRealRunId}
                />
              </div>
              {realRunId ? (
                <a
                  href={`/workflows/runs/${realRunId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-border px-2 text-xs font-medium text-foreground hover:border-primary/40"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open
                </a>
              ) : null}
            </div>
          )
        ) : (
          <div className="space-y-1">
            <div className="flex items-baseline gap-2">
              <FieldLabel>Wind the run to</FieldLabel>
              <span className="text-xs font-medium text-foreground">
                {moments[Math.min(moment, lastMoment)]?.label}
              </span>
            </div>
            <Slider
              value={[Math.min(moment, lastMoment)]}
              min={0}
              max={lastMoment}
              step={1}
              onValueChange={([next]) => setMoment(next)}
              aria-label="Wind the run to a moment"
            />
          </div>
        )}
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto bg-textured p-3")}>
        {previewRunId ? (
          <RunSurfaceView
            key={`${source}:${previewRunId}`}
            runId={previewRunId}
            definition={definition}
            config={config}
            adopt={source === "real"}
          />
        ) : (
          <div className="h-full rounded-lg border border-dashed border-border" />
        )}
      </div>
    </div>
  );
}
