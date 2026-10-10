"use client";

// features/marketing/local/rank-grid/RankGridWorkspace.tsx — one location's
// Google Maps rank grid (OpenSEO Wave 3, item 7; champions Local Falcon and
// BrightLocal Local Search Grid).
//
//   1. Business — `seo_local find_business` near the location; the person picks
//      the storefront (name, address, cid). Reuse first: a free probe
//      (`max_cost_usd` at a fraction of a cent) returns a stored search; only a
//      click buys a new one, at the price the live tool definition states.
//   2. Preview — `rank_grid preview=true`: free, the grid's points on the map,
//      the storefront the tool matched, and what a run would cost.
//   3. Run — `rank_grid` with `center_confirmed` through `useToolAction`; a 5x5
//      always asks, in the approve-spend dialog. Points under 24 hours old are
//      reused free by the tool; "Reused from <date>" says when.
//   4. Result — rank bubbles coloured by rank, "not found" read against the
//      result count, and us against the three most visible competitors (the tool's
//      `competitors` summary).
//
// Reopening a past grid is NOT here: a grid is not stored as one record (each
// point is its own collection run) — deferred until a grid record or group key
// exists. Nothing on this screen pretends otherwise.

import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Grid3x3, MapPin, Search } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  Field,
  RegionSkeleton,
  SegmentedControl,
  Select,
} from "@ai-matrx/design-system/controls";
import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import { useToolAction } from "@ai-matrx/chat/action-requests/hooks/useToolAction";
import type { ToolEnvelope } from "@ai-matrx/chat/action-requests/screen-run";
import type { MapMarker } from "@/components/mardown-display/blocks/map/MapCanvas";
import { ErrorNotice } from "@ai-matrx/design-system";
import { KpiGrid, KpiTile } from "@/components/official/kpi/KpiTile";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { useBusinessLocations } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  PROBE_MAX_COST_USD,
  sectionFromOutcome,
  type SectionState,
} from "@/features/marketing/seo/domain-research/section-state";
import type { BusinessLocation } from "@/features/marketing/types";
import {
  BUBBLE_CLASS,
  bubbleFor,
  compareRows,
  gridFromOutcome,
  gridPoints,
  previewArgs,
  runArgs,
  shortDate,
  sourceLine,
  costText,
  type CompareRow,
  type GridState,
} from "./grid-model";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { readSeoLocalPrice } from "./prices";
import { RankGridMap } from "./RankGridMap";
import {
  SEO_LOCAL_TOOL,
  type BusinessCandidate,
  type ConfirmedBusiness,
  type FindBusinessData,
  type GridDevice,
  type GridRequest,
  type GridSize,
} from "./types";
import { NO_RAW_ROW_WINDOW } from "@/features/marketing/social/row-open";

const SPACINGS = ["0.5", "1", "2", "3", "5"] as const;

