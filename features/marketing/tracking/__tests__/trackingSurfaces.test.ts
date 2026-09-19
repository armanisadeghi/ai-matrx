/**
 * The three shared primitives U-M2 extended, each held to the thing that would break if the
 * extension were done carelessly:
 *
 *  1. `FreshnessProvider` gained a third member. A snapshot is a POINT IN TIME, so the line must
 *     not print "no data stored yet" beside a snapshot we are holding — and its lag sentence must
 *     be the Tag Manager caveat, not a reporting delay Tag Manager does not have.
 *  2. `site-status.ts` gained a sixth chip. It must derive through the ONE tracking derivation,
 *     so the chip and the panel can never disagree.
 *  3. `integrations-schema.ts` gained the `googleTagManager` binding. The container reference is
 *     the PUBLIC id, because that is the only id the live page carries.
 */

import type { Json } from "@/types/database.types";
import {
  describeFreshness,
  PROVIDER_LAG_SENTENCE,
} from "@/features/marketing/google/freshness";
import { siteConnectionStatuses } from "@/features/marketing/lib/site-status";
import {
  buildSiteIntegrations,
  parseSiteIntegrations,
  validateSiteIntegrations,
} from "@/features/marketing/data/integrations-schema";
import type { TagManagerSnapshotRow } from "@/features/marketing/tracking/types";

const NOW = new Date("2026-09-19T12:00:00Z");
const CONNECTION = "11111111-1111-4111-8111-111111111111";

describe("the freshness line's third provider", () => {
  it("says the Tag Manager caveat, not a reporting lag Tag Manager does not have", () => {
    expect(PROVIDER_LAG_SENTENCE.tag_manager).toBe(
      "Tag Manager shows the container's workspace draft, not what is published",
    );
  });

  it("🚨 prints no range clause for a snapshot — 'no data stored yet' beside a real snapshot lies", () => {
    const line = describeFreshness({
      provider: "tag_manager",
      dataThrough: null,
      pulledAt: "2026-09-19T11:20:00Z",
      warningAfterHours: 168,
      now: NOW,
    });
    expect(line.sentence).not.toContain("no data stored yet");
    expect(line.sentence).toContain("pulled 40 minutes ago");
    expect(line.sentence).toContain("workspace draft");
    expect(line.stale).toBe(false);
  });

  it("still says 'never pulled' when nothing has ever been taken", () => {
    const line = describeFreshness({
      provider: "tag_manager",
      dataThrough: null,
      pulledAt: null,
      warningAfterHours: 168,
      now: NOW,
    });
    expect(line.sentence).toContain("never pulled");
    expect(line.neverPulled).toBe(true);
  });

  it("leaves the two existing providers' sentences untouched", () => {
    const line = describeFreshness({
      provider: "analytics",
      dataThrough: null,
      pulledAt: null,
      warningAfterHours: 72,
      now: NOW,
    });
    expect(line.sentence).toContain("no data stored yet");
  });
});

function siteRow(integrations: Json) {
  return {
    initialized_at: "2026-09-01T00:00:00Z",
    initialization: {},
    integrations,
    gsc_synced_at: null,
    domain: "clinic.example",
    root_url: "https://clinic.example/",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- a fixture row, not a read
  } as any;
}

const BOUND: Json = {
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
};

function trackingChip(integrations: Json, tracking?: Parameters<typeof siteConnectionStatuses>[1]) {
  const statuses = siteConnectionStatuses(siteRow(integrations), tracking);
  const chip = statuses.find((status) => status.key === "tracking");
  if (!chip) throw new Error("no tracking chip");
  return { chip, statuses };
}

