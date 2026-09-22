"use client";

// features/marketing/seo/topical-map/views/pages/runs/ProposeIntentsRunControl.tsx
//
// "PROPOSE DESTINATIONS" — `POST /seo/sites/{site_id}/map/intents` through
// `useProposeIntentsRun`. The proposer judges a topic's pages TOGETHER — the
// whole traffic-ranked roster of siblings at once — which is why the topic
// picker below restricts a pass rather than filtering its answer.
//
// 🚨 NOTHING HERE ACTS. Every intent is written `state='proposed'`,
// `source='agent'`: no page is redirected, merged or deleted by this call. A
// person accepts them in the review deck. The consequence sentence says that in
// those words, because "propose destinations" over a live website reads like
// something that moves pages.
//
// 🚨 THE `downgraded_*` NUMBERS ARE THE PROMPT'S REPORT CARD and they are shown
// under their own heading. Each one counts a code-side correction of the agent's
// answer; hiding them hides the only signal that says whether the agent is being
// trusted or policed.

import { useState } from "react";
import { BrainCircuit, X } from "lucide-react";
import { Input } from "@ai-matrx/design-system";

import { Button } from "@/components/ui/button";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { useAppSelector } from "@/lib/redux/hooks";

import { TopicalMapFailed } from "../../../components/TopicalMapStates";
import { useMapTopicSearch } from "../../../hooks";
import type { ProposeIntentsRunResult } from "../../../map-intents";
import { selectMapPageFilters } from "../../../redux/selectors";
import { useProposeIntentsRun } from "../../../useProposeIntentsRun";
import type { PagesWorkspaceContext } from "../seams";
import { KnobChips } from "./knobChips";
import { RunControlShell } from "./RunControlShell";
import { NumberField, SwitchField, numberFieldValue } from "./runFields";
import { SiteChooser } from "./SiteChooser";

/** How many topics the picker's search offers at once. */
const TOPIC_SEARCH_LIMIT = 10;

export interface ProposeIntentsRunControlProps {
  context: PagesWorkspaceContext;
  siteId: string | null;
  onChooseSite: (siteId: string) => void;
}