export function RankGridWorkspace({ brandId, locationId }: { brandId: string; locationId: string }) {
  const locations = useBusinessLocations(brandId);
  const location = (locations.data ?? []).find((l) => l.id === locationId) ?? null;

  return (
    <>
      <RecordPageHeader
        backHref={marketingRoutes.brandLocation(brandId, locationId)}
        parents={[
          { label: "Locations", href: marketingRoutes.brandLocal(brandId) },
          {
            label: location?.name ?? "Location",
            href: marketingRoutes.brandLocation(brandId, locationId),
          },
        ]}
        record={{ name: "Rank grid" }}
      />
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto" data-matrx-page-scroll>
          <div className="mx-auto flex max-w-7xl flex-col gap-3 p-3">
            {locations.isPending ? (
              <RegionSkeleton shape="form" count={3} aria-label="Loading location" />
            ) : locations.isError ? (
              <ErrorNotice
                title="Could not load the location"
                message={locations.error instanceof Error ? locations.error.message : "The read failed."}
                operation="Read business locations"
                actions={<Button onClick={() => void locations.refetch()}>Try again</Button>}
              />
            ) : !location ? (
              <EmptyState icon={<MapPin />} title="This location is not in this brand" />
            ) : (
              <RankGrid key={location.id} location={location} />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function nearOf(location: BusinessLocation): Record<string, number> | string | null {
  if (location.latitude != null && location.longitude != null) {
    return { latitude: location.latitude, longitude: location.longitude };
  }
  const text = [location.locality, location.region, location.postal_code].filter(Boolean).join(", ");
  return text || null;
}

export function RankGrid({ location }: { location: BusinessLocation }) {
  const [business, setBusiness] = useState<ConfirmedBusiness | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <BusinessStep location={location} business={business} onConfirm={setBusiness} />
      {business ? <GridStep key={`${business.cid}|${business.lat},${business.lng}`} business={business} /> : null}
    </div>
  );
}

// ── 1. the business ──────────────────────────────────────────────────────

function BusinessStep({
  location,
  business,
  onConfirm,
}: {
  location: BusinessLocation;
  business: ConfirmedBusiness | null;
  onConfirm: (b: ConfirmedBusiness | null) => void;
}) {
  const { format } = useCostDisplay();
  const find = useToolAction<ToolEnvelope<FindBusinessData>>(SEO_LOCAL_TOOL);
  const price = useQuery({
    queryKey: ["seo_local", "price", "find_business"],
    queryFn: () => readSeoLocalPrice("find_business"),
    staleTime: 10 * 60_000,
  });
  const storedNear = nearOf(location);
  const [name, setName] = useState(location.name);
  const [nearText, setNearText] = useState(typeof storedNear === "string" ? storedNear : "");
  const [state, setState] = useState<SectionState<FindBusinessData>>({ kind: "idle" });

  const near = typeof storedNear === "object" && storedNear ? storedNear : nearText.trim();
  const args = { action: "find_business", name: name.trim(), near };
  const canSearch = args.name.length > 0 && (typeof near === "object" || near.length >= 2);

  const search = async (buy: boolean) => {
    setState({ kind: "loading", buying: buy });
    const outcome = await find.run(buy ? args : { ...args, max_cost_usd: PROBE_MAX_COST_USD });
    setState(sectionFromOutcome(outcome, { probe: !buy }));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canSearch) void search(false);
  };
  const cost = costText(format, price.data?.costUsd);

  if (business) {
    return (
      <section aria-label="Business" className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card p-2">
        <MapPin className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-medium">{business.name}</span>
        <span className="min-w-0 truncate text-xs text-muted-foreground">{business.address ?? "No address"}</span>
        {business.cid ? <Badge tone="neutral" title="Google listing id">cid {business.cid}</Badge> : (
          <Badge tone="warning" title="Matched by name only">No cid</Badge>
        )}
        <Button variant="quiet" className="ml-auto" onClick={() => onConfirm(null)}>
          Change
        </Button>
      </section>
    );
  }

  return (
    <section aria-label="Business" className="flex flex-col gap-2">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2" role="search">
        <Field aria-label="Business name" value={name} onChange={(e) => setName(e.target.value)} width="lg" />
        {typeof storedNear === "object" && storedNear ? (
          <Badge tone="neutral" title="From this location's saved coordinates">
            Near {storedNear.latitude.toFixed(4)}, {storedNear.longitude.toFixed(4)}
          </Badge>
        ) : (
          <Field
            aria-label="Near"
            placeholder="City or address"
            value={nearText}
            onChange={(e) => setNearText(e.target.value)}
            width="md"
          />
        )}
        <Button type="submit" variant="primary" icon={<Search />} disabled={!canSearch || find.running}>
          Find on Google
        </Button>
      </form>
      {state.kind === "loading" ? (
        <RegionSkeleton shape="rows" count={4} aria-label={state.buying ? "Searching Google" : "Checking stored searches"} />
      ) : state.kind === "not_stored" ? (
        <EmptyState
          icon={<Search />}
          title="No stored search to reuse"
          line={state.note ?? `${cost} per search, then free for ${price.data?.reuseDays ?? "some"} days.`}
          action={
            <Button variant="primary" onClick={() => void search(true)} disabled={find.running}>
              Search · {cost}
            </Button>
          }
        />
      ) : state.kind === "error" ? (
        <ErrorNotice
          title="Could not find the business"
          message={state.message}
          operation="seo_local find_business"
          actions={<Button onClick={() => void search(false)}>Try again</Button>}
        />
      ) : state.kind === "ready" ? (
        <>
          <Badge tone={state.reused ? "neutral" : "info"} className="self-start">
            {state.reused
              ? `Reused from ${shortDate(state.observedAt)}`
              : `Bought ${shortDate(state.observedAt)}${state.chargedUsd != null ? ` · ${costText(format, state.chargedUsd)}` : ""}`}
          </Badge>
          <CandidatesTable rows={state.data.candidates} onPick={(b) => onConfirm(b)} />
        </>
      ) : null}
      {find.approvalDialog}
    </section>
  );
}

function confirmable(c: BusinessCandidate): ConfirmedBusiness | null {
  if (!c.name || c.lat == null || c.lng == null) return null;
  return { name: c.name, cid: c.cid, place_id: c.place_id, address: c.address, lat: c.lat, lng: c.lng };
}

function CandidatesTable({
  rows,
  onPick,
}: {
  rows: BusinessCandidate[];
  onPick: (b: ConfirmedBusiness) => void;
}) {
  const columns: MatrxColumnDef<BusinessCandidate>[] = [
    { accessorKey: "name", header: "Business", filter: "text" },
    { accessorKey: "address", header: "Address", filter: "text" },
    {
      accessorKey: "distance_km",
      header: "Distance",
      filter: "number",
      align: "right",
      cell: (r) => (r.distance_km == null ? "—" : `${r.distance_km} km`),
    },
    {
      accessorKey: "rating",
      header: "Rating",
      filter: "number",
      align: "right",
      cell: (r) => (r.rating == null ? "—" : `${r.rating} (${r.review_count ?? 0})`),
    },
    { accessorKey: "cid", header: "cid", filter: "text" },
    {
      id: "use",
      header: "",
      cell: (r) => {
        const picked = confirmable(r);
        return (
          <Button
            variant="outline"
            disabled={!picked}
            title={picked ? undefined : "No coordinates on this listing"}
            onClick={() => picked && onPick(picked)}
          >
            Use this
          </Button>
        );
      },
    },
  ];
  return (
    <MatrxDataTable {...NO_RAW_ROW_WINDOW}
      urlState={{ id: "rank-grid-candidates" }}
      data={rows}
      columns={columns}
      getRowId={(r) => r.cid ?? r.place_id ?? `${r.name}|${r.address}`}
      emptyState={{ icon: <Search />, title: "No Google listing matched" }}
    />
  );
}

// ── 2–4. preview, run, result ────────────────────────────────────────────

function GridStep({ business }: { business: ConfirmedBusiness }) {
  const grid = useToolAction<unknown>(SEO_LOCAL_TOOL);
  const [keyword, setKeyword] = useState("");
  const [gridSize, setGridSize] = useState<GridSize>(5);
  const [spacing, setSpacing] = useState<(typeof SPACINGS)[number]>("1");
  const [device, setDevice] = useState<GridDevice>("mobile");
  const request: GridRequest = { keyword, gridSize, spacingKm: Number(spacing), device };
  const requestKey = JSON.stringify(request);
  const [slot, setSlot] = useState<{ key: string; state: GridState }>({ key: "", state: { kind: "idle" } });
  // A change to the settings drops the preview it no longer matches.
  const state: GridState = slot.key === requestKey ? slot.state : { kind: "idle" };

  const preview = async () => {
    const key = requestKey;
    setSlot({ key, state: { kind: "loading", running: false } });
    const outcome = await grid.run(previewArgs(business, request));
    setSlot((prev) => (prev.key === key ? { key, state: gridFromOutcome(outcome) } : prev));
  };
  const run = async (centerConfirmed: string) => {
    const key = requestKey;
    setSlot({ key, state: { kind: "loading", running: true } });
    const outcome = await grid.run(runArgs(business, request, centerConfirmed));
    setSlot((prev) => (prev.key === key ? { key, state: gridFromOutcome(outcome) } : prev));
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (keyword.trim()) void preview();
  };

  return (
    <section aria-label="Rank grid" className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <Field
          aria-label="Keyword"
          placeholder="Keyword, e.g. orthodontist"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          width="lg"
        />
        <SegmentedControl
          aria-label="Grid size"
          value={String(gridSize) as "3" | "5"}
          onValueChange={(v) => setGridSize(Number(v) as GridSize)}
          data={[
            { value: "3", label: "3×3" },
            { value: "5", label: "5×5" },
          ]}
        />
        <Select
          aria-label="Spacing"
          value={spacing}
          options={SPACINGS.map((s) => ({ value: s, label: `${s} km apart` }))}
          onValueChange={setSpacing}
        />
        <SegmentedControl
          aria-label="Device"
          value={device}
          onValueChange={setDevice}
          data={[
            { value: "mobile", label: "Mobile" },
            { value: "desktop", label: "Desktop" },
          ]}
        />
        <Button type="submit" variant="primary" icon={<Grid3x3 />} disabled={!keyword.trim() || grid.running}>
          Preview · free
        </Button>
      </form>

      <GridBody state={state} business={business} running={grid.running} onRun={run} onPreview={preview} />
      {grid.approvalDialog}
    </section>
  );
}

function GridBody({
  state,
  business,
  running,
  onRun,
  onPreview,
}: {
  state: GridState;
  business: ConfirmedBusiness;
  running: boolean;
  onRun: (centerConfirmed: string) => void;
  onPreview: () => void;
}) {
  switch (state.kind) {
    case "idle":
      return (
        <EmptyState
          icon={<Grid3x3 />}
          title="Preview a grid"
          line="See the points and the matched storefront before any spend."
        />
      );
    case "loading":
      return <RegionSkeleton shape="cards" count={1} aria-label={state.running ? "Running the grid" : "Building the preview"} />;
    case "stopped":
      return (
        <EmptyState
          icon={<Grid3x3 />}
          title="The grid did not run"
          line={state.note}
          action={<Button onClick={onPreview}>Preview again</Button>}
        />
      );
    case "error":
      return (
        <ErrorNotice
          title="The grid did not run"
          message={state.message}
          operation="seo_local rank_grid"
          actions={<Button onClick={onPreview}>Preview again</Button>}
        />
      );
    case "preview":
      return <PreviewView data={state.data} notices={state.notices} business={business} running={running} onRun={onRun} />;
    case "result":
      return <ResultView envelope={state.envelope} business={business} />;
  }
}

function PreviewView({
  data,
  notices,
  business,
  running,
  onRun,
}: {
  data: Extract<GridState, { kind: "preview" }>["data"];
  notices: string[];
  business: ConfirmedBusiness;
  running: boolean;
  onRun: (centerConfirmed: string) => void;
}) {
  const { format } = useCostDisplay();
  const matched = data.matched_business;
  const free = data.estimate_usd === 0;
  const total = data.points.length;
  const markers: MapMarker[] = [
    ...data.points.map((p) => ({
      lat: p.lat,
      lng: p.lng,
      label: `Point ${p.row + 1}, ${p.col + 1}`,
      bubble: { text: "·", className: BUBBLE_CLASS.preview },
    })),
    { lat: business.lat, lng: business.lng, label: business.name, description: business.address ?? undefined },
  ];
  // A notice that is not the standard "preview only" line is something to see
  // (a center that no longer matches, no stored listing to check against).
  const extra = notices.filter((n) => !n.startsWith("Preview only"));
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {matched ? (
          <Badge tone="success" title={matched.address ?? undefined}>
            Matched {matched.name ?? "listing"}
            {data.center_to_listing_km != null ? ` · ${data.center_to_listing_km} km from center` : ""}
          </Badge>
        ) : (
          <Badge tone="warning" title="No stored listing to check the center against">
            Storefront not checked
          </Badge>
        )}
        <Badge tone="neutral">
          {data.grid_size}×{data.grid_size} · {data.spacing_km} km · zoom {data.zoom}
        </Badge>
        {data.reused_points > 0 ? (
          <Badge tone="neutral">{data.reused_points} of {total} points stored</Badge>
        ) : null}
        <Button
          variant="primary"
          className="ml-auto"
          disabled={running}
          onClick={() => onRun(data.center_confirmed_value)}
        >
          {free ? "Open stored grid · free" : `Run grid · ${costText(format, data.estimate_usd)}`}
        </Button>
      </div>
      {extra.map((n) => (
        <ErrorNotice key={n} size="inline" message={n} operation="seo_local rank_grid preview" />
      ))}
      <RankGridMap markers={markers} showLegend={false} />
    </div>
  );
}

function ResultView({
  envelope,
  business,
}: {
  envelope: Extract<GridState, { kind: "result" }>["envelope"];
  business: ConfirmedBusiness;
}) {
  const { format } = useCostDisplay();
  const data = envelope.data;
  const s = data.summary;
  const source = sourceLine(envelope, format);
  const markers: MapMarker[] = gridPoints(data).map((p) => {
    const b = bubbleFor(p, data.depth);
    return {
      lat: p.lat,
      lng: p.lng,
      label: b.label,
      description: p.top_result?.name ? `#1 here: ${p.top_result.name}` : undefined,
      bubble: { text: b.text, className: BUBBLE_CLASS[b.tone] },
    };
  });
  const rows = compareRows(data, { name: business.name, cid: business.cid });
  const problems = envelope.status === "ok" ? [] : (envelope.notices ?? []).filter((n) => !n.startsWith("Grid legend"));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={source.reused ? "neutral" : "info"}>{source.text}</Badge>
        <Badge tone="neutral">
          “{data.keyword}” · {data.grid_size}×{data.grid_size} · {data.spacing_km} km · {data.device}
        </Badge>
      </div>
      {problems.slice(0, 2).map((n) => (
        <ErrorNotice key={n} size="inline" message={n} operation="seo_local rank_grid" />
      ))}
      <KpiGrid>
        <KpiTile
          label="Average rank"
          value={s.avg_rank}
          title="Average Maps rank over the points where the business was found."
        />
        <KpiTile label="Top 3" value={`${s.top3} / ${s.points_searched}`} title="Points where it ranks 1 to 3." />
        <KpiTile label="Top 10" value={`${s.top10} / ${s.points_searched}`} title="Points where it ranks 1 to 10." />
        <KpiTile
          label="Found"
          value={`${s.points_found} / ${s.points_searched}`}
          title={`Points where it appears in the top ${data.depth} at all.`}
          tone={s.points_found === 0 ? "bad" : "neutral"}
        />
      </KpiGrid>
      <RankGridMap markers={markers} showLegend />
      <CompareTable rows={rows} />
    </div>
  );
}

