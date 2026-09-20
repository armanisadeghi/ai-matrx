/**
 * The three shared primitives U-M2 extended, each held to the thing that would break if the
 * extension were done carelessly:
 *
 *  1. `FreshnessProvider` gained a third member. A snapshot is a POINT IN TIME, so the line must
 *     not print "no data stored yet" beside a snapshot we are holding — and the clause in the
 *     Tag Manager provider's lag slot is the SERVER's own first caveat, read off the finding.
 *     The frontend authors no caveat sentence of its own (V-28 NEW-3).
 *  2. `site-status.ts` gained a sixth chip. It must derive through the ONE tracking derivation,
 *     so the chip and the panel can never disagree.
 *  3. `integrations-schema.ts` gained the `googleTagManager` binding. The container reference is
 *     the PUBLIC id, because that is the only id the live page carries.
 */

import fs from "node:fs";
import path from "node:path";

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
import { trackingKnobStandIn } from "@/features/marketing/tracking/knobs";

const NOW = new Date("2026-09-19T12:00:00Z");
const CONNECTION = "11111111-1111-4111-8111-111111111111";

const SERVER_CAVEATS = [
  "Read from the container's current Tag Manager workspace draft, which can differ from what is published on the live site.",
  "Tracking installed outside Tag Manager — a hard-coded Google tag, a plugin, or server-side tagging — is invisible here, so a missing tag means missing from this container, not missing from the site.",
];

