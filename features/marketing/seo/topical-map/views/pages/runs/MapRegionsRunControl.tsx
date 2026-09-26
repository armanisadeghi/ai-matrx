"use client";

// features/marketing/seo/topical-map/views/pages/runs/MapRegionsRunControl.tsx
//
// "FIND THE REGIONS" — `POST /seo/sites/{site_id}/map/regions` through
// `useMapRegionsRun`. GEOGRAPHY IS A FACET, NOT A BRANCH: a location page
// belongs on the SERVICE topic it is about, carrying its place as a facet value.
//
// 🚨 THE PASS MAKES NO MODEL CALLS. A place is read out of a page's own address,
// so `dryRun` here is genuinely free — which is the whole reason the destructive
// switch below can afford to answer its own question before anyone commits.
//
// 🚨 RETIRING GEOGRAPHY BRANCHES CHANGES A LIVE COMPANY'S MAP. Turning that
// switch on does NOT arm a button: it runs THE SAME CALL with `dryRun: true`
// first and refuses to offer Start until that rehearsal has answered with the
// branches it found, how many pages each one moves, and — the number that
// actually decides this — how many of those pages would end on NO topic at all.
// A generic "Are you sure?" over this would be the destructive-click defect:
// the consequence is a count nobody can guess, so the screen goes and gets it.

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import type { MapRegionsRunResult } from "../../../map-regions";
import { useMapRegionsRun } from "../../../useMapRegionsRun";
import type { PagesWorkspaceContext } from "../seams";
import { KnobChips } from "./knobChips";
import { RunControlShell } from "./RunControlShell";
import { NumberField, SwitchField, numberFieldValue } from "./runFields";
import { SiteChooser } from "./SiteChooser";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface MapRegionsRunControlProps {
  context: PagesWorkspaceContext;
  siteId: string | null;
  onChooseSite: (siteId: string) => void;
}

/** Where the retirement rehearsal has got to. Start exists only at `answered`. */
type ProbeState = "idle" | "running" | "answered";

