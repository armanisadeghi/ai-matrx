/**
 * Finding lifecycle vocabulary + write-shape validators — the ONE place the
 * `web.finding` status words and the two user-owned triage verbs are spelled
 * out.
 *
 * Why this module exists: the same vocabulary is now read by three different
 * kinds of caller, and a re-typed literal in any one of them is a silent lie.
 *
 *   - the CONTROLS  (`AnalysisBadges` filter options, the status badge)
 *   - the QUERY layer (`analysis-service` validating a status filter)
 *   - the SURFACE   (`marketing-findings.manifest` writeTargets, whose
 *                    model-facing description enumerates what an agent may
 *                    send, and `FindingWriteTargets`, which validates it)
 *
 * Pure data + pure functions ONLY — no React, no supabase, no imports. The
 * surface manifest is loaded by the drift checker outside a browser, so
 * anything this module pulls in, that checker pulls in too.
 *
 * The DIVISION OF LABOUR this encodes (see `finding-mutations.ts`): the
 * analyzer owns detection — it opens, refreshes, resolves and reopens
 * findings, and never touches suppression. The USER owns judgement, and has
 * exactly two verbs: "I've seen this" (acknowledge) and "this is intentional,
 * stop telling me" (suppress, with a reason). Those two verbs — and only
 * those two — are what this module lets a caller write.
 */

/** Every `web.finding.status` value, in display order. */
export const FINDING_STATUS_VALUES = [
  "open",
  "acknowledged",
  "reopened",
  "resolved",
] as const;

export type FindingStatus = (typeof FINDING_STATUS_VALUES)[number];

/**
 * The same vocabulary with its canonical labels, for filter/select controls.
 * Deliberately a MUTABLE array type: the data-table's `filterOptions` takes
 * `{ value, label }[]`, and a `readonly` tuple cannot be passed to it.
 */
export const FINDING_STATUS_OPTIONS: { value: FindingStatus; label: string }[] =
  [
    { value: "open", label: "Open" },
    { value: "acknowledged", label: "Acknowledged" },
    { value: "reopened", label: "Reopened" },
    { value: "resolved", label: "Resolved" },
  ];

/**
 * The statuses a HUMAN (or an agent proposing on their behalf) may write.
 *
 * `resolved` and `reopened` are the analyzer's alone — only a passing
 * re-analysis resolves a finding, and only a re-detection reopens one. A
 * click, or an agent, that claimed either would be forging evidence.
 */
export const USER_WRITABLE_FINDING_STATUSES = ["acknowledged", "open"] as const;

export type UserWritableFindingStatus =
  (typeof USER_WRITABLE_FINDING_STATUSES)[number];

/**
 * The statuses an acknowledgement may be written FROM — the same condition
 * the detail header's "I'm on it" button renders under.
 */
export const ACKNOWLEDGEABLE_FROM_STATUSES: readonly FindingStatus[] = [
  "open",
  "reopened",
];

/** A suppression reason is the record — long enough to explain, not an essay. */
export const SUPPRESSION_REASON_MAX_LENGTH = 500;

/** Wire value for the `finding_suppression` write target. */
export interface FindingSuppressionWrite {
  suppressed: boolean;
  /** Required when suppressing, forbidden when lifting. */
  reason?: string;
}

const SUPPRESSION_KEYS = ["suppressed", "reason"];

/**
 * Validate the `finding_suppression` wire value. THROWS on any bad shape —
 * the writeback seam turns the throw into the error envelope the agent reads,
 * and nothing is written. Never coerces: a wrong value is the caller's
 * mistake to hear about, not something to guess at.
 */
export function parseFindingSuppressionWrite(
  value: unknown,
): FindingSuppressionWrite {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      "finding_suppression expects an object: { suppressed: boolean, reason?: string }.",
    );
  }
  const record = value as Record<string, unknown>;

  const unknownKeys = Object.keys(record).filter(
    (key) => !SUPPRESSION_KEYS.includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new Error(
      `finding_suppression: unexpected key(s) ${unknownKeys.join(
        ", ",
      )}. Accepted keys are ${SUPPRESSION_KEYS.join(" and ")}.`,
    );
  }

  const suppressed = record.suppressed;
  if (typeof suppressed !== "boolean") {
    throw new Error(
      "finding_suppression: suppressed is required and must be a boolean (true to suppress, false to lift).",
    );
  }

  const rawReason = record.reason;
  if (!suppressed) {
    // Lifting takes no reason — the row's reason is cleared. Accepting one
    // silently would report success for text that was never stored.
    if (rawReason !== undefined && rawReason !== null) {
      throw new Error(
        "finding_suppression: reason must be omitted when suppressed is false — lifting a suppression clears the recorded reason.",
      );
    }
    return { suppressed: false };
  }

  if (typeof rawReason !== "string") {
    throw new Error(
      "finding_suppression: reason is required when suppressed is true and must be a string — say why this finding is intentional for this site.",
    );
  }
  const reason = rawReason.trim();
  if (!reason) {
    throw new Error(
      "finding_suppression: reason cannot be empty — the reason is the record.",
    );
  }
  if (reason.length > SUPPRESSION_REASON_MAX_LENGTH) {
    throw new Error(
      `finding_suppression: reason must be ${SUPPRESSION_REASON_MAX_LENGTH} characters or fewer (received ${reason.length}).`,
    );
  }
  return { suppressed: true, reason };
}

/**
 * Validate the `finding_lifecycle_status` wire value against the REAL status
 * vocabulary. THROWS on anything outside the user-writable subset — naming
 * `resolved` or `reopened` explicitly, because those are the two an agent is
 * most likely to reach for and the two it must never write.
 */
export function parseFindingStatusWrite(
  value: unknown,
): UserWritableFindingStatus {
  if (typeof value !== "string") {
    throw new Error(
      `finding_lifecycle_status expects a string, one of ${USER_WRITABLE_FINDING_STATUSES.join(
        " | ",
      )}.`,
    );
  }
  const status = value.trim();
  if (
    (USER_WRITABLE_FINDING_STATUSES as readonly string[]).includes(status)
  ) {
    return status as UserWritableFindingStatus;
  }
  if ((FINDING_STATUS_VALUES as readonly string[]).includes(status)) {
    throw new Error(
      `finding_lifecycle_status: "${status}" is written by the analysis pipeline, not from this page. Only ${USER_WRITABLE_FINDING_STATUSES.join(
        " | ",
      )} may be set here.`,
    );
  }
  throw new Error(
    `finding_lifecycle_status: "${status}" is not a finding status. Expected one of ${USER_WRITABLE_FINDING_STATUSES.join(
      " | ",
    )}.`,
  );
}
