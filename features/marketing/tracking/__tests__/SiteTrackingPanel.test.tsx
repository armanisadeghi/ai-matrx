/**
 * THE TRACKING PANEL, ON SCREEN, over a fixture snapshot in each graded state.
 *
 * What this suite is for: a verdict a person reads. `trackingHealth` is unit-tested beside this,
 * but the panel is where the evidence, the remedy and the `not_checked` row are actually
 * assembled — and the defect this feature exists to prevent (a confident grade of a container the
 * live page does not use) is only visible once rendered.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { Json } from "@/types/database.types";

const snapshotState: { value: unknown } = { value: null };
const knobState: {
  hours: number | null;
  reason: string | null;
  surface: string | null;
} = {
  hours: 168,
  reason: null,
  surface: null,
};

jest.mock("@/features/marketing/tracking/hooks", () => ({
  trackingSnapshotKey: (siteId: string) => ["site", siteId, "tag-manager-snapshot"],
  useLatestTrackingSnapshot: () => ({
    data: snapshotState.value,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

// The READ is mocked; the SENTENCE is the real builder's, and the surface the panel asks for is
// recorded so this suite proves the panel gets the panel's words (V-29 NEW-2) rather than the
// chips'.
jest.mock("@/features/marketing/tracking/knobs", () => {
  const real = jest.requireActual("@/features/marketing/tracking/knobs");
  return {
    ...real,
    useTrackingSnapshotMaxAgeHours: (surface: "panel" | "chip") => {
      knobState.surface = surface;
      return {
        hours: knobState.hours,
        unavailableReason: knobState.reason,
        isLoading: false,
      };
    },
  };
});

jest.mock("@/features/marketing/google/hooks", () => ({
  useTagManagerInventory: () => ({
    mutate: jest.fn(),
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

jest.mock("@/features/connectors/google-adapter", () => ({
  useGoogleConnectorState: () => ({
    accounts: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        grantedScopes: [
          "openid",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/tagmanager.readonly",
        ],
      },
    ],
    rollout: [
      {
        capabilityKey: "tag_manager",
        phase: "available",
        eligible: true,
        requiredScopes: ["https://www.googleapis.com/auth/tagmanager.readonly"],
        ineligibleReason: null,
      },
    ],
    resourceCountByAccount: {},
    isLoading: false,
    rolloutUnavailable: false,
    isError: false,
    errorMessage: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  // The freshness line's own knob read (`google.marketing.freshness_warning_hours`, live value
  // 72). The DESCRIBER it feeds is the real one, which is the point: this suite proves the words
  // a person reads on the tracking panel, not a stub of them.
  useQuery: () => ({
    data: 72,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
  }),
}));

jest.mock("@/components/agent-copy/CopyButtons", () => ({
  CopyButtons: () => null,
}));

// These three pull the whole agent runtime and the record-unavailable surface into a jsdom module
// graph (MarketingUi → RecordUnavailableNotice → overlays → AgentRunner), which has a circular
// initialization this suite is not about. Everything the suite ASSERTS — the derivation, the
// freshness line, the rollout read, the verdict rows — stays REAL.
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({
  confirm: jest.fn(async () => false),
}));
jest.mock("@/lib/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));
jest.mock("@/features/marketing/components/shared/MarketingUi", () => ({
  InlineQueryError: ({ what }: { what: string }) => <span>{`Could not read ${what}`}</span>,
}));

// eslint-disable-next-line import/first -- after the mocks above
import { SiteTrackingPanel } from "@/features/marketing/tracking/components/SiteTrackingPanel";
// eslint-disable-next-line import/first -- after the mocks above
import { trackingKnobStandIn } from "@/features/marketing/tracking/knobs";

const CONNECTION = "11111111-1111-4111-8111-111111111111";

function findingsPayload(reconciliation: "pass" | "fail" | "not_checked"): Json {
  return {
    __kind: "tag_manager_findings",
    checks: [
      {
        id: "ga4_installed",
        verdict: "pass",
        evidence: "1 live GA4 configuration tag: Google tag (googtag)",
        remedy: null,
      },
      {
        id: "conversion_tracked",
        verdict: "fail",
        evidence: "No conversion tag and no GA4 event tag.",
        remedy: "Add a GA4 event tag for the contact form submit.",
      },
      {
        id: "consent_configured",
        verdict: "fail",
        evidence: "No tag declares a consent requirement.",
        remedy: "Configure Consent Mode.",
      },
      {
        id: "container_on_the_page",
        verdict: reconciliation,
        evidence:
          reconciliation === "pass"
            ? "We fetched https://clinic.example/ and found this container's own id."
            : reconciliation === "fail"
              ? "We fetched https://clinic.example/ and found no Tag Manager loader at all."
              : "We did not read this site's live page, so nothing here says whether the container is actually on it.",
        remedy: reconciliation === "pass" ? null : "Install this container's snippet.",
        source: reconciliation === "not_checked" ? "none" : "live_page_fetch",
        fetched_url: reconciliation === "not_checked" ? null : "https://clinic.example/",
        http_status: reconciliation === "not_checked" ? null : 200,
      },
    ],
    page_reconciliation: null,
    account_id: "acct-1",
    container_id: "GTM-ABC1234",
    workspace_id: "ws-1",
    workspace_name: "Default Workspace",
    truncated: false,
    caveats: [
      "Read from the container's current Tag Manager workspace draft, which can differ from what is published on the live site.",
      "Tracking installed outside Tag Manager — a hard-coded Google tag, a plugin, or server-side tagging — is invisible here, so a missing tag means missing from this container, not missing from the site.",
      "Consent is read from each tag's own declared consent settings. A consent banner that blocks tags without declaring it in Tag Manager does not show up.",
    ],
  } as Json;
}

function site(bound: boolean) {
  return {
    id: "site-1",
    organization_id: "org-1",
    brand_id: "brand-1",
    domain: "clinic.example",
    integrations: bound
      ? {
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
        }
      : {},
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a fixture row, not a read
  } as any;
}

let container: HTMLDivElement;
let root: Root;

function render(node: React.ReactElement) {
  act(() => {
    root.render(node);
  });
  return container.textContent ?? "";
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  snapshotState.value = null;
  knobState.hours = 168;
  knobState.reason = null;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const NOW = new Date("2026-09-19T12:00:00Z");

function snapshotRow(findings: Json, takenAt = "2026-09-19T11:00:00Z") {
  return {
    id: "snapshot-1",
    site_id: "site-1",
    organization_id: "org-1",
    container_id: "GTM-ABC1234",
    provider: "google_tag_manager",
    taken_at: takenAt,
    findings,
    has_ga4: true,
    has_conversion_tag: false,
    has_consent: false,
    deleted_at: null,
  };
}

describe("SiteTrackingPanel", () => {
  it("a site with no container shows the refusal and the Connect door, never three grey no", () => {
    const text = render(<SiteTrackingPanel site={site(false)} now={NOW} />);
    expect(text).toContain("No Tag Manager container is bound to this site");
    expect(text).toContain("Bind a container");
    expect(text).not.toContain("GA4 installed and firing");
  });

  it("prints each graded check with its evidence AND its remedy", () => {
    snapshotState.value = snapshotRow(findingsPayload("pass"));
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain("GA4 installed and firing");
    expect(text).toContain("1 live GA4 configuration tag");
    expect(text).toContain("Contact-form conversion tracked");
    expect(text).toContain("Add a GA4 event tag for the contact form submit.");
    expect(text).toContain("Consent configured");
  });

  it("🚨 prints EVERY caveat the server declared, verbatim — one of three is the defect", () => {
    snapshotState.value = snapshotRow(findingsPayload("pass"));
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain(
      "Read from the container's current Tag Manager workspace draft, which can differ from what is published on the live site.",
    );
    // 🚨 THE ONE THAT WAS MISSING (V-27 NEW-3). Without it, the headline "GA4 not installed ·
    // conversion not tracked" reads as a verdict on the whole site rather than on one container.
    expect(text).toContain(
      "Tracking installed outside Tag Manager — a hard-coded Google tag, a plugin, or server-side tagging — is invisible here, so a missing tag means missing from this container, not missing from the site.",
    );
    expect(text).toContain(
      "Consent is read from each tag's own declared consent settings. A consent banner that blocks tags without declaring it in Tag Manager does not show up.",
    );
    // …and the freshness line's lag slot holds the SERVER's own first caveat, off the same
    // finding — the frontend paraphrase that used to sit there was a fourth copy of a sentence
    // this repo must never author (V-28 NEW-3).
    expect(text).toContain(
      "pulled 1 hour ago · Read from the container's current Tag Manager workspace draft,",
    );
    expect(text).not.toContain("Tag Manager shows the container's");
  });

  it("🚨 says plainly when the container is NOT on the live page", () => {
    snapshotState.value = snapshotRow(findingsPayload("fail"));
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain("The container is on the live site");
    expect(text).toContain("found no Tag Manager loader at all");
    expect(text).toContain("Install this container's snippet.");
    expect(text).toContain("not on the live site");
  });

  it("🚨 renders not_checked as not_checked — never as a pass and never as a failure", () => {
    snapshotState.value = snapshotRow(findingsPayload("not_checked"));
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain("Not checked");
    expect(text).toContain("We did not read this site's live page");
    expect(text).not.toContain("found no Tag Manager loader");
  });

  it("names the missing knob instead of silently not warning", () => {
    snapshotState.value = snapshotRow(findingsPayload("pass"), "2026-01-01T00:00:00Z");
    knobState.hours = null;
    // The real `trackingKnobStandIn` sentence, which the hook returns verbatim.
    knobState.reason = trackingKnobStandIn("knob row missing", { surface: "panel" });
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain("google.tracking.snapshot_max_age_hours");
    // It reaches the screen through the VERDICT's own field, which is the same channel the
    // chip and the status board read — not a second path only this panel happens to have.
    expect(text).toContain("nothing here is being called stale");
    // The TRACKING staleness verdict is unenforced — the panel's own 168-hour sentence is absent.
    // (The freshness line's separate provider-lag knob is a different setting and still warns.)
    expect(text).not.toContain("168 hours your organization allows");
    // V-29 NEW-2: the panel asks for the PANEL's words, and they point at the line below them.
    expect(knobState.surface).toBe("panel");
    expect(text).toContain("This panel cannot tell you whether the snapshot below is too old");
  });

  it("warns when the snapshot is older than the organization allows", () => {
    snapshotState.value = snapshotRow(findingsPayload("pass"), "2026-09-01T00:00:00Z");
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain("older than the 168 hours your organization allows");
  });

  it("says a bound site has never been checked rather than showing a blank grade", () => {
    snapshotState.value = null;
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain("never been checked");
  });

  it("states what the read-only permission does and does not list", () => {
    snapshotState.value = snapshotRow(findingsPayload("pass"));
    const text = render(<SiteTrackingPanel site={site(true)} now={NOW} />);
    expect(text).toContain("Container inventory");
    expect(text).toContain("triggers and variables are not listed by this permission");
  });
});