export function MapRegionsRunControl({
  context,
  siteId,
  onChooseSite,
}: MapRegionsRunControlProps) {
  const { knobs, mapId, organizationId, siteIds } = context;
  // Both default ON on the server. Saying so is the point: an "on" toggle a
  // person did not set must not read as a choice this screen made for them.
  const [deriveValues, setDeriveValues] = useState(true);
  const [bindPages, setBindPages] = useState(true);
  const [limit, setLimit] = useState("");
  const [dryRun, setDryRun] = useState(false);
  const [retire, setRetire] = useState(false);
  const [probeState, setProbeState] = useState<ProbeState>("idle");
  const [probeBranches, setProbeBranches] = useState<
    MapRegionsRunResult["geography_branches"]
  >(
    [],
  );
  const [selectedSlugs, setSelectedSlugs] = useState<readonly string[]>([]);

  const run = useMapRegionsRun({
    siteId,
    mapId,
    organizationId: organizationId ?? null,
  });

  const limitValue = numberFieldValue(limit);
  const parametersUsable = limitValue !== "invalid";
  const working = run.running || run.restoring;

  // The rehearsal's answer. It is the SAME durable run as everything else this
  // control launches, so it is claimed against the answer coming back rather
  // than against the request finishing — a rejoin after a reload settles this
  // exactly the same way a live stream does.
  useEffect(() => {
    if (probeState !== "running") return;
    const result = run.result;
    if (!result || !result.dry_run) return;
    setProbeBranches(result.geography_branches);
    setSelectedSlugs(result.geography_branches.map((branch) => branch.slug));
    setProbeState("answered");
  }, [probeState, run.result]);

  function onRetireChange(next: boolean): void {
    setRetire(next);
    if (!next) {
      setProbeState("idle");
      setProbeBranches([]);
      setSelectedSlugs([]);
      return;
    }
    if (!siteId) return;
    setProbeState("running");
    void run.run({
      deriveValues,
      bindPages,
      ...(limitValue === "invalid" || limitValue === undefined
        ? {}
        : { limit: limitValue }),
      retireGeographyTopics: true,
      dryRun: true,
    });
  }

  const selected = probeBranches.filter((branch) =>
    selectedSlugs.includes(branch.slug),
  );
  const movedPages = selected.reduce((total, branch) => total + branch.pages, 0);
  const strandedPages = selected.reduce(
    (total, branch) => total + branch.pages_with_no_other_topic,
    0,
  );

  return (
    <RunControlShell
      label="Find the regions"
      icon={<MapPin className="h-3.5 w-3.5" aria-hidden />}
      state={{
        running: run.running,
        restoring: run.restoring,
        stage: run.stage,
        waitMessage: run.waitMessage,
        elapsedMs: run.elapsedMs,
        error: run.error,
        retry: run.retry,
        instanceId: `seo-command:topical-map.map-regions.${siteId ?? "none"}`,
      }}
    >
      <div className="space-y-1">
        <p className="font-medium">Find the regions</p>
        <p className="text-muted-foreground">
          Works out which places this site actually serves and gives each
          location page its region — as a facet on the service topic it covers,
          never as a topic of its own.
        </p>
      </div>

      {siteId === null ? (
        <SiteChooser siteIds={siteIds} onChoose={onChooseSite} />
      ) : (
        <>
          <div className="space-y-2">
            <SwitchField
              id="map-regions-derive"
              label="Derive the region values"
              note="Server default: on. Reads the brand's places out of its own pages and addresses."
              checked={deriveValues}
              onChange={setDeriveValues}
            />
            <SwitchField
              id="map-regions-bind"
              label="Give pages their region"
              note="Server default: on. Binds each location page to its place at the lowest rank, so a region a person set is never overwritten."
              checked={bindPages}
              onChange={setBindPages}
            />
            <SwitchField
              id="map-regions-dry-run"
              label="Rehearse"
              note="Free — no model calls. Answers what would happen and writes nothing."
              checked={dryRun}
              onChange={setDryRun}
            />
          </div>

          <NumberField
            id="map-regions-limit"
            label="Pages to bind this press"
            placeholder={knobs.region_daily_page_ceiling}
            placeholderNote="region daily ceiling knob"
            value={limit}
            onChange={setLimit}
          />

          <KnobChips
            title="This organization's region settings"
            chips={[
              {
                key: "region_min_pages_per_value",
                value: String(knobs.region_min_pages_per_value),
              },
              {
                key: "region_value_evidence",
                value: String(knobs.region_value_evidence),
              },
              {
                key: "region_binding_batch_size",
                value: String(knobs.region_binding_batch_size),
              },
            ]}
          />

          <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
            <SwitchField
              id="map-regions-retire"
              label="Retire this map's geography branches"
              note="Moves every page they carry onto the service topics it already covers, then retires the branch. Turning this on first rehearses it — for free — and shows you exactly what would move."
              checked={retire}
              onChange={onRetireChange}
              tone="destructive"
            />
            {retire ? (
              <RetirementPlan
                probeState={probeState}
                branches={probeBranches}
                selectedSlugs={selectedSlugs}
                onToggle={(slug) =>
                  setSelectedSlugs((current) =>
                    current.includes(slug)
                      ? current.filter((entry) => entry !== slug)
                      : [...current, slug],
                  )
                }
                movedPages={movedPages}
                strandedPages={strandedPages}
              />
            ) : null}
          </div>

          {working ? null : !parametersUsable ? (
            <p className="text-muted-foreground">
              Fix the number above and this can start.
            </p>
          ) : retire && probeState !== "answered" ? (
            <p className="text-muted-foreground">
              The rehearsal has to answer before this can retire anything.
            </p>
          ) : retire && selected.length === 0 ? (
            <p className="text-muted-foreground">
              Tick at least one branch, or turn the retirement off, and this can
              start.
            </p>
          ) : (
            <Button
              type="button"
              size="sm"
              className="h-7 w-full text-xs"
              variant={retire && !dryRun ? "destructive" : "default"}
              onClick={() =>
                void run.run({
                  deriveValues,
                  bindPages,
                  ...(limitValue === undefined ? {} : { limit: limitValue }),
                  ...(retire
                    ? {
                        retireGeographyTopics: true,
                        geographyTopicSlugs: [...selectedSlugs],
                      }
                    : {}),
                  dryRun,
                })
              }
            >
              {dryRun
                ? "Rehearse it"
                : retire
                  ? `Retire ${selected.length} branch(es) and bind the regions`
                  : "Find the regions"}
            </Button>
          )}

          {run.result ? <MapRegionsResultSummary result={run.result} /> : null}
        </>
      )}
    </RunControlShell>
  );
}

/**
 * What the rehearsal found. Until it answers there is no Start — and the
 * screen says which of the two it is, because "nothing here yet" over a live
 * rehearsal reads as a control that does not work.
 */
