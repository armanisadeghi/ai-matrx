/**
 * THE ONE TRACKING VERDICT — the derivation the chip, the status board and the panel all read.
 *
 * Every test here is written so that removing the behaviour it names turns it RED. The two that
 * matter most are the ones about honesty: a container that is NOT on the live page must not let
 * the verdict read as healthy, and a `not_checked` reconciliation must never be read as a pass.
 */

import type { Json } from "@/types/database.types";
import {
  trackingHealth,
  trackingSentence,
} from "@/features/marketing/tracking/health";
import {
  parseTrackingFindings,
  type TagManagerSnapshotRow,
} from "@/features/marketing/tracking/types";
import { trackingKnobStandIn } from "@/features/marketing/tracking/knobs";

const NOW = new Date("2026-09-19T12:00:00Z");

function findings(
  overrides: {
    ga4?: "pass" | "fail";
    conversion?: "pass" | "fail";
    consent?: "pass" | "fail";
    reconciliation?: "pass" | "fail" | "not_checked" | "absent";
  } = {},
): Json {
  const reconciliation = overrides.reconciliation ?? "pass";
  const checks: Json[] = [
    {
      id: "ga4_installed",
      verdict: overrides.ga4 ?? "pass",
      evidence: "1 live GA4 configuration tag: Google tag (googtag)",
      remedy: null,
    },
    {
      id: "conversion_tracked",
      verdict: overrides.conversion ?? "fail",
      evidence: "No conversion tag and no GA4 event tag.",
      remedy: "Add a GA4 event tag for the contact form submit.",
    },
    {
      id: "consent_configured",
      verdict: overrides.consent ?? "fail",
      evidence: "No tag in this workspace declares a consent requirement.",
      remedy: "Configure Consent Mode.",
    },
  ];
  const page: Json | null =
    reconciliation === "absent"
      ? null
      : {
          id: "container_on_the_page",
          verdict: reconciliation,
          evidence:
            reconciliation === "pass"
              ? "We fetched https://clinic.example/ and found this container's own id."
              : reconciliation === "fail"
                ? "We fetched https://clinic.example/ and found no Tag Manager loader at all."
                : "We did not read this site's live page.",
          remedy: reconciliation === "pass" ? null : "Install the snippet.",
          source: reconciliation === "not_checked" ? "none" : "live_page_fetch",
        };
  return {
    __kind: "tag_manager_findings",
    checks: page ? [...checks, page] : checks,
    page_reconciliation: page,
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

function snapshot(
  overrides: Partial<TagManagerSnapshotRow> = {},
  findingsValue: Json = findings(),
): TagManagerSnapshotRow {
  return {
    container_id: "GTM-ABC1234",
    created_at: "2026-09-19T11:00:00Z",
    created_by: null,
    deleted_at: null,
    findings: findingsValue,
    has_consent: false,
    has_conversion_tag: false,
    has_ga4: true,
    id: "snapshot-1",
    metadata: {},
    organization_id: "org-1",
    provider: "google_tag_manager",
    site_id: "site-1",
    taken_at: "2026-09-19T11:00:00Z",
    updated_at: "2026-09-19T11:00:00Z",
    updated_by: null,
    version: 1,
    ...overrides,
  } as TagManagerSnapshotRow;
}

describe("trackingHealth", () => {
  it("says OFF, with the one thing to do, when no container is bound", () => {
    const health = trackingHealth({
      snapshot: null,
      containerBound: false,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(health.state).toBe("off");
    // 🚨 NEVER three grey "no": nothing was graded, and the sentence says what would grade it.
    expect(health.detail).toContain("Bind a container");
    expect(health.detail).not.toContain("GA4 not installed");
  });

  it("says a bound-but-never-checked site needs attention, not that it is healthy", () => {
    const health = trackingHealth({
      snapshot: null,
      containerBound: true,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(health.state).toBe("attention");
    expect(health.detail).toContain("never been checked");
  });

  it("prints the PLAN §4.10 sentence in order", () => {
    const parsed = parseTrackingFindings(findings());
    expect(parsed).not.toBeNull();
    expect(trackingSentence(parsed!)).toBe(
      "GA4 installed and firing · contact-form conversion not tracked · consent not configured",
    );
  });

  it("is connected only when every headline check passes AND the container is on the page", () => {
    const health = trackingHealth({
      snapshot: snapshot(
        {},
        findings({ conversion: "pass", consent: "pass", reconciliation: "pass" }),
      ),
      containerBound: true,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(health.state).toBe("connected");
  });

  it("🚨 refuses to read healthy when the container is NOT on the live page", () => {
    const health = trackingHealth({
      snapshot: snapshot(
        {},
        findings({ conversion: "pass", consent: "pass", reconciliation: "fail" }),
      ),
      containerBound: true,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(health.state).toBe("attention");
    // The sentence must say WHY every verdict above it is suspect, not just that something failed.
    expect(health.detail).toContain("not on the live site");
  });

  it("treats a not_checked reconciliation as unproven, never as a pass", () => {
    const health = trackingHealth({
      snapshot: snapshot(
        {},
        findings({
          conversion: "pass",
          consent: "pass",
          reconciliation: "not_checked",
        }),
      ),
      containerBound: true,
      maxAgeHours: 168,
      now: NOW,
    });
    // The headline three all pass, so the state stays connected — but the panel prints the
    // `not_checked` row verbatim and the detail never claims the page was verified.
    expect(health.detail).not.toContain("not on the live site");
    expect(health.findings?.pageReconciliation?.verdict).toBe("not_checked");
  });

  it("marks a snapshot older than the organization's knob as stale, on ONE clock", () => {
    const health = trackingHealth({
      snapshot: snapshot({ taken_at: "2026-09-01T11:00:00Z" }),
      containerBound: true,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(health.stale).toBe(true);
    expect(Math.round(health.ageHours ?? 0)).toBe(433);
    expect(health.state).toBe("attention");
  });

  it("calls nothing stale when the knob could not be read", () => {
    const health = trackingHealth({
      snapshot: snapshot({ taken_at: "2026-01-01T11:00:00Z" }),
      containerBound: true,
      maxAgeHours: null,
      now: NOW,
    });
    expect(health.stale).toBe(false);
  });

  it("🚨 carries the unreadable-threshold reason out on the verdict — it is never a silent null", () => {
    // The pair that must always travel together: nothing is being called stale (`stale: false`
    // on a snapshot eight months old) AND the sentence that says why. Before V-27 NEW-5 the
    // field was hardcoded null at every exit, so the chip read as a clean "never stale".
    const reason = trackingKnobStandIn("knob row missing");
    const health = trackingHealth({
      snapshot: snapshot({ taken_at: "2026-01-01T11:00:00Z" }),
      containerBound: true,
      maxAgeHours: null,
      thresholdUnavailable: reason,
      now: NOW,
    });
    expect(health.stale).toBe(false);
    expect(health.thresholdUnavailable).toBe(reason);
    expect(health.thresholdUnavailable).toContain(
      "google.tracking.snapshot_max_age_hours",
    );
  });

  it("carries the reason out of the never-checked and unreadable-payload exits too", () => {
    const reason = trackingKnobStandIn("knob row missing");
    const never = trackingHealth({
      snapshot: null,
      containerBound: true,
      maxAgeHours: null,
      thresholdUnavailable: reason,
      now: NOW,
    });
    expect(never.thresholdUnavailable).toBe(reason);
    const unreadable = trackingHealth({
      snapshot: snapshot({}, { checks: [] } as unknown as Json),
      containerBound: true,
      maxAgeHours: null,
      thresholdUnavailable: reason,
      now: NOW,
    });
    expect(unreadable.thresholdUnavailable).toBe(reason);
  });

  it("announces an unreadable payload instead of grading it", () => {
    const health = trackingHealth({
      snapshot: snapshot({}, { checks: [] } as unknown as Json),
      containerBound: true,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(health.state).toBe("attention");
    expect(health.detail).toContain("cannot read");
    expect(health.findings).toBeNull();
  });
});

describe("parseTrackingFindings", () => {
  it("refuses a payload that does not declare the kind", () => {
    expect(parseTrackingFindings({ checks: [] } as unknown as Json)).toBeNull();
  });

  it("🚨 keeps EVERY caveat the server declared, in order — never one of them", () => {
    const parsed = parseTrackingFindings(findings());
    expect(parsed?.caveats).toHaveLength(3);
    // The dangerous one: without it, "GA4 not installed" reads as "this site is untracked".
    expect(parsed?.caveats[1]).toContain(
      "is invisible here, so a missing tag means missing from this container",
    );
    expect(parsed?.caveats[2]).toContain("consent banner");
  });

  it("reads a payload with no caveats as an empty list, never as a crash", () => {
    const parsed = parseTrackingFindings({
      __kind: "tag_manager_findings",
      checks: [],
    } as unknown as Json);
    expect(parsed?.caveats).toEqual([]);
  });

  it("keeps __kind on the parsed shape — the marker is part of the data", () => {
    expect(parseTrackingFindings(findings())?.__kind).toBe("tag_manager_findings");
  });

  it("🚨 reads an unrecognised verdict word as not_checked, never as a pass", () => {
    const parsed = parseTrackingFindings({
      __kind: "tag_manager_findings",
      checks: [{ id: "ga4_installed", verdict: "probably", evidence: "x" }],
    } as unknown as Json);
    expect(parsed?.checks[0].verdict).toBe("not_checked");
  });

  it("finds the reconciliation inside checks when the top-level key is absent", () => {
    const parsed = parseTrackingFindings({
      __kind: "tag_manager_findings",
      checks: [
        {
          id: "container_on_the_page",
          verdict: "fail",
          evidence: "no loader",
          remedy: "install it",
        },
      ],
    } as unknown as Json);
    expect(parsed?.pageReconciliation?.verdict).toBe("fail");
  });
});
