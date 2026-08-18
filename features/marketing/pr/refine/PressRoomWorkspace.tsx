"use client";

/**
 * The Press Room — the Marketing pillar for press & PR.
 *
 * The premise the layout has to carry: the reason these users get no press is
 * NOT that they lack a distribution channel — it is that they do not know what
 * about themselves is newsworthy. So the page leads with the answer (a ranked
 * list of what IS newsworthy about you, with the proof each one still needs),
 * keeps the only time-critical thing permanently in view beside it, and puts
 * the pipeline and the coverage it produced underneath as the record of what
 * the first two produced.
 *
 * Modelled on: Linear's issue list (the ranked queue, the dense row, the
 * in-place expansion), Muck Rack and Prowly (the journalist-request inbox and
 * the pitch board), Prezly (the coverage log).
 *
 * House rules it follows rather than reinvents: `PageHeader` route chrome,
 * `bg-textured` body, `SectionCard`-shaped panels, `MetricCell` KPIs,
 * `LoadingSurface` / `QueryError` / `InlineQueryError` states, `EntityRef`
 * doors, `CopyButtons` on anything worth handing to an agent.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlarmClock,
  Building2,
  FileSearch,
  FlaskConical,
  Globe,
  Newspaper,
  Send,
  Trophy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import {
  InlineQueryError,
  LoadingSurface,
  MetricCell,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  useBrandSites,
  useVisibleBrandOptions,
} from "@/features/marketing/data/hooks";
import { useMinuteClock, usePressRoom } from "@/features/marketing/pr/refine/data";
import { CoverageWon } from "@/features/marketing/pr/refine/components/CoverageWon";
import { PitchPipeline } from "@/features/marketing/pr/refine/components/PitchPipeline";
import { SourceRequestRail } from "@/features/marketing/pr/refine/components/SourceRequestRail";
import {
  ANGLE_VIEWS,
  StoryAngleQueue,
} from "@/features/marketing/pr/refine/components/StoryAngleQueue";
import { deadlineState, proofProgress } from "@/features/marketing/pr/refine/scoring";
import type { StoryAngle } from "@/features/marketing/pr/refine/types";

/** URL-synced brand + site selection: shareable and reload-safe. */
function useUrlSelection() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const brandId = searchParams.get("brand") ?? "";
  const siteId = searchParams.get("site") ?? "";
  const set = useCallback(
    (next: { brand?: string; site?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.brand !== undefined) {
        if (next.brand) params.set("brand", next.brand);
        else params.delete("brand");
        params.delete("site");
      }
      if (next.site !== undefined) {
        if (next.site) params.set("site", next.site);
        else params.delete("site");
      }
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );
  return { brandId, siteId, set };
}