function coverage(r: CompareRow): string {
  if (!r.searched) return "—";
  return `${Math.round((r.found / r.searched) * 100)}% · ${r.found} / ${r.searched}`;
}

function CompareTable({ rows }: { rows: CompareRow[] }) {
  const columns: MatrxColumnDef<CompareRow>[] = [
    {
      accessorKey: "name",
      header: "Business",
      filter: "text",
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          {r.name}
          {r.isUs ? <Badge tone="primary">You</Badge> : null}
        </span>
      ),
    },
    { accessorKey: "wins", header: "#1 at", filter: "number", align: "right", cell: (r) => `${r.wins} / ${r.searched}` },
    {
      accessorKey: "avgRank",
      header: "Average rank",
      filter: "number",
      align: "right",
      cell: (r) => (r.avgRank == null ? "—" : r.avgRank),
    },
    {
      accessorKey: "found",
      header: "Coverage",
      filter: "number",
      align: "right",
      cell: coverage,
    },
  ];
  return (
    <MatrxDataTable {...NO_RAW_ROW_WINDOW}
      urlState={{ id: "rank-grid-compare" }}
      data={rows}
      columns={columns}
      getRowId={(r) => r.key}
      emptyState={{ title: "No listings ranked on this grid" }}
    />
  );
}
