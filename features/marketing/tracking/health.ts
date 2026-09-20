/**
 * THE ONE tracking verdict. The site-list chip, the site page's status board and the
 * `SiteTrackingPanel` all read this, so they can never disagree — the same law that made
 * `features/marketing/lib/site-status.ts` the one place connection statuses are derived.
 *
 * Pure: no fetching, no clock of its own (`now` is always passed in), so a test can prove every
 * state from a fixture row.
 */

import {
  HEADLINE_CHECK_IDS,
  PAGE_RECONCILIATION_CHECK_ID,
  parseTrackingFindings,
  type TagManagerSnapshotRow,
  type TrackingCheck,
  type TrackingFindings,
} from "@/features/marketing/tracking/types";

export type TrackingState = "connected" | "attention" | "off";

export interface TrackingHealth {
  state: TrackingState;
  /** The short chip label — always "Tracking". */
  label: string;
  /** The full name for the status board. */
  name: string;
  /** One sentence, the whole verdict. This is what the chip's title shows. */
  detail: string;
  /** True once the snapshot is older than the organization's knob allows. */
  stale: boolean;
  /** Hours since the snapshot, or null when there has never been one. */
  ageHours: number | null;
  /**
   * Present when the staleness threshold could not be read — PRINTED, never hidden, on every
   * surface that shows this verdict. 🚨 It is not decoration: while it is set, `stale` is
   * always false, so a chip that drops it silently announces "never stale" about a site nobody
   * is judging (Law 4; V-27 NEW-5). It carries the knob reader's own sentence verbatim.
   */
  thresholdUnavailable: string | null;
  findings: TrackingFindings | null;
}

export interface TrackingHealthInput {
  /** The newest live snapshot for this site, or null when there is none. */
  snapshot: TagManagerSnapshotRow | null;
  /** True when the site has a Tag Manager container bound in its integrations. */
  containerBound: boolean;
  /** From the knob; `null` when the knob is unreadable. */
  maxAgeHours: number | null;
  /**
   * The knob reader's sentence when it could NOT be read (`knobs.ts::trackingKnobStandIn`).
   * A caller that has the reason must pass it — this is the one channel by which every surface
   * says why nothing is being called stale.
   */
  thresholdUnavailable?: string | null;
  now: Date;
}

const OFF_DETAIL =
  "No Tag Manager container is bound to this site, so nothing here knows whether it is tracked. Bind a container to find out.";

function labelFor(check: TrackingCheck): string {
  switch (check.id) {
    case "ga4_installed":
      return check.verdict === "pass"
        ? "GA4 installed and firing"
        : "GA4 not installed";
    case "conversion_tracked":
      return check.verdict === "pass"
        ? "contact-form conversion tracked"
        : "contact-form conversion not tracked";
    case "consent_configured":
      return check.verdict === "pass"
        ? "consent configured"
        : "consent not configured";
    default:
      return check.id;
  }
}

/**
 * The PLAN §4.10 sentence, built from the three headline checks in order:
 * "GA4 installed and firing · contact-form conversion not tracked · consent not configured".
 * A check the server did not return is named as unchecked rather than silently dropped.
 */
export function trackingSentence(findings: TrackingFindings): string {
  return HEADLINE_CHECK_IDS.map((id) => {
    const check = findings.checks.find((entry) => entry.id === id);
    if (!check) return `${id.replace(/_/g, " ")} not checked`;
    if (check.verdict === "not_checked") return `${labelFor(check)} not checked`;
    return labelFor(check);
  }).join(" · ");
}

export function trackingHealth(input: TrackingHealthInput): TrackingHealth {
  const base = { label: "Tracking", name: "Tag Manager tracking" } as const;

  if (!input.snapshot) {
    return {
      ...base,
      state: input.containerBound ? "attention" : "off",
      detail: input.containerBound
        ? "A container is bound but this site has never been checked — run a tracking check to see what is firing."
        : OFF_DETAIL,
      stale: false,
      ageHours: null,
      thresholdUnavailable: input.thresholdUnavailable ?? null,
      findings: null,
    };
  }

  const findings = parseTrackingFindings(input.snapshot.findings);
  const taken = new Date(input.snapshot.taken_at);
  const ageHours = Number.isNaN(taken.getTime())
    ? null
    : (input.now.getTime() - taken.getTime()) / 3_600_000;
  const stale =
    input.maxAgeHours !== null && ageHours !== null && ageHours > input.maxAgeHours;

  if (!findings) {
    // Law 4: a stand-in announces itself. A payload we cannot read is not a pass.
    return {
      ...base,
      state: "attention",
      detail:
        "This site's last tracking snapshot is stored in a shape this screen cannot read, so no verdict is being shown. Run a fresh check.",
      stale,
      ageHours,
      thresholdUnavailable: input.thresholdUnavailable ?? null,
      findings: null,
    };
  }

  const headline = HEADLINE_CHECK_IDS.map((id) =>
    findings.checks.find((entry) => entry.id === id),
  );
  const anyFailed = headline.some((check) => check?.verdict === "fail");
  const anyUnchecked = headline.some(
    (check) => !check || check.verdict === "not_checked",
  );
  // The reconciliation is the honesty gate: a container that is not on the live page makes every
  // verdict above it a statement about a container the site does not use.
  const reconciliation = findings.checks.find(
    (check) => check.id === PAGE_RECONCILIATION_CHECK_ID,
  );
  const reconciliationFailed = reconciliation?.verdict === "fail";

  return {
    ...base,
    state:
      anyFailed || reconciliationFailed || anyUnchecked || stale
        ? "attention"
        : "connected",
    detail: reconciliationFailed
      ? `${trackingSentence(findings)} — but this container is not on the live site, so those verdicts describe a container the page does not use.`
      : trackingSentence(findings),
    stale,
    ageHours,
    thresholdUnavailable: input.thresholdUnavailable ?? null,
    findings,
  };
}