export function ProposeIntentsRunControl({
  context,
  siteId,
  onChooseSite,
}: ProposeIntentsRunControlProps) {
  const { knobs, mapId, organizationId, siteIds } = context;
  const pageFilters = useAppSelector(selectMapPageFilters(mapId));

  const [limit, setLimit] = useState("");
  const [batchSize, setBatchSize] = useState("");
  const [refresh, setRefresh] = useState(true);
  const [dryRun, setDryRun] = useState(false);
  const [query, setQuery] = useState("");
  // Prefilled from the workspace's own topic filter: a person who has narrowed
  // the page list to one topic and then opens this almost always means that
  // topic. It is a starting point, not a lock — every chip can be removed.
  const [topicSlugs, setTopicSlugs] = useState<readonly string[]>(() =>
    pageFilters.topicSlug ? [pageFilters.topicSlug] : [],
  );

  const search = useMapTopicSearch(
    mapId,
    query,
    TOPIC_SEARCH_LIMIT,
    query.trim().length > 0,
  );
  const run = useProposeIntentsRun({
    siteId,
    mapId,
    organizationId: organizationId ?? null,
  });

  const limitValue = numberFieldValue(limit);
  const batchValue = numberFieldValue(batchSize);
  const parametersUsable = limitValue !== "invalid" && batchValue !== "invalid";
  const working = run.running || run.restoring;
  const spend = batchValue === "invalid" ? knobs.intent_batch_size : (batchValue ?? knobs.intent_batch_size);

  return (
    <RunControlShell
      label="Propose destinations"
      icon={<BrainCircuit className="h-3.5 w-3.5" aria-hidden />}
      state={{
        running: run.running,
        restoring: run.restoring,
        stage: run.stage,
        waitMessage: run.waitMessage,
        elapsedMs: run.elapsedMs,
        error: run.error,
        retry: run.retry,
        instanceId: `seo-command:topical-map.propose-intents.${siteId ?? "none"}`,
      }}
    >
      <div className="space-y-1">
        <p className="font-medium">Propose destinations</p>
        <p className="text-muted-foreground">
          Judges each mapped page against its siblings and proposes where it
          should go — keep, move, merge, redirect, rewrite or delete.
        </p>
      </div>

      {siteId === null ? (
        <SiteChooser siteIds={siteIds} onChoose={onChooseSite} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              id="propose-intents-limit"
              label="Pages this press"
              placeholder={knobs.intent_daily_page_ceiling}
              placeholderNote="daily ceiling knob"
              value={limit}
              onChange={setLimit}
            />
            <NumberField
              id="propose-intents-batch"
              label="Pages per model call"
              placeholder={knobs.intent_batch_size}
              placeholderNote="intent_batch_size knob"
              value={batchSize}
              onChange={setBatchSize}
            />
          </div>

          <div className="space-y-2">
            <SwitchField
              id="propose-intents-refresh"
              label="Re-measure demand first"
              note="Server default: on. Enrols newly mapped pages and re-reads Search Console before working."
              checked={refresh}
              onChange={setRefresh}
            />
            <SwitchField
              id="propose-intents-dry-run"
              label="Rehearse"
              note="Proposes nothing, still spends one model call per batch."
              checked={dryRun}
              onChange={setDryRun}
            />
          </div>

          <TopicPicker
            mapId={mapId}
            query={query}
            onQueryChange={setQuery}
            search={search}
            selected={topicSlugs}
            onAdd={(slug) =>
              setTopicSlugs((current) =>
                current.includes(slug) ? current : [...current, slug],
              )
            }
            onRemove={(slug) =>
              setTopicSlugs((current) =>
                current.filter((entry) => entry !== slug),
              )
            }
          />

          <KnobChips
            title="This organization's destination settings"
            chips={[
              {
                key: "intent_confidence_floor",
                value: String(knobs.intent_confidence_floor),
              },
              {
                key: "intent_sibling_roster_max",
                value: String(knobs.intent_sibling_roster_max),
              },
              {
                key: "intent_summary_max_words",
                value: String(knobs.intent_summary_max_words),
              },
              {
                key: "intent_consecutive_failure_stop",
                value: String(knobs.intent_consecutive_failure_stop),
              },
              {
                key: "intent_max_attempts",
                value: String(knobs.intent_max_attempts),
              },
              {
                key: "intent_stale_claim_minutes",
                value: String(knobs.intent_stale_claim_minutes),
              },
              {
                key: "intent_concurrent_batches",
                value: String(knobs.intent_concurrent_batches),
              },
            ]}
          />

          <div className="rounded-md border border-border bg-muted/40 p-2">
            <p>
              Will judge up to{" "}
              <strong>{limitValue === "invalid" || limitValue === undefined ? knobs.intent_daily_page_ceiling : limitValue}</strong>
              {limitValue === undefined ? " (the daily ceiling knob)" : ""}{" "}
              mapped pages
              {topicSlugs.length > 0
                ? ` under ${topicSlugs.length} topic(s)`
                : ""}{" "}
              and write PROPOSED intents (a person accepts them in the review
              deck). Spend: one model call per batch of <strong>{spend}</strong>;
              cost is unmeasured until the usage-ledger reader lands. Pages a
              person already decided are kept.
            </p>
          </div>

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
                  ...(topicSlugs.length > 0
                    ? { topicSlugs: [...topicSlugs] }
                    : {}),
                  dryRun,
                })
              }
            >
              {dryRun ? "Rehearse it" : "Propose destinations"}
            </Button>
          ) : (
            <p className="text-muted-foreground">
              Fix the number above and this can start.
            </p>
          )}

          {run.result ? (
            <ProposeIntentsResultSummary result={run.result} />
          ) : null}
        </>
      )}
    </RunControlShell>
  );
}

