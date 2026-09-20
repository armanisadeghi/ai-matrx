/**
 * V-28 NEW-1, on screen: the knob's failure reason reaches EVERY surface that renders the
 * tracking chip, not just the panel.
 *
 * The defect this suite exists to keep closed: `siteConnectionStatuses(site)` took the tracking
 * input as an optional second argument, and four of the five chip surfaces — the site record's
 * Connections board, the brand's site table, the brand's site cards and the brand workspace's
 * site list — never passed it. `thresholdUnavailable` was therefore `null` BY CONSTRUCTION on
 * all four: with an unreadable staleness knob they went on quietly calling nothing stale and
 * announcing nothing, which is the Law-4 failure the panel's stand-in exists to prevent.
 *
 * Every surface now reads the same input through `useSiteConnectionStatuses`, so this suite
 * drives the real render paths with the knob unreadable and asserts the reason is printed.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SiteConnectionChips } from "@/features/marketing/components/shared/SiteConnectionChips";
import {
  SITE_LIST_COLUMNS,
  renderSiteListMobileCard,
} from "@/features/marketing/components/sites/site-list-presentation";
import { useSiteConnectionStatuses } from "@/features/marketing/tracking/hooks";
import { trackingKnobStandIn } from "@/features/marketing/tracking/knobs";

const STAND_IN = trackingKnobStandIn("readAllRows(platform.feature_knob): query failed");

jest.mock("@/features/marketing/tracking/knobs", () => {
  const real = jest.requireActual("@/features/marketing/tracking/knobs");
  return {
    ...real,
    useTrackingSnapshotMaxAgeHours: () => ({
      hours: null,
      unavailableReason: real.trackingKnobStandIn(
        "readAllRows(platform.feature_knob): query failed",
      ),
      isLoading: false,
    }),
  };
});

jest.mock("@/features/marketing/tracking/service", () => ({
  readLatestTrackingSnapshot: jest.fn().mockResolvedValue(null),
  takeTrackingSnapshot: jest.fn(),
}));

const CONNECTION = "11111111-1111-4111-8111-111111111111";

/** A real portfolio row, bound to a container — the state a reader is judging. */
function siteRow() {
  return {
    id: "site-1",
    organization_id: "org-1",
    brand_id: "brand-1",
    name: "Clinic",
    domain: "clinic.example",
    root_url: "https://clinic.example/",
    status: "active",
    visibility: "private",
    initialized_at: "2026-09-01T00:00:00Z",
    initialization: {},
    gsc_synced_at: null,
    updated_at: "2026-09-19T00:00:00Z",
    favicon_url: null,
    logo_url: null,
    health_score: null,
    scored_pages: 0,
    page_count: 0,
    resource_count: 0,
    pages_in_gsc: 0,
    gsc_clicks_28d: null,
    gsc_impressions_28d: null,
    gsc_position_28d: null,
    gsc_clicks_prev_28d: null,
    gsc_impressions_prev_28d: null,
    gsc_cur_days: 0,
    gsc_prev_days: 0,
    integrations: {
      marketing: {
        providers: {
          google_tag_manager: {
            enabled: true,
            credential_authority: "external_connection",
            credential_ref: CONNECTION,
            resource_ref: "GTM-ABC1234",
          },
        },
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a fixture row, not a read
  } as any;
}

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  act(() => {
    root.render(
      <QueryClientProvider client={client}>{node}</QueryClientProvider>,
    );
  });
  return container;
}

/** The chip's reason lives in its tooltip, which is the `title` attribute. */
function trackingTitle(el: HTMLElement): string {
  const titles = Array.from(el.querySelectorAll("[title]")).map(
    (node) => node.getAttribute("title") ?? "",
  );
  const tracking = titles.find((title) => title.startsWith("Tag Manager tracking:"));
  if (!tracking) throw new Error(`no tracking chip in: ${titles.join(" | ")}`);
  return tracking;
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("🚨 an unreadable staleness knob is announced on EVERY chip surface", () => {
  it("the chip component itself — the one every surface renders", () => {
    const title = trackingTitle(render(<SiteConnectionChips site={siteRow()} />));
    expect(title).toContain("google.tracking.snapshot_max_age_hours");
    expect(title).toContain("nothing here is being called stale");
    expect(title).toBe(`Tag Manager tracking: ${
      "A container is bound but this site has never been checked — run a tracking check to see what is firing."
    } ${STAND_IN}`);
  });

  it("the brand's site TABLE — the Connections column cell", () => {
    const column = SITE_LIST_COLUMNS.find((spec) => spec.id === "connections");
    if (!column) throw new Error("no connections column");
    const cell = column.column.cell;
    if (!cell) throw new Error("the connections column renders no cell");
    const el = render(<>{cell(siteRow(), 0)}</>);
    expect(trackingTitle(el)).toContain("nothing here is being called stale");
  });

  it("the brand's site CARDS — the phone presentation of the same list", () => {
    const el = render(
      <>
        {renderSiteListMobileCard(siteRow(), 0, {
          actions: null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- only `actions` is read here
        } as any)}
      </>,
    );
    expect(trackingTitle(el)).toContain("nothing here is being called stale");
  });

  it("the site record's Connections BOARD and the brand workspace list — the shared derivation", () => {
    // Both render the statuses themselves rather than the chip strip, through the same hook.
    function Probe() {
      const statuses = useSiteConnectionStatuses(siteRow());
      const tracking = statuses.find((status) => status.key === "tracking");
      return <p>{`${tracking?.name}: ${tracking?.detail}`}</p>;
    }
    const el = render(<Probe />);
    expect(el.textContent).toContain("google.tracking.snapshot_max_age_hours");
    expect(el.textContent).toContain("nothing here is being called stale");
  });

  it("the verdict the chip already carried is kept — the stand-in is added, never a replacement", () => {
    const title = trackingTitle(render(<SiteConnectionChips site={siteRow()} />));
    expect(title).toContain("never been checked");
  });
});