function Banner({
  tone,
  icon,
  title,
  children,
  action,
}: {
  tone: "info" | "sample";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-start gap-2 rounded-lg border px-3 py-2",
        tone === "sample"
          ? "border-amber-500/40 bg-amber-500/5"
          : "border-border bg-muted/40",
      )}
    >
      <span
        className={cn(
          "mt-0.5 shrink-0",
          tone === "sample"
            ? "text-amber-600 dark:text-amber-400"
            : "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-foreground">{title}</p>
        <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
          {children}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export default function PressRoomWorkspace() {
  const { brandId, siteId, set } = useUrlSelection();
  const brands = useVisibleBrandOptions();
  const sites = useBrandSites(brandId);
  const now = useMinuteClock();

  const [viewId, setViewId] = useState<string>("live");
  const [expandedAngleId, setExpandedAngleId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // Default to the first brand / first site once options load; the URL wins.
  useEffect(() => {
    if (!brandId && brands.data && brands.data.length > 0) {
      set({ brand: brands.data[0].id });
    }
  }, [brandId, brands.data, set]);
  useEffect(() => {
    if (brandId && !siteId && sites.data && sites.data.length > 0) {
      set({ site: sites.data[0].id });
    }
  }, [brandId, siteId, sites.data, set]);

  const press = usePressRoom(siteId);
  const { angles, requests, coverage } = press;

  /**
   * The door every other panel uses to reach an angle. Widening the filter is
   * done HERE, in the event handler that opened it — never in an effect
   * watching a prop.
   */
  const openAngle = useCallback((angleId: string) => {
    setViewId("all");
    setExpandedAngleId(angleId);
  }, []);

  const stats = useMemo(() => {
    const countFor = (id: string) => {
      const view = ANGLE_VIEWS.find((entry) => entry.id === id);
      return view ? angles.filter((angle) => view.matches(angle)).length : 0;
    };
    const outstandingProofs = angles.reduce(
      (sum, angle) => sum + proofProgress(angle).missing,
      0,
    );
    const closingSoon = requests.filter((request) => {
      const state = deadlineState(request.deadline_at, now);
      return state.urgency === "critical" || state.urgency === "urgent";
    }).length;
    const inFlight = angles.filter(
      (angle: StoryAngle) => angle.status === "pitched",
    ).length;
    return {
      ready: countFor("ready"),
      proof: countFor("proof"),
      you: countFor("you"),
      outstandingProofs,
      closingSoon,
      inFlight,
    };
  }, [angles, requests, now]);

  const hasNoBrands = !brands.isLoading && (brands.data?.length ?? 0) === 0;
  const selectedBrand = brands.data?.find((brand) => brand.id === brandId);
  const selectedSite = sites.data?.find((site) => site.id === siteId);

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 p-3">
        {/* ── Scope picker ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Label htmlFor="press-brand" className="text-xs text-muted-foreground">
            Business
          </Label>
          <Select
            value={brandId}
            onValueChange={(value) => set({ brand: value })}
          >
            <SelectTrigger id="press-brand" className="h-8 w-56">
              <SelectValue
                placeholder={
                  brands.isLoading ? "Loading…" : "Select a business"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(brands.data ?? []).map((brand) => (
                <SelectItem key={brand.id} value={brand.id}>
                  {brand.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Globe className="ml-2 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <Label htmlFor="press-site" className="text-xs text-muted-foreground">
            Site
          </Label>
          <Select
            value={siteId}
            onValueChange={(value) => set({ site: value })}
            disabled={!brandId}
          >
            <SelectTrigger id="press-site" className="h-8 w-56">
              <SelectValue
                placeholder={sites.isLoading ? "Loading…" : "Select a site"}
              />
            </SelectTrigger>
            <SelectContent>
              {(sites.data ?? []).map((site) => (
                <SelectItem key={site.id} value={site.id}>
                  {site.name || site.domain}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="ml-auto flex items-center gap-1.5">
            {press.isFetching ? (
              <span className="text-[11px] text-muted-foreground">
                Refreshing…
              </span>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-[11px]"
              onClick={press.refetch}
            >
              Refresh
            </Button>
            <CopyButtons
              size="sm"
              label="Press room"
              human={() => pressRoomAsText(press, selectedBrand?.name ?? null)}
              agent={() => ({
                kind: "press-room-snapshot",
                location: "AI Matrx — Marketing — Press Room",
                description:
                  "Every story angle, journalist request and piece of coverage on this business's press room.",
                data: { angles, requests, coverage },
                summary: pressRoomAsText(press, selectedBrand?.name ?? null),
                attributes: { site_id: siteId },
              })}
              json={() => ({ angles, requests, coverage })}
            />
          </div>
        </div>

        {brands.isError ? (
          <InlineQueryError
            what="your businesses"
            error={brands.error}
            onRetry={() => void brands.refetch()}
          />
        ) : null}
        {sites.isError ? (
          <InlineQueryError
            what="this business's sites"
            error={sites.error}
            onRetry={() => void sites.refetch()}
          />
        ) : null}
        {press.failed.length > 0 && !press.isError ? (
          <InlineQueryError
            what={press.failed.join(" and ")}
            error={press.error}
            onRetry={press.refetch}
          />
        ) : null}

        {/* ── States ───────────────────────────────────────────────────── */}
        {press.isError ? (
          <QueryError error={press.error} onRetry={press.refetch} />
        ) : press.isLoading || now === 0 ? (
          <div className="rounded-lg border border-border bg-card">
            <LoadingSurface
              label={
                press.stallReason === "offline"
                  ? "Waiting for a connection — your press room will load as soon as you are back online"
                  : press.stallReason === "retrying"
                    ? `The database did not answer. Retrying (attempt ${press.retryAttempt + 1})…`
                    : "Loading your press room…"
              }
            />
            {press.isStalled ? (
              <div className="border-t border-border px-3 py-2 text-center">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-[11px]"
                  onClick={press.refetch}
                >
                  Try again
                </Button>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {press.isSample ? (
              <Banner
                tone="sample"
                icon={<FlaskConical className="h-4 w-4" />}
                title={
                  siteId
                    ? "Sample press room — nothing has been analysed for this site yet"
                    : hasNoBrands
                      ? "Sample press room — you have no businesses set up yet"
                      : "Sample press room — pick a business and site above to load your own"
                }
                action={
                  hasNoBrands ? (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                    >
                      <Link href="/marketing/brands">Add a business</Link>
                    </Button>
                  ) : null
                }
              >
                Every angle, request and piece of coverage below belongs to{" "}
                <span className="font-medium text-foreground">
                  {press.sampleBrandName}
                </span>
                , a stand-in business, and is here to show what this surface
                looks like with work in it. Your own analysis writes to{" "}
                <span className="font-mono text-[10px]">seo.story_angle</span>{" "}
                and replaces all of it.
              </Banner>
            ) : null}

            {/* ── KPI strip — every tile is a door into the queue ─────── */}
            <div className="grid grid-cols-2 rounded-lg border border-border bg-card xl:grid-cols-5">
              <KpiDoor
                label="Ready to pitch"
                value={stats.ready}
                detail="Provable today"
                icon={<Send className="h-4 w-4" />}
                tone={stats.ready > 0 ? "good" : "default"}
                active={viewId === "ready"}
                onClick={() => setViewId("ready")}
              />
              <KpiDoor
                label="Needs proof"
                value={stats.proof}
                detail={`${stats.outstandingProofs} proof${stats.outstandingProofs === 1 ? "" : "s"} outstanding`}
                icon={<FileSearch className="h-4 w-4" />}
                active={viewId === "proof"}
                onClick={() => setViewId("proof")}
              />
              <KpiDoor
                label="Needs you"
                value={stats.you}
                detail="Only you can unblock these"
                icon={<Newspaper className="h-4 w-4" />}
                tone={stats.you > 0 ? "warning" : "default"}
                active={viewId === "you"}
                onClick={() => setViewId("you")}
              />
              <KpiDoor
                label="Closing in 24h"
                value={stats.closingSoon}
                detail="Journalist requests"
                icon={<AlarmClock className="h-4 w-4" />}
                tone={stats.closingSoon > 0 ? "bad" : "default"}
                active={false}
                title="Jump to the journalist requests"
                onClick={() =>
                  document
                    .getElementById("press-requests")
                    ?.scrollIntoView({ block: "start", behavior: "smooth" })
                }
              />
              {/* Spans both columns on narrow widths so five tiles never wrap
                  to an orphaned single cell. */}
              <div className="col-span-2 min-w-0 border-border xl:col-span-1">
                <MetricCell
                  label="Coverage won"
                  value={coverage.length}
                  detail={`${stats.inFlight} pitch${stats.inFlight === 1 ? "" : "es"} in flight`}
                  icon={<Trophy className="h-4 w-4" />}
                  tone={coverage.length > 0 ? "good" : "default"}
                />
              </div>
            </div>

            {/* ── The hero + the clock ────────────────────────────────── */}
            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
              <StoryAngleQueue
                angles={angles}
                requests={requests}
                viewId={viewId}
                onViewChange={setViewId}
                expandedAngleId={expandedAngleId}
                onExpandAngle={setExpandedAngleId}
                onOpenRequest={setSelectedRequestId}
              />
              <div id="press-requests" className="min-w-0 scroll-mt-4">
                <SourceRequestRail
                  requests={requests}
                  angles={angles}
                  now={now}
                  selectedId={selectedRequestId}
                  onSelect={setSelectedRequestId}
                />
              </div>
            </div>

            <PitchPipeline angles={angles} onOpenAngle={openAngle} />
            <CoverageWon
              coverage={coverage}
              angles={angles}
              onOpenAngle={openAngle}
            />

            <p className="pb-2 text-[11px] text-muted-foreground">
              {selectedSite
                ? `Press room for ${selectedSite.name || selectedSite.domain}.`
                : "No site selected."}{" "}
              Angles and requests are read straight from the shared database;
              coverage covers the last 180 days.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A KPI that filters the queue below it. It is a `MetricCell` in every visual
 * respect — same strip, same tones — wrapped in the button that makes the count
 * reachable. `MetricCell`'s own `href` door is for navigation to another route;
 * this door stays on the page, which is the correct destination for a count of
 * rows that are already here.
 */
function KpiDoor({
  label,
  value,
  detail,
  icon,
  tone = "default",
  active,
  onClick,
  title,
}: {
  label: string;
  value: number;
  detail: string;
  icon: React.ReactNode;
  tone?: "default" | "good" | "warning" | "bad";
  active: boolean;
  onClick: () => void;
  /** Overrides the default "filter the queue" wording for non-filter doors. */
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={title ?? `Show "${label}" in the story-angle queue`}
      className={cn(
        "min-w-0 border-b border-r border-border text-left transition-colors last:border-r-0 hover:bg-muted/40 xl:border-b-0",
        active && "bg-primary/5 ring-1 ring-inset ring-primary/30",
      )}
    >
      <MetricCell
        label={label}
        value={value}
        detail={detail}
        icon={icon}
        tone={tone}
      />
    </button>
  );
}

function pressRoomAsText(
  press: ReturnType<typeof usePressRoom>,
  brandName: string | null,
): string {
  const lines: string[] = [
    `PRESS ROOM${brandName ? ` — ${brandName}` : ""}${press.isSample ? " (SAMPLE DATA)" : ""}`,
    "",
    `Story angles: ${press.angles.length}`,
    `Journalist requests open: ${press.requests.length}`,
    `Coverage in the last 180 days: ${press.coverage.length}`,
    "",
    "ANGLES",
  ];
  for (const angle of press.angles) {
    const progress = proofProgress(angle);
    lines.push(
      `- [${angle.status}] ${angle.headline} (priority ${angle.priority}, ${progress.inHand}/${progress.required} proofs)`,
    );
  }
  lines.push("", "REQUESTS");
  for (const request of press.requests) {
    lines.push(
      `- ${request.outlet ?? "Unknown outlet"}: ${request.query_title} (match ${request.match_score}, deadline ${request.deadline_at ?? "none"})`,
    );
  }
  return lines.join("\n");
}
