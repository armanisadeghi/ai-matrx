"use client";

// features/marketing/seo/topical-map/views/pages/runs/MapPagesRunControl.tsx
//
// "MAP THE PAGES" — `POST /seo/sites/{site_id}/map/pages` through
// `useMapPagesRun`. Minutes of paid agent work, so it is a durable run: it
// floats in `LiveRunWindow` on its own, survives a reload, and two presses on
// one site resolve to ONE claimed row.
//
// 🚨 THE CONSEQUENCE AND THE SPEND COME BEFORE START. The sentence above the
// button names how many pages this press will touch, how many clicks are waiting
// behind them, which page it starts on, what the model calls cost is measured in
// — and the one thing a person actually worries about: that nothing they placed
// themselves is overwritten. It is built from the SITE'S LEDGER
// (`seo.page_mapping_status`), never from a guess, so while that read is in
// flight or refused the sentence says so instead of quoting a zero.
//
// 🚨 ABSENT IS NOT ZERO. `mapped_today` and `daily_ceiling` are NOT on the status
// row — they only exist on a finished RESULT — so the "x of y mapped today" line
// appears after a run and never before it. Reading them off a status row would
// mean rendering 0/0 as fact.
//
// EVERY "KEPT" AND "DROPPED" NUMBER IS AN ANSWER. `kept_existing` means the map
// already held that placement from a person or a higher-ranked source and the
// pass correctly left it alone; it is rendered as the success it is.

import { useState } from "react";
import { BrainCircuit } from "lucide-react";

import { Button } from "@/components/ui/button";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";

import { TopicalMapFailed } from "../../../components/TopicalMapStates";
import { usePageMappingStatus } from "../../../hooks";
import type { MapPagesRunResult } from "../../../map-pages";
import { useMapPagesRun } from "../../../useMapPagesRun";
import type { PagesWorkspaceContext } from "../seams";
import { KnobChips } from "./knobChips";
import { RunControlShell } from "./RunControlShell";
import { NumberField, SwitchField, numberFieldValue } from "./runFields";
import { SiteChooser } from "./SiteChooser";
import { WantedTopicsPanel } from "./WantedTopicsPanel";

export interface MapPagesRunControlProps {
  context: PagesWorkspaceContext;
  /** `context.siteId`, or the site the person picked in this workspace. */
  siteId: string | null;
  onChooseSite: (siteId: string) => void;
}

export function MapPagesRunControl({
  context,
  siteId,
  onChooseSite,
}: MapPagesRunControlProps) {
  const { knobs, mapId, organizationId, siteIds } = context;
  const [limit, setLimit] = useState("");
  const [batchSize, setBatchSize] = useState("");
  // The server's own default for `refresh` is true — say so rather than let an
  // "on" toggle read as something this screen decided.
  const [refresh, setRefresh] = useState(true);
  const [dryRun, setDryRun] = useState(false);

  const status = usePageMappingStatus(siteId ?? "", Boolean(siteId));
  const run = useMapPagesRun({
    siteId,
    mapId,
    organizationId: organizationId ?? null,
  });

  const limitValue = numberFieldValue(limit);
  const batchValue = numberFieldValue(batchSize);
  const parametersUsable = limitValue !== "invalid" && batchValue !== "invalid";
  const working = run.running || run.restoring;

  return (
    <RunControlShell
      label="Map the pages"
      icon={<BrainCircuit className="h-3.5 w-3.5" aria-hidden />}
      state={{
        running: run.running,
        restoring: run.restoring,
        stage: run.stage,
        waitMessage: run.waitMessage,
        elapsedMs: run.elapsedMs,
        error: run.error,
        retry: run.retry,
        instanceId: `seo-command:topical-map.map-pages.${siteId ?? "none"}`,
      }}
    >
      <div className="space-y-1">
        <p className="font-medium">Map the pages</p>
        <p className="text-muted-foreground">
          Enrols this site&rsquo;s pages in demand order and asks the page mapper
          where each one sits on the map.
        </p>
      </div>

      {siteId === null ? (
        <SiteChooser siteIds={siteIds} onChoose={onChooseSite} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              id="map-pages-limit"
              label="Pages this press"
              placeholder={knobs.mapping_daily_page_ceiling}
              placeholderNote="daily ceiling knob"
              value={limit}
              onChange={setLimit}
            />
            <NumberField
              id="map-pages-batch"
              label="Pages per model call"
              placeholder={knobs.mapping_batch_size}
              placeholderNote="mapping_batch_size knob"
              value={batchSize}
              onChange={setBatchSize}
            />
          </div>

          <div className="space-y-2">
            <SwitchField
              id="map-pages-refresh"
              label="Re-measure demand first"
              note="Server default: on. Enrols newly crawled pages and re-reads Search Console before working."
              checked={refresh}
              onChange={setRefresh}
            />
            <SwitchField
              id="map-pages-dry-run"
              label="Rehearse"
              note="Writes nothing, still spends one model call per batch."
              checked={dryRun}
              onChange={setDryRun}
            />
          </div>

          <KnobChips
            title="This organization's map settings"
            chips={[
              {
                key: "mapping_confidence_floor",
                value: String(knobs.mapping_confidence_floor),
              },
              {
                key: "mapping_max_topics_per_page",
                value: String(knobs.mapping_max_topics_per_page),
              },
              {
                key: "mapping_consecutive_failure_stop",
                value: String(knobs.mapping_consecutive_failure_stop),
              },
              {
                key: "mapping_max_attempts",
                value: String(knobs.mapping_max_attempts),
              },
              {
                key: "mapping_stale_claim_minutes",
                value: String(knobs.mapping_stale_claim_minutes),
              },
              {
                key: "mapping_concurrent_batches",
                value: String(knobs.mapping_concurrent_batches),
              },
            ]}
          />

          <MapPagesConsequence
            status={status}
            limit={limitValue === "invalid" ? undefined : limitValue}
            batchSize={batchValue === "invalid" ? undefined : batchValue}
            ceilingKnob={knobs.mapping_daily_page_ceiling}
            batchKnob={knobs.mapping_batch_size}
          />

          {working ? null : parametersUsable ? (
            <Button
              type="button"
              size="sm"
              className="h-7 w-full text-xs"
              onClick={() =>
                void run.run({
                  refresh,
                  ...(limitValue === undefined ? {} : { limit: limitValue }),
                  ...(batchValue === undefined ? {} : { batchSize: batchValue }),
                  dryRun,
                })
              }
            >
              {dryRun ? "Rehearse it" : "Map the pages"}
            </Button>
          ) : (
            <p className="text-muted-foreground">
              Fix the number above and this can start.
            </p>
          )}

          {run.result ? <MapPagesResultSummary result={run.result} /> : null}

          <WantedTopicsPanel mapId={mapId} siteId={siteId} limit={knobs.wanted_topic_limit} />
        </>
      )}
    </RunControlShell>
  );
}

