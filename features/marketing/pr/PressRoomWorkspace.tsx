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
 * `bg-textured` body, `MetricCell` KPIs, `LoadingSurface` / `QueryError` /
 * `InlineQueryError` states, `EntityRef` doors, `CopyButtons` on anything worth
 * handing to an agent, `useBrandSites` / `useVisibleBrandOptions` for scope.
 *
 * Scope first: the first persona is an agency operator running press for
 * several client businesses, so a hub that cannot say WHICH business cannot
 * serve them. Brand and site live in the URL beside the open row and the forced
 * load state, so every screen here is shareable and reload-safe.
 */

import { useCallback, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  AlarmClock,
  Building2,
  FileSearch,
  FlaskConical,
  Globe,
  Newspaper,
  Send,
  TriangleAlert,
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
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  applyAngleRulings,
  applyRequestRulings,
  useMinuteClock,
  usePressRoom,
  usePressRoomRulings,
  type PressRoomData,
} from "@/features/marketing/pr/data";
import {
  SCENARIO_COPY,
  usePressRoomUrl,
  type PressRoomScenario,
} from "@/features/marketing/pr/routes";
import { CoverageWon } from "@/features/marketing/pr/components/CoverageWon";
import { PitchPipeline } from "@/features/marketing/pr/components/PitchPipeline";
import { SourceRequestRail } from "@/features/marketing/pr/components/SourceRequestRail";
import {
  ANGLE_VIEWS,
  StoryAngleQueue,
} from "@/features/marketing/pr/components/StoryAngleQueue";
import { readLadder } from "@/features/marketing/pr/ladder";
import { deadlineState } from "@/features/marketing/pr/scoring";
import { isAnswerable, type StoryAngle } from "@/features/marketing/pr/types";

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
  const {
    brandId,
    siteId,
    viewId,
    sort,
    sortIsDefault,
    focus,
    scenario,
    set,
    href,
  } = usePressRoomUrl();
  const brands = useVisibleBrandOptions();
  const sites = useBrandSites(brandId);
  const now = useMinuteClock();
  const rulings = usePressRoomRulings();

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

  const press = usePressRoom(siteId, scenario);

  // Rulings are applied OVER the loaded rows so the queue, the funnel, the KPI
  // strip and the readiness numbers all move together the moment one is made.
  const angles = useMemo(
    () => applyAngleRulings(press.angles, rulings.rulings),
    [press.angles, rulings.rulings],
  );
  const requests = useMemo(
    () => applyRequestRulings(press.requests, rulings.rulings),
    [press.requests, rulings.rulings],
  );
  const coverage = press.coverage;

  const expandedAngleId = focus?.kind === "angle" ? focus.id : null;
  const selectedRequestId = focus?.kind === "request" ? focus.id : null;
  const focusedCoverageId = focus?.kind === "coverage" ? focus.id : null;

  // A deep link to a request or a piece of coverage has to LAND somewhere the
  // user can see, not just set a highlight below the fold.
  useEffect(() => {
    if (!focus || focus.kind === "angle") return;
    const anchor =
      focus.kind === "request"
        ? document.getElementById("press-requests")
        : document.querySelector(`[data-coverage-id="${focus.id}"]`);
    anchor?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focus]);

  /**
   * The door every other panel uses to reach an angle. Widening the filter is
   * done HERE, in the event handler that opened it — never in an effect
   * watching a prop — and both halves land in ONE URL patch so the back button
   * gets one entry, not two.
   */
  const openAngle = useCallback(
    (angleId: string) => {
      set({ view: "all", focus: { kind: "angle", id: angleId } });
    },
    [set],
  );

  const stats = useMemo(() => {
    const countFor = (id: string) => {
      const view = ANGLE_VIEWS.find((entry) => entry.id === id);
      return view ? angles.filter((angle) => view.matches(angle)).length : 0;
    };
    const outstandingProofs = angles.reduce((sum, angle) => {
      const read = readLadder(angle);
      return sum + (read.total - read.held);
    }, 0);
    const closingSoon = requests.filter((request) => {
      if (!isAnswerable(request)) return false;
      const state = deadlineState(request.deadline_at, now);
      return state.urgency === "critical" || state.urgency === "urgent";
    }).length;
    const inFlight = angles.filter(
      (angle: StoryAngle) => angle.status === "pitched",
    ).length;
    return {
      ready: countFor("ready"),
      proof: countFor("proof"),
      quick: countFor("quick"),
      you: countFor("you"),
      outstandingProofs,
      closingSoon,
      inFlight,
    };
  }, [angles, requests, now]);

  const hasNoBrands = !brands.isLoading && (brands.data?.length ?? 0) === 0;
  const selectedBrand = brands.data?.find((brand) => brand.id === brandId);
  const selectedSite = sites.data?.find((site) => site.id === siteId);

  const snapshot = useMemo(
    () => ({ ...press, angles, requests, coverage }),
    [press, angles, requests, coverage],
  );

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-3 p-3">
        {/* ── Scope picker ─────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Building2
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <Label htmlFor="press-brand" className="text-xs text-muted-foreground">
            Business
          </Label>
          <Select value={brandId} onValueChange={(value) => set({ brand: value })}>
            <SelectTrigger id="press-brand" className="h-8 w-56">
              <SelectValue
                placeholder={brands.isLoading ? "Loading…" : "Select a business"}
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

          <Globe
            className="ml-2 size-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
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
              human={() => pressRoomAsText(snapshot, selectedBrand?.name ?? null)}
              // The human payload already prefixes "(SAMPLE DATA)". The agent
              // and json payloads did not, so a downstream agent received ten
              // fictional angles stamped with the user's REAL site_id and no way
              // to tell. Both now carry the flag, and the sample payload does not
              // claim a site it is not about.
              agent={() => ({
                kind: "press-room-snapshot",
                location: "AI Matrx — Marketing — Press Room",
                description: snapshot.isSample
                  ? "SAMPLE DATA — an illustrative press room. This business has no analysed angles yet; nothing here describes it."
                  : "Every story angle, journalist request and piece of coverage on this business's press room.",
                data: { angles, requests, coverage },
                summary: pressRoomAsText(snapshot, selectedBrand?.name ?? null),
                attributes: {
                  site_id: snapshot.isSample ? null : siteId,
                  is_sample: snapshot.isSample,
                },
              })}
              json={() => ({
                is_sample: snapshot.isSample,
                site_id: snapshot.isSample ? null : siteId,
                angles,
                requests,
                coverage,
              })}
            />
          </div>
        </div>

        {/* ── Status bar: the honest line about anything held in memory ── */}
        {rulings.count > 0 ? (
          (() => {
            const failed = Object.keys(rulings.failures ?? {}).length;
            const tone = failed
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
            return (
          <div className={`flex min-w-0 flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-[11px] ${tone}`}>
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              {failed ? (
                <>
                  {failed} ruling{failed === 1 ? "" : "s"} could not be saved.
                  The page still shows your decision, but the row was not
                  written — retry, or check you still have edit access to this
                  site.
                </>
              ) : (
                <>
                  {rulings.count} ruling{rulings.count === 1 ? "" : "s"} applied
                  and saved. Accepting, pitching and dismissing write straight to{" "}
                  <span className="font-mono text-[10px]">seo.story_angle</span>;
                  &ldquo;I have this&rdquo; recomputes the page for this session
                  and is not stored yet.
                </>
              )}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-6 shrink-0 text-[10px]"
              onClick={rulings.discard}
            >
              Discard them
            </Button>
          </div>
        );
          })()
        ) : null}

        {/* ── Forced load state, on the real route ─────────────────────── */}
        {press.forcedScenario ? (
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
            <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="min-w-0">
              <span className="font-semibold text-foreground">
                {SCENARIO_COPY[press.forcedScenario].label}
              </span>{" "}
              — {SCENARIO_COPY[press.forcedScenario].blurb} Nothing was read from
              the database.
            </span>
            <Button asChild size="sm" variant="outline" className="ml-auto h-6 text-[10px]">
              <Link href={href({ scenario: "live" })}>Back to live data</Link>
            </Button>
          </div>
        ) : null}

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
                  press.forcedScenario === "ready"
                    ? "Sample press room — forced by ?data=ready"
                    : siteId
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
                      <Link href={marketingRoutes.brands()}>Add a business</Link>
                    </Button>
                  ) : null
                }
              >
                Every angle, request and piece of coverage below belongs to{" "}
                <span className="font-medium text-foreground">
                  {press.sampleBrandName}
                </span>
                , a stand-in business, and is here to show what this surface
                looks like with work in it. Most of its angles are still
                gathering proof, which is what a healthy account looks like. Your
                own analysis writes to{" "}
                <span className="font-mono text-[10px]">seo.story_angle</span>{" "}
                and replaces all of it.
              </Banner>
            ) : null}

            {/* ── KPI strip — every tile is a door into the queue ─────── */}
            <div className="grid grid-cols-2 rounded-lg border border-border bg-card xl:grid-cols-5">
              <KpiDoor
                label="Ready to pitch"
                value={stats.ready}
                detail="Nothing outstanding"
                icon={<Send className="h-4 w-4" />}
                tone={stats.ready > 0 ? "good" : "default"}
                active={viewId === "ready"}
                onClick={() => set({ view: "ready" })}
              />
              <KpiDoor
                label="Building proof"
                value={stats.proof}
                detail={`${stats.outstandingProofs} proof${stats.outstandingProofs === 1 ? "" : "s"} to gather`}
                icon={<FileSearch className="h-4 w-4" />}
                active={viewId === "proof"}
                onClick={() => set({ view: "proof" })}
              />
              <KpiDoor
                label="One thing away"
                value={stats.quick}
                detail="A single gap from pitchable"
                icon={<Trophy className="h-4 w-4" />}
                tone={stats.quick > 0 ? "good" : "default"}
                active={viewId === "quick"}
                onClick={() => set({ view: "quick" })}
              />
              <KpiDoor
                label="Needs you"
                value={stats.you}
                detail="Only you can unblock these"
                icon={<Newspaper className="h-4 w-4" />}
                tone={stats.you > 0 ? "warning" : "default"}
                active={viewId === "you"}
                onClick={() => set({ view: "you" })}
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
            </div>

            {/* ── The hero + the clock ────────────────────────────────── */}
            <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
              <StoryAngleQueue
                angles={angles}
                requests={requests}
                viewId={viewId}
                onViewChange={(next) => set({ view: next })}
                sort={sort}
                sortIsDefault={sortIsDefault}
                onSortChange={(next) => set({ sort: next })}
                now={now}
                expandedAngleId={expandedAngleId}
                onExpandAngle={(angleId) =>
                  set({ focus: angleId ? { kind: "angle", id: angleId } : null })
                }
                onOpenRequest={(requestId) =>
                  set({ focus: { kind: "request", id: requestId } })
                }
                onRuleAngle={rulings.ruleAngle}
                onHoldEvidence={rulings.holdEvidence}
                angleHref={(angleId) =>
                  href({ view: "all", focus: { kind: "angle", id: angleId } })
                }
              />
              <div id="press-requests" className="min-w-0 scroll-mt-4">
                <SourceRequestRail
                  requests={requests}
                  angles={angles}
                  now={now}
                  selectedId={selectedRequestId}
                  onSelect={(id) =>
                    set({ focus: id ? { kind: "request", id } : null })
                  }
                  onRuleRequest={rulings.ruleRequest}
                />
              </div>
            </div>

            <PitchPipeline angles={angles} onOpenAngle={openAngle} />
            <CoverageWon
              coverage={coverage}
              angles={angles}
              onOpenAngle={openAngle}
              focusedId={focusedCoverageId}
            />

            <p className="pb-2 text-[11px] leading-4 text-muted-foreground">
              {selectedSite
                ? `Press room for ${selectedSite.name || selectedSite.domain}.`
                : "No site selected."}{" "}
              Angles and requests are read straight from the shared database;
              coverage covers the last 180 days. An angle only ever arrives as
              &ldquo;ready to pitch&rdquo; when it has no missing evidence, no
              unmet proof requirement and no contradiction — everything else
              arrives needing work and a human look, which is why most of this
              queue is building proof.{" "}
              <Link
                href={href({ scenario: "empty" as PressRoomScenario })}
                className="text-primary hover:underline"
              >
                See the empty state
              </Link>
              {" · "}
              <Link
                href={href({ scenario: "error" as PressRoomScenario })}
                className="text-primary hover:underline"
              >
                the failed read
              </Link>
              {" · "}
              <Link
                href={href({ scenario: "stalled" as PressRoomScenario })}
                className="text-primary hover:underline"
              >
                the stalled read
              </Link>
              .
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
  press: PressRoomData,
  brandName: string | null,
): string {
  const lines: string[] = [
    `PRESS ROOM${brandName ? ` — ${brandName}` : ""}${press.isSample ? " (SAMPLE DATA)" : ""}`,
    "",
    `Story angles: ${press.angles.length}`,
    `Journalist requests: ${press.requests.length}`,
    `Coverage in the last 180 days: ${press.coverage.length}`,
    "",
    "ANGLES",
  ];
  for (const angle of press.angles) {
    const read = readLadder(angle);
    lines.push(
      `- [${angle.status}/${angle.recommended_action}] ${angle.headline} (priority ${angle.priority}, ${read.held}/${read.total} proofs in hand)`,
    );
  }
  lines.push("", "REQUESTS");
  for (const request of press.requests) {
    lines.push(
      `- [${request.status}] ${request.outlet ?? "Unknown outlet"}: ${request.query_title} (match ${request.match_score}, deadline ${request.deadline_at ?? "none"})`,
    );
  }
  return lines.join("\n");
}