function RetirementPlan({
  probeState,
  branches,
  selectedSlugs,
  onToggle,
  movedPages,
  strandedPages,
}: {
  probeState: ProbeState;
  branches: MapRegionsRunResult["geography_branches"];
  selectedSlugs: readonly string[];
  onToggle: (slug: string) => void;
  movedPages: number;
  strandedPages: number;
}) {
  if (probeState !== "answered") {
    return (
      <p className="text-muted-foreground">
        Rehearsing the retirement — it costs nothing and answers with exactly
        what would move.
      </p>
    );
  }
  if (branches.length === 0) {
    return (
      <p className="text-muted-foreground">
        The rehearsal found no place-named topics on this map. There is nothing
        to retire.
      </p>
    );
  }

  const selectedCount = branches.filter((branch) =>
    selectedSlugs.includes(branch.slug),
  ).length;

  return (
    <div className="space-y-1.5">
      <p>
        Retiring <strong>{selectedCount}</strong> branch(es) moves{" "}
        <strong>{movedPages}</strong> pages;{" "}
        <strong>{strandedPages}</strong> would end on NO topic.
      </p>
      <ul className="space-y-1">
        {branches.map((branch) => {
          const id = `map-regions-retire-${branch.slug}`;
          return (
            <li key={branch.slug} className="flex items-start gap-2">
              <Checkbox
                id={id}
                checked={selectedSlugs.includes(branch.slug)}
                onCheckedChange={() => onToggle(branch.slug)}
                className="mt-0.5 shrink-0"
              />
              <label htmlFor={id} className="min-w-0 cursor-pointer">
                <span className="font-medium">{branch.name}</span>{" "}
                <span className="font-mono text-muted-foreground">
                  {branch.slug}
                </span>
                <span className="block text-muted-foreground">
                  {branch.pages} page(s) ·{" "}
                  {branch.pages_with_no_other_topic} would end on no topic
                </span>
                {/* The server's own sentence for what it recognised. */}
                {branch.reason ? (
                  <span className="block whitespace-pre-wrap text-muted-foreground">
                    {branch.reason}
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A candidate the bar held back, as loosely as the wire actually types it.
 *
 * `MapRegionsResult.values_held_back` is `Record<string, unknown>[]` —
 * `map-regions.ts` documents what the rows MEAN ("each with the sentence saying
 * why and what would promote it") without declaring their keys, and this lane
 * cannot reach aidream to read them off `region_facet.py`. So the row is read
 * for the first reason-shaped key it carries and, when it carries none, the
 * screen SAYS the server gave no reason rather than rendering an empty line —
 * a held-back candidate is a decision, and a decision with no visible reason is
 * still better shown than dropped. Filed with the coordinator: once the keys are
 * declared this reader becomes a typed field read.
 */
function heldBackRow(raw: Record<string, unknown>): {
  label: string;
  reason: string | null;
} {
  const text = (key: string): string | null => {
    const value = raw[key];
    return typeof value === "string" && value.trim() ? value : null;
  };
  return {
    label: text("name") ?? text("slug") ?? "An unnamed candidate",
    reason: text("held_back_because") ?? text("reason") ?? text("why"),
  };
}

function MapRegionsResultSummary({ result }: { result: MapRegionsRunResult }) {
  return (
    <div className="space-y-1 rounded-md border border-border p-2">
      <p className="font-medium">
        {result.dry_run ? "Rehearsal — nothing was written" : "Last run"}
      </p>
      <p>
        <strong>{result.values_created.length}</strong> place(s) created ·{" "}
        {result.values_existing.length} already there ·{" "}
        <strong>{result.pages_bound}</strong> page(s) given their region.
      </p>
      {result.pages_left_without_topic > 0 ? (
        <p role="alert" className="text-destructive">
          {result.pages_left_without_topic} page(s) ended on no topic because the
          place-named topic they sat on is gone.
          <ErrorAlchemyMenu className="ml-auto" />
        </p>
      ) : null}
      {result.values_held_back.length > 0 ? (
        <div className="space-y-0.5">
          <p className="text-muted-foreground">
            {result.values_held_back.length} place(s) held back:
          </p>
          <ul className="space-y-0.5">
            {result.values_held_back.map((raw, index) => {
              const row = heldBackRow(raw);
              return (
                <li key={`${row.label}:${index}`}>
                  <span className="font-medium">{row.label}</span>
                  {" — "}
                  {/* Verbatim when there is one. */}
                  {row.reason ? (
                    <span className="whitespace-pre-wrap">{row.reason}</span>
                  ) : (
                    <span className="text-muted-foreground">
                      the server did not say why.
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
      {result.ceiling_reached ? (
        <p>
          Stopped at today&rsquo;s ceiling: {result.bound_today} of{" "}
          {result.daily_ceiling} bound today.
        </p>
      ) : null}
      {result.notes.map((note) => (
        <p key={note} className="whitespace-pre-wrap text-muted-foreground">
          {note}
        </p>
      ))}
      {result.error ? (
        <ErrorNotice size="inline" className="whitespace-pre-wrap" message={result.error} />
      ) : null}
    </div>
  );
}
