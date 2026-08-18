"use client";

/**
 * THE PRESS ROOM — the workspace.
 *
 * Reference product: **Linear's issue list** for the ranked work queue (one
 * dense row, decision signal left, state right, a detail panel that never takes
 * the list away, arrow-key navigation), with **Muck Rack's** opportunity feed
 * for what a source-request row has to say, and a flight-board for the deadline
 * rail. Bones borrowed; every colour, token, and component is ours.
 *
 * The one job this surface exists to make effortless: *decide what to do next
 * about press, without knowing anything about press.* Everything is subordinate
 * to that — the list is ranked so the top row is the answer, the score is one
 * number instead of five, the evidence gap is a to-do list instead of an error,
 * and the only red on the page is a clock that is actually running out.
 *
 * Layout: rail (conditional) → toolbar → list | detail. On mobile the detail
 * becomes a bottom sheet, so the list is never squeezed into an unusable column.
 */

import * as React from "react";
import {
  ArrowUpRight,
  Newspaper,
  RefreshCw,
  Search,
  BrainCircuit,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { TooltipProvider } from "@/components/ui/tooltip";
import FloatingSheet from "@/components/official/FloatingSheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "@/lib/toast";

import { AngleDetail, AngleRow, rankAngles } from "./AngleViews";
import { CoverageList, PitchPipeline, coverageAngleId } from "./PipelineAndCoverage";
import {
  PressRoomEmpty,
  PressRoomError,
  PressRoomSkeleton,
  PressRoomStalled,
  ViewEmpty,
} from "./PressRoomStates";
import {
  DeadlineRail,
  RequestDetail,
  RequestRow,
  closingSoon,
  rankRequests,
} from "./RequestViews";
import { FIXTURE_SITE } from "./fixtures";
import { isLiveRequest } from "./press-model";
import { angleAction } from "./AngleViews";
import { usePressRoom } from "./usePressRoom";
import type { PressRoomScenario } from "./scenario";
import type {
  AngleStatus,
  SourceRequestStatus,
  StoryAngleRow,
  SourceRequestRow,
} from "./types";

type ViewKey = "angles" | "requests" | "pipeline" | "coverage";

interface Selection {
  kind: "angle" | "request";
  id: string;
}

function matches(haystack: Array<string | null>, needle: string): boolean {
  if (!needle) return true;
  const query = needle.toLowerCase();
  return haystack.some((value) => value?.toLowerCase().includes(query));
}

export function PressRoom({ scenario }: { scenario: PressRoomScenario }) {
  const {
    state,
    now,
    reload,
    setAngleStatus,
    setRequestStatus,
    resolveMissingEvidence,
  } = usePressRoom(scenario);
  const isMobile = useIsMobile();

  const [view, setView] = React.useState<ViewKey>("angles");
  const [query, setQuery] = React.useState("");
  const [selection, setSelection] = React.useState<Selection | null>(null);
  const detailRef = React.useRef<HTMLDivElement | null>(null);

  const data = state.status === "ready" ? state.data : null;

  /* ── derived collections ──────────────────────────────────────────────── */

  const angles = React.useMemo(
    () => (data ? rankAngles(data.angles) : []),
    [data],
  );
  const anglesById = React.useMemo(
    () => new Map(angles.map((angle) => [angle.id, angle])),
    [angles],
  );
  const requests = React.useMemo(
    () => (data ? rankRequests(data.requests, now) : []),
    [data, now],
  );
  const rail = React.useMemo(
    () => closingSoon(requests, now),
    [requests, now],
  );

  const visibleAngles = React.useMemo(
    () =>
      angles.filter((angle) =>
        matches(
          [angle.headline, angle.summary, angle.why_now, angle.target_beat],
          query,
        ),
      ),
    [angles, query],
  );
  const visibleRequests = React.useMemo(
    () =>
      requests.filter((row) =>
        matches(
          [row.query_title, row.query_body, row.outlet, row.journalist_name, row.beat],
          query,
        ),
      ),
    [requests, query],
  );
  const visibleCoverage = React.useMemo(
    () =>
      (data?.coverage ?? []).filter((row) =>
        matches([row.title, row.domain, row.author_name], query),
      ),
    [data, query],
  );

  const liveRequestCount = requests.filter(isLiveRequest).length;
  const pipelineCount = angles.filter((angle) =>
    ["accepted", "developing", "pitched", "landed"].includes(angle.status),
  ).length;

  /* ── selection ────────────────────────────────────────────────────────── */

  // Nothing selected on a list view is a wasted panel. The top-ranked row is
  // the surface's answer to "what do I do next", so it opens by default — and
  // the default is applied DURING RENDER when the view changes, never from an
  // effect (an effect here would paint an empty panel for one frame, then a
  // full one, which is exactly the shift this layout is built to avoid).
  const [selectedForView, setSelectedForView] = React.useState<ViewKey | null>(
    null,
  );
  if (data && selectedForView !== view) {
    setSelectedForView(view);
    if (view === "requests" && selection?.kind !== "request") {
      const first = visibleRequests[0];
      setSelection(first ? { kind: "request", id: first.id } : null);
    } else if (
      (view === "angles" || view === "pipeline") &&
      selection?.kind !== "angle"
    ) {
      const first = visibleAngles[0];
      setSelection(first ? { kind: "angle", id: first.id } : null);
    }
  }

  const selectedAngle: StoryAngleRow | null =
    selection?.kind === "angle"
      ? (anglesById.get(selection.id) ?? null)
      : selection?.kind === "request"
        ? null
        : null;

  const selectedRequest: SourceRequestRow | null =
    selection?.kind === "request"
      ? (requests.find((row) => row.id === selection.id) ?? null)
      : null;

  const openAngle = React.useCallback((id: string) => {
    setSelection({ kind: "angle", id });
  }, []);
  const openRequest = React.useCallback((id: string) => {
    setView("requests");
    setSelection({ kind: "request", id });
  }, []);

  /* ── keyboard: ↑/↓ walks the queue, Linear-style ──────────────────────── */

  const currentList: Array<{ id: string }> =
    view === "requests" ? visibleRequests : visibleAngles;
  const currentKind: Selection["kind"] =
    view === "requests" ? "request" : "angle";

  const onListKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    if (currentList.length === 0) return;
    event.preventDefault();
    const index = currentList.findIndex((row) => row.id === selection?.id);
    const next =
      event.key === "ArrowDown"
        ? Math.min(currentList.length - 1, index + 1)
        : Math.max(0, index <= 0 ? 0 : index - 1);
    const target = currentList[next];
    if (target) setSelection({ kind: currentKind, id: target.id });
  };

  /* ── actions ──────────────────────────────────────────────────────────── */

  const rerun = () => {
    reload();
    toast.info("Re-reading your press room", {
      description: "Angles, journalist queries, and coverage are refreshing.",
    });
  };

  const handleAngleStatus = (id: string, status: AngleStatus) => {
    if (!setAngleStatus(id, status)) {
      toast.error("That angle is no longer in the list", {
        description: "Refresh to get the current set.",
      });
      return;
    }
    toast.success(`Angle marked ${status}.`);
  };

  const handleRequestStatus = (id: string, status: SourceRequestStatus) => {
    if (!setRequestStatus(id, status)) {
      toast.error("That query is no longer in the list", {
        description: "Refresh to get the current set.",
      });
      return;
    }
    toast.success(`Query marked ${status}.`);
  };

  const handleResolveEvidence = (angleId: string, key: string) => {
    if (!resolveMissingEvidence(angleId, key)) {
      toast.error("Could not record that proof", {
        description: "It is no longer listed as missing on this angle.",
      });
      return;
    }
    toast.success("Proof recorded", {
      description: "The evidence score and the ladder both moved.",
    });
  };

  /** The recommended action, turned into somewhere the user actually goes. */
  const handlePrimaryAction = (angle: StoryAngleRow) => {
    const action = angleAction(angle.recommended_action);
    if (action === "pitch_now") {
      const match = requests.find(
        (row) => row.story_angle_id === angle.id && isLiveRequest(row),
      );
      if (match) {
        openRequest(match.id);
        return;
      }
      setView("requests");
      toast.info("No open journalist query matches this angle yet", {
        description:
          "Here is every live query — the closest fit is at the top.",
      });
      return;
    }
    if (action === "hold_for_timing") {
      handleAngleStatus(angle.id, "accepted");
      return;
    }
    if (action === "park") {
      handleAngleStatus(angle.id, "proposed");
      return;
    }
    // develop_evidence / needs_expert_input — the work is the ladder, so put
    // the user's hands on the first thing that is actually missing.
    const control = detailRef.current?.querySelector<HTMLButtonElement>(
      "[data-ladder-action]",
    );
    if (control) {
      control.scrollIntoView({ block: "center", behavior: "smooth" });
      control.focus();
      return;
    }
    toast.info("Nothing is missing on this angle", {
      description: "Every proof it needs is already recorded.",
    });
  };

  /* ── non-ready states ─────────────────────────────────────────────────── */

  if (state.status === "loading") return <PressRoomSkeleton />;
  if (state.status === "stalled") return <PressRoomStalled onRetry={reload} />;
  if (state.status === "error")
    return <PressRoomError error={state.error} onRetry={reload} />;
  if (
    data &&
    data.angles.length === 0 &&
    data.requests.length === 0 &&
    data.coverage.length === 0
  )
    return <PressRoomEmpty onFindAngles={rerun} />;

  /* ── the detail panel body, shared by desktop column and mobile sheet ─── */

  const detail = selectedRequest ? (
    <RequestDetail
      row={selectedRequest}
      now={now}
      angle={
        selectedRequest.story_angle_id
          ? (anglesById.get(selectedRequest.story_angle_id) ?? null)
          : null
      }
      onSetStatus={(status) => handleRequestStatus(selectedRequest.id, status)}
      onOpenAngle={(id) => {
        setView("angles");
        openAngle(id);
      }}
    />
  ) : selectedAngle ? (
    <AngleDetail
      angle={selectedAngle}
      requests={requests.filter((row) => row.story_angle_id === selectedAngle.id)}
      coverage={(data?.coverage ?? []).filter(
        (row) => coverageAngleId(row) === selectedAngle.id,
      )}
      onResolveEvidence={(key) => handleResolveEvidence(selectedAngle.id, key)}
      onSetStatus={(status) => handleAngleStatus(selectedAngle.id, status)}
      onOpenRequest={openRequest}
      onPrimaryAction={() => handlePrimaryAction(selectedAngle)}
    />
  ) : (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <p className="max-w-56 text-xs text-muted-foreground">
        Pick a row to see what it needs, what proves it, and who wants it.
      </p>
    </div>
  );

  /* ── the list body ────────────────────────────────────────────────────── */

  const list = (() => {
    if (view === "coverage")
      return (
        <CoverageList
          rows={visibleCoverage}
          anglesById={anglesById}
          onOpenAngle={(id) => {
            setView("angles");
            openAngle(id);
          }}
        />
      );
    if (view === "pipeline")
      return (
        <PitchPipeline
          angles={visibleAngles}
          selectedId={selection?.kind === "angle" ? selection.id : null}
          onSelect={openAngle}
        />
      );
    if (view === "requests") {
      if (visibleRequests.length === 0)
        return (
          <ViewEmpty
            title={query ? "No query matches that search" : "No journalist queries yet"}
            detail={
              query
                ? "Try a shorter search, or clear it to see every query."
                : "HARO, Qwoted, Featured and SourceBottle are watched continuously. Matches land here with a deadline and a draft."
            }
            action={
              query ? (
                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setQuery("")}>
                  Clear search
                </Button>
              ) : null
            }
          />
        );
      return (
        <div className="divide-y divide-border/40">
          {visibleRequests.map((row) => (
            <RequestRow
              key={row.id}
              row={row}
              now={now}
              selected={selection?.kind === "request" && selection.id === row.id}
              onSelect={() => setSelection({ kind: "request", id: row.id })}
            />
          ))}
        </div>
      );
    }
    if (visibleAngles.length === 0)
      return (
        <ViewEmpty
          title={query ? "No angle matches that search" : "No angles yet"}
          detail={
            query
              ? "Try a shorter search, or clear it to see the whole queue."
              : "Run the analysis and it will tell you what about you is newsworthy."
          }
          action={
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              onClick={() => (query ? setQuery("") : rerun())}
            >
              {query ? "Clear search" : "Find my story angles"}
            </Button>
          }
        />
      );
    return (
      <div className="divide-y divide-border/40">
        {visibleAngles.map((angle) => (
          <AngleRow
            key={angle.id}
            angle={angle}
            selected={selection?.kind === "angle" && selection.id === angle.id}
            onSelect={() => setSelection({ kind: "angle", id: angle.id })}
          />
        ))}
      </div>
    );
  })();

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full flex-col overflow-hidden bg-textured">
        <DeadlineRail rows={rail} now={now} onOpen={openRequest} />

        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/60 px-3 py-2">
          <SegmentedControl
            size="sm"
            value={view}
            onValueChange={(value) => setView(value as ViewKey)}
            data={[
              { value: "angles", label: `Angles ${angles.length}` },
              { value: "requests", label: `Queries ${liveRequestCount}` },
              { value: "pipeline", label: `In flight ${pipelineCount}` },
              {
                value: "coverage",
                label: `Coverage ${data?.coverage.length ?? 0}`,
              },
            ]}
          />

          <div className="relative min-w-40 flex-1 sm:max-w-64">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search angles, outlets, journalists…"
              aria-label="Search the press room"
              className="h-7 pl-7 pr-7 text-xs"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <a
              href="/crm/outreach-lists"
              target="_blank"
              rel="noreferrer noopener"
              className="hidden items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-primary sm:inline-flex"
            >
              Media lists
              <ArrowUpRight className="h-3 w-3" />
            </a>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 text-[11px]"
              onClick={rerun}
            >
              <RefreshCw className="h-3 w-3" />
              Re-read
            </Button>
            <Button size="sm" className="h-7 gap-1.5 text-[11px]" onClick={rerun}>
              <BrainCircuit className="h-3 w-3" />
              Find angles
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <div
            className="min-w-0 flex-1 overflow-y-auto scrollbar-thin focus:outline-none"
            tabIndex={-1}
            onKeyDown={onListKeyDown}
          >
            {list}
          </div>

          {!isMobile ? (
            // Width steps with the viewport but the panel is ALWAYS present
            // above the mobile breakpoint. A `hidden lg:block` here would have
            // left 768–1023px with neither panel nor sheet — a selected row
            // that opens nothing, which is a dead end at one screen size.
            <aside
              ref={detailRef}
              className="w-[22rem] shrink-0 border-l border-border/60 bg-card/40 lg:w-[26rem] xl:w-[28rem]"
            >
              {detail}
            </aside>
          ) : null}
        </div>

        {isMobile ? (
          <FloatingSheet
            isOpen={selection !== null}
            onClose={() => setSelection(null)}
            title={
              <span className="flex items-center gap-1.5 text-sm">
                <Newspaper className="h-4 w-4" />
                {selectedRequest ? "Journalist query" : "Story angle"}
              </span>
            }
            position="bottom"
            height="4xl"
            width="full"
            isMobile
          >
            <div ref={detailRef} className="h-full">
              {detail}
            </div>
          </FloatingSheet>
        ) : null}
      </div>
    </TooltipProvider>
  );
}

/** Header content for the route. Named separately so the page stays a server file. */
export function PressRoomHeading() {
  return (
    <span className="flex min-w-0 items-center gap-2 pr-14">
      <Newspaper className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="truncate text-sm font-semibold text-foreground">
        Press Room
      </span>
      <span className="hidden truncate text-xs text-muted-foreground sm:inline">
        {FIXTURE_SITE.name}
      </span>
    </span>
  );
}