describe("the sixth connection chip", () => {
  it("is present on every site, after the five that were there before", () => {
    const { statuses } = trackingChip({});
    expect(statuses.map((status) => status.key)).toEqual([
      "initialized",
      "search_console",
      "analytics",
      "pagespeed",
      "cms",
      "tracking",
    ]);
  });

  it("reads OFF with no container bound", () => {
    expect(trackingChip({}).chip.state).toBe("off");
  });

  it("reads ATTENTION on a bound site with no snapshot, never OFF", () => {
    const { chip } = trackingChip(BOUND);
    expect(chip.state).toBe("attention");
    expect(chip.detail).toContain("never been checked");
  });

  it("🚨 carries the panel's own sentence when the snapshot is passed in", () => {
    const snapshot = {
      taken_at: "2026-09-19T11:00:00Z",
      findings: {
        __kind: "tag_manager_findings",
        checks: [
          { id: "ga4_installed", verdict: "pass", evidence: "one tag", remedy: null },
          {
            id: "conversion_tracked",
            verdict: "fail",
            evidence: "none",
            remedy: "add one",
          },
          {
            id: "consent_configured",
            verdict: "fail",
            evidence: "none",
            remedy: "configure it",
          },
        ],
      },
    } as unknown as TagManagerSnapshotRow;
    const { chip } = trackingChip(BOUND, {
      snapshot,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(chip.state).toBe("attention");
    expect(chip.detail).toBe(
      "GA4 installed and firing · contact-form conversion not tracked · consent not configured",
    );
  });
});

describe("the googleTagManager binding", () => {
  it("round-trips through the site document under its own provider key", () => {
    const draft = parseSiteIntegrations({});
    const built = buildSiteIntegrations(
      {},
      {
        ...draft,
        googleTagManager: {
          enabled: true,
          credentialAuthority: "external_connection",
          credentialRef: CONNECTION,
          resourceRef: "GTM-ABC1234",
        },
      },
    );
    expect(parseSiteIntegrations(built).googleTagManager).toEqual({
      enabled: true,
      credentialAuthority: "external_connection",
      credentialRef: CONNECTION,
      resourceRef: "GTM-ABC1234",
    });
  });

  it("does not disturb the providers beside it", () => {
    const built = buildSiteIntegrations({}, parseSiteIntegrations({}));
    const parsed = parseSiteIntegrations(built);
    expect(parsed.googleSearchConsole.enabled).toBe(false);
    expect(parsed.googleAnalytics4.enabled).toBe(false);
    expect(parsed.googleTagManager.enabled).toBe(false);
  });

  it("🚨 refuses anything but a PUBLIC container id — the numeric one is never on the page", () => {
    const draft = parseSiteIntegrations({});
    const issues = validateSiteIntegrations({
      ...draft,
      googleTagManager: {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION,
        // The internal container id. It appears in the Tag Manager API and NEVER in the site's
        // own snippet, so a reconciliation could never match on it.
        resourceRef: "6001234567",
      },
    });
    expect(
      issues.some((issue) => issue.field === "googleTagManager.resourceRef"),
    ).toBe(true);
    expect(
      issues.find((issue) => issue.field === "googleTagManager.resourceRef")?.message,
    ).toContain("GTM-ABC1234");
  });

  it("accepts a real public container id", () => {
    const draft = parseSiteIntegrations({});
    const issues = validateSiteIntegrations({
      ...draft,
      googleTagManager: {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION,
        resourceRef: "GTM-ABC1234",
      },
    });
    expect(
      issues.filter((issue) => issue.field.startsWith("googleTagManager")),
    ).toEqual([]);
  });

  it("refuses a token pasted where the container id goes", () => {
    const draft = parseSiteIntegrations({});
    const issues = validateSiteIntegrations({
      ...draft,
      googleTagManager: {
        enabled: true,
        credentialAuthority: "external_connection",
        credentialRef: CONNECTION,
        resourceRef: "ya29.a0ARrdaM-secret-looking-value",
      },
    });
    expect(
      issues.some((issue) => issue.field === "googleTagManager.resourceRef"),
    ).toBe(true);
  });
});