/**
 * What this press will do, in one sentence, from the site's own ledger.
 *
 * A pending or refused status read is SAID, never rounded down to zero: "up to
 * 0 of 0 pending pages" over a site with four thousand waiting is the sentence
 * that makes a person close the popover and do nothing.
 */
function MapPagesConsequence({
  status,
  limit,
  batchSize,
  ceilingKnob,
  batchKnob,
}: {
  status: ReturnType<typeof usePageMappingStatus>;
  limit: number | undefined;
  batchSize: number | undefined;
  ceilingKnob: number;
  batchKnob: number;
}) {
  if (status.isPending) {
    return (
      <SuspenseLoader
        size="xs"
        centered={false}
        message="Reading this site's mapping ledger…"
      />
    );
  }
  if (status.isError) {
    return (
      <TopicalMapFailed
        what="this site's mapping ledger"
        error={status.error}
      />
    );
  }

  const row = status.data;
  const spend = batchSize ?? batchKnob;
  return (
    <div className="space-y-1 rounded-md border border-border bg-muted/40 p-2">
      <p>
        Will enrol and place up to{" "}
        <strong>{limit ?? ceilingKnob}</strong>
        {limit === undefined ? " (the daily ceiling knob)" : ""} of{" "}
        <strong>{row.queue_pending}</strong> pending pages (
        {row.pending_clicks} clicks waiting
        {row.next_url ? `; next up: ${row.next_url}` : ""}). Spend: one model
        call per batch of <strong>{spend}</strong>. Nothing a person placed is
        overwritten (human &gt; agent &gt; mapper).
      </p>
      <p className="text-muted-foreground">
        {row.pages_mapped} of {row.pages} page(s) are on the map ·{" "}
        {row.queue_no_topic} could not be placed · {row.queue_failed} failed ·{" "}
        {row.wanted_topics} subject(s) wanted.
      </p>
      {/* The newest failure still standing, in the ledger's own words. */}
      {row.last_error ? (
        <p role="alert" className="whitespace-pre-wrap text-destructive">
          {row.last_error}
        </p>
      ) : null}
    </div>
  );
}

function MapPagesResultSummary({ result }: { result: MapPagesRunResult }) {
  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      <p className="font-medium">
        {result.dry_run ? "Rehearsal — nothing was written" : "Last run"}
      </p>
      <p>
        <strong>{result.mapped}</strong> page(s) placed ·{" "}
        {result.edges_written} coverage edge(s) written · {result.no_topic}{" "}
        page(s) the mapper could not place.
      </p>
      {result.kept_existing > 0 ? (
        <p className="text-muted-foreground">
          {result.kept_existing} kept — already decided by a person or a higher
          source.
        </p>
      ) : null}
      {result.dropped_geography_topic > 0 ? (
        <p>
          {result.dropped_geography_topic} placement(s) named a PLACE: this map
          still has a geography branch — run &ldquo;Find the regions&rdquo;.
        </p>
      ) : null}
      {result.ceiling_reached ? (
        <p>
          Stopped at today&rsquo;s ceiling: {result.mapped_today} of{" "}
          {result.daily_ceiling} mapped today.
        </p>
      ) : null}
      {result.stopped_on_repeated_failure ? (
        <p role="alert" className="text-destructive">
          Gave up after {result.consecutive_failures} failures in a row. The
          queue is intact — nothing was lost, and the next press picks it up.
        </p>
      ) : null}
      {/* The run's own notes, unaltered. */}
      {result.notes.map((note) => (
        <p key={note} className="whitespace-pre-wrap text-muted-foreground">
          {note}
        </p>
      ))}
      {result.error ? (
        <p role="alert" className="whitespace-pre-wrap text-destructive">
          {result.error}
        </p>
      ) : null}
    </div>
  );
}