describe("the freshness line's third provider", () => {
  it("🚨 authors NO lag sentence for Tag Manager — the server owns that sentence (V-28 NEW-3)", () => {
    expect(PROVIDER_LAG_SENTENCE.tag_manager).toBeUndefined();
    expect(Object.keys(PROVIDER_LAG_SENTENCE).sort()).toEqual([
      "analytics",
      "search_console",
    ]);
  });

  it("🚨 prints the SERVER's own first caveat, verbatim, in the lag slot", () => {
    const line = describeFreshness({
      provider: "tag_manager",
      dataThrough: null,
      pulledAt: "2026-09-19T11:20:00Z",
      warningAfterHours: 168,
      serverCaveats: SERVER_CAVEATS,
      now: NOW,
    });
    expect(line.sentence).toContain(SERVER_CAVEATS[0]);
  });

  it("says nothing about coverage when the server declared no caveat — never a frontend guess", () => {
    const line = describeFreshness({
      provider: "tag_manager",
      dataThrough: null,
      pulledAt: "2026-09-19T11:20:00Z",
      warningAfterHours: 168,
      now: NOW,
    });
    expect(line.sentence).toBe("pulled 40 minutes ago");
  });

  it("🚨 prints no range clause for a snapshot — 'no data stored yet' beside a real snapshot lies", () => {
    const line = describeFreshness({
      provider: "tag_manager",
      dataThrough: null,
      pulledAt: "2026-09-19T11:20:00Z",
      warningAfterHours: 168,
      serverCaveats: SERVER_CAVEATS,
      now: NOW,
    });
    expect(line.sentence).not.toContain("no data stored yet");
    expect(line.sentence).toContain("pulled 40 minutes ago");
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

const NO_TRACKING_DATA = {
  snapshot: null,
  maxAgeHours: 168,
  thresholdUnavailable: null,
  now: NOW,
} as const;

function trackingChip(
  integrations: Json,
  tracking: Parameters<typeof siteConnectionStatuses>[1] = NO_TRACKING_DATA,
) {
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

  it("🚨 says on the chip itself when the staleness threshold could not be read", () => {
    // The Law-4 failure this closes (V-27 NEW-5): with an unreadable knob the chip stops
    // calling ANYTHING stale, so silence here reads as "checked recently enough" on a site
    // nobody is judging. The reason rides in `detail`, which is the chip's tooltip.
    const reason = trackingKnobStandIn("knob row missing", { surface: "chip" });
    const { chip } = trackingChip(BOUND, {
      snapshot: null,
      maxAgeHours: null,
      thresholdUnavailable: reason,
      now: NOW,
    });
    expect(chip.detail).toContain("google.tracking.snapshot_max_age_hours");
    expect(chip.detail).toContain("nothing here is being called stale");
    // …and the verdict it already carried is still there, not replaced by the stand-in.
    expect(chip.detail).toContain("never been checked");
  });

  it("says nothing extra when the threshold WAS readable", () => {
    const { chip } = trackingChip(BOUND, {
      snapshot: null,
      maxAgeHours: 168,
      now: NOW,
    });
    expect(chip.detail).not.toContain("snapshot_max_age_hours");
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


// ─────────────────────────────────────────────────────────────────────────────
// V-28 NEW-1 and NEW-3: two grep guards over the source itself. Both close a class that a
// unit test over one module cannot see — a SECOND place that derives the chip without the
// tracking input, and a SECOND authority on a caveat sentence.
// ─────────────────────────────────────────────────────────────────────────────

const REPO_ROOT = path.resolve(__dirname, "../../../..");

/**
 * 🚨 THE CENSUS IS THE WHOLE FRONTEND, NOT ONE FEATURE FOLDER (V-29 NEW-5).
 *
 * Both guards below walked `features/marketing` alone and skipped every test file, so the
 * claim they support — "nobody else derives the chip", "no caveat sentence is authored here" —
 * was true only inside their own walk. A frontend-authored paraphrase of the server's first
 * caveat was living one directory outside it, in `app/(core)/marketing/admin/page.tsx`, and a
 * future `siteConnectionStatuses` caller in `app/`, `components/` or any `*.test.ts` would have
 * passed the census unseen. The walk is the four source roots a page can be written in.
 */
const SOURCE_ROOTS = ["app", "components", "features", "lib"] as const;

function frontendSourceFiles(options?: { includeTests?: boolean }): string[] {
  const includeTests = options?.includeTests ?? true;
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".next") continue;
        if (!includeTests && entry.name === "__tests__") continue;
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (!includeTests && /\.test\.tsx?$/.test(entry.name)) continue;
      out.push(full);
    }
  };
  for (const root of SOURCE_ROOTS) walk(path.join(REPO_ROOT, root));
  return out;
}

function relative(file: string): string {
  return path.relative(REPO_ROOT, file);
}

/**
 * Comments stripped, so the CALL census accuses code and not prose. Every file that explains
 * why this rule exists names `siteConnectionStatuses(...)` in its header; a guard that reads
 * those as callers teaches the next agent to stop writing the explanation.
 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("🚨 no caveat sentence is authored in the frontend (V-28 NEW-3, widened V-29 NEW-5)", () => {
  // The server declares the caveats (aidream `google_sync/kinds.py::TAG_MANAGER_READ_CAVEATS`)
  // and every client prints them verbatim. A frontend copy — even a paraphrase, even in a
  // comment, even in an admin map's description — is a second authority that drifts the moment
  // the server edits its own words.
  const CAVEAT_FINGERPRINTS = [
    /workspace draft/i,
    /not what is published/i,
    /invisible here/i,
    /consent banner/i,
    /declared consent settings/i,
  ];
  // The fingerprints are ordinary English, so repo-wide they only accuse a line that is ALSO
  // talking about the thing the server is the authority on. A line about a meeting's consent
  // banner or a graph node being invisible here is not a caveat copy.
  const TRACKING_SUBJECT = /tag manager|\bgtm\b|tracking container|tag container/i;
  // The suites that pin the server's exact words as FIXTURES: they are not a second authority,
  // they are the assertion that we print the server's words unchanged.
  const ALLOWED = new Map<string, string>([
    [
      "features/marketing/tracking/__tests__/trackingSurfaces.test.ts",
      "this file: the fingerprints themselves, plus the server's caveats as fixtures",
    ],
    [
      "features/marketing/tracking/__tests__/trackingHealth.test.ts",
      "pins the server's caveats verbatim as parser fixtures",
    ],
    [
      "features/marketing/tracking/__tests__/SiteTrackingPanel.test.tsx",
      "asserts the panel prints the server's caveats verbatim",
    ],
  ]);

  it("finds no copy of the server's caveat words anywhere a page is written", () => {
    const offenders: string[] = [];
    for (const file of frontendSourceFiles()) {
      const rel = relative(file);
      if (ALLOWED.has(rel)) continue;
      const lines = fs.readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        if (!TRACKING_SUBJECT.test(line)) return;
        for (const pattern of CAVEAT_FINGERPRINTS) {
          if (pattern.test(line)) {
            offenders.push(`${rel}:${index + 1} :: ${pattern}`);
          }
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it("the census reaches outside features/marketing", () => {
    // The bound V-29 NEW-5 named: a guard whose walk is one feature folder proves nothing about
    // the page that carries the copy. If this ever goes false the widening was undone.
    const walked = frontendSourceFiles().map(relative);
    expect(walked).toContain("app/(core)/marketing/admin/page.tsx");
    expect(walked.some((rel) => rel.startsWith("components/"))).toBe(true);
    expect(walked.some((rel) => rel.startsWith("lib/"))).toBe(true);
    expect(walked).toContain(
      "features/marketing/tracking/__tests__/trackingChipSurfaces.test.tsx",
    );
  });
});

describe("🚨 every tracking-chip surface derives through the ONE input (V-28 NEW-1)", () => {
  it("nobody outside the derivation and its one hook calls siteConnectionStatuses()", () => {
    // Four of five chip surfaces called it with no tracking argument, so `thresholdUnavailable`
    // was null BY CONSTRUCTION and the knob's failure reason reached only the panel. The
    // argument is required now, and the UI reaches it through `useSiteConnectionStatuses`
    // alone — so no surface can be built that forgets the snapshot or the knob again. The walk
    // includes test files: a test calling it is fine, a test is where the next caller would be
    // written unseen (V-29 NEW-5).
    const allowed = new Set([
      "features/marketing/lib/site-status.ts",
      "features/marketing/tracking/hooks.ts",
      "features/marketing/tracking/__tests__/trackingSurfaces.test.ts",
    ]);
    const offenders = frontendSourceFiles()
      .filter((file) =>
        /siteConnectionStatuses\s*\(/.test(codeOnly(fs.readFileSync(file, "utf8"))),
      )
      .map(relative)
      .filter((rel) => !allowed.has(rel));
    expect(offenders).toEqual([]);
  });

  it("every renderer of the chip component lets the component read the tracking input", () => {
    const offenders = frontendSourceFiles()
      .filter((file) => /<SiteConnectionChips[\s>]/.test(fs.readFileSync(file, "utf8")))
      .filter((file) => /<SiteConnectionChips[^>]*\btracking=/.test(fs.readFileSync(file, "utf8")))
      .map(relative);
    expect(offenders).toEqual([]);
  });
});