function TopicPicker({
  query,
  onQueryChange,
  search,
  selected,
  onAdd,
  onRemove,
}: {
  mapId: string;
  query: string;
  onQueryChange: (next: string) => void;
  search: ReturnType<typeof useMapTopicSearch>;
  selected: readonly string[];
  onAdd: (slug: string) => void;
  onRemove: (slug: string) => void;
}) {
  const searching = query.trim().length > 0;
  return (
    <div className="space-y-1">
      <label htmlFor="propose-intents-topics" className="block font-medium">
        Restrict to topics
      </label>
      <p className="text-muted-foreground">
        Leave this empty to work every topic of the map.
      </p>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-1">
          {selected.map((slug) => (
            <li key={slug}>
              <button
                type="button"
                onClick={() => onRemove(slug)}
                className="inline-flex items-center gap-1 rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono hover:bg-muted"
                aria-label={`Remove ${slug}`}
              >
                {slug}
                <X className="h-3 w-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Input
        id="propose-intents-topics"
        value={query}
        placeholder="Search this map's topics…"
        onChange={(event) => onQueryChange(event.target.value)}
        className="h-7 text-xs"
      />
      {!searching ? null : search.isPending ? (
        <SuspenseLoader
          size="xs"
          centered={false}
          message="Searching this map's topics…"
        />
      ) : search.isError ? (
        <TopicalMapFailed what="this map's topics" error={search.error} />
      ) : search.data.length === 0 ? (
        <p className="text-muted-foreground">
          No live topic of this map matches “{query}”.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {search.data.map((hit) => (
            <li key={hit.slug}>
              <button
                type="button"
                onClick={() => onAdd(hit.slug)}
                className="w-full truncate rounded px-1 py-0.5 text-left hover:bg-muted"
              >
                <span className="font-medium">{hit.name}</span>{" "}
                <span className="font-mono text-muted-foreground">
                  {hit.path.join(" / ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProposeIntentsResultSummary({
  result,
}: {
  result: ProposeIntentsRunResult;
}) {
  const dispositions = Object.entries(result.by_disposition);
  const corrections: [string, number][] = [
    ["confidence too low", result.downgraded_low_confidence],
    ["traffic or links said otherwise", result.downgraded_traffic_or_links],
    ["destination it named is unknown", result.downgraded_unknown_destination],
    ["it sent a page to itself", result.downgraded_self_destination],
  ];
  const appliedCorrections = corrections.filter(([, count]) => count > 0);

  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      <p className="font-medium">
        {result.dry_run ? "Rehearsal — nothing was proposed" : "Last run"}
      </p>
      <p>
        <strong>{result.proposed}</strong> destination(s) proposed across{" "}
        {result.topics_touched} topic(s).
      </p>
      {dispositions.length > 0 ? (
        <p className="text-muted-foreground">
          {dispositions
            .map(([disposition, count]) => `${disposition} ${count}`)
            .join(" · ")}
        </p>
      ) : null}
      {result.kept_existing > 0 ? (
        <p className="text-muted-foreground">
          {result.kept_existing} kept — a higher source already holds the
          page&rsquo;s destination.
        </p>
      ) : null}
      {result.held_by_human > 0 ? (
        <p className="text-muted-foreground">
          {result.held_by_human} left alone — a person already decided them.
        </p>
      ) : null}
      {appliedCorrections.length > 0 ? (
        <div>
          <p className="font-medium">Corrections applied to the agent</p>
          <ul className="text-muted-foreground">
            {appliedCorrections.map(([reason, count]) => (
              <li key={reason}>
                {count} · {reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {result.ceiling_reached ? (
        <p>
          Stopped at today&rsquo;s ceiling: {result.proposed_today} of{" "}
          {result.daily_ceiling} proposed today.
        </p>
      ) : null}
      {result.stopped_on_repeated_failure ? (
        <p role="alert" className="text-destructive">
          Gave up after {result.consecutive_failures} failures in a row. The
          queue is intact — nothing was lost, and the next press picks it up.
        </p>
      ) : null}
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
