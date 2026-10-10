// features/access-setup/registry.ts
//
// The words the panel shows for each record type that declares an access setup (iam.access_setup).
// The declaration owns WHO and WHAT; this file owns only the labels and where a read-only seat is
// set. A type with no entry still renders, with its keys humanised.

import { hrOrgChartHref, hrPerformanceReviewHref, hrSettingsHref } from "@/features/hr/routes";

export interface AccessSetupTypeConfig {
  /** "review" — used in "Use this for every review in <org>". */
  noun: string;
  seats: Record<string, string>;
  parts: Record<string, string>;
  /** "after they submit" — the phrase for a cell that opens at that stage. */
  stages: Record<string, string>;
  /** Where a seat this person cannot change here is set (null = nowhere to send them). */
  setAt: (seat: string, ctx: { organizationId: string; recordId: string }) => { label: string; href: string } | null;
  /** The seat a small company's owner can take for every record ("hr"). */
  ownerSeat?: string;
  /** Stage knobs shown on the cycle panel: key → label, plus where they are set. */
  knobs?: Record<string, string>;
  knobsHref?: (ctx: { organizationId: string; key: string }) => string;
}

const HR_REVIEW: AccessSetupTypeConfig = {
  noun: "review",
  seats: {
    employee: "Employee",
    manager: "Manager",
    hr: "HR",
    upper_management: "Upper management",
    skip_level: "Skip-level manager",
    peer: "Peers",
    shared_with: "Shared with",
  },
  parts: {
    self_evaluation: "Self-evaluation",
    manager_evaluation: "Manager evaluation",
    peer_input: "Peer feedback",
    peer_nominations: "Peer nominations",
    calibration: "Calibration",
    final_summary: "Final summary",
    discussion: "Discussion",
  },
  stages: {
    self_submitted: "after they submit",
    manager_submitted: "after the manager submits",
    both_submitted: "after both submit",
    manager_may_see_self: "after self-review is in",
    calibrated: "after calibration",
    peer_shared: "once peer feedback is shared",
    shared: "once shared",
    acknowledged: "once acknowledged",
    reopened: "once reopened",
  },
  setAt: (seat, { organizationId, recordId }) => {
    switch (seat) {
      case "employee":
      case "manager":
        return { label: "Set on the review", href: hrPerformanceReviewHref(recordId, organizationId) };
      case "hr":
      case "upper_management":
        return { label: "HR roles", href: hrSettingsHref("access", { org: organizationId }) };
      case "skip_level":
        return { label: "Org chart", href: hrOrgChartHref({ org: organizationId }) };
      default:
        return null;
    }
  },
  ownerSeat: "hr",
  knobs: {
    standard_review_manager_sees_self: "Manager sees self-review",
    standard_review_calibration_required: "Calibration before sharing",
    standard_review_peers_enabled: "Peer feedback",
    standard_review_peer_anonymous: "Anonymous peer feedback",
    standard_review_ack_comment: "Employee acknowledgment comment",
  },
  knobsHref: ({ organizationId, key }) => hrSettingsHref(null, { org: organizationId, focus: key }),
};

const REGISTRY: Record<string, AccessSetupTypeConfig> = { hr_review: HR_REVIEW };

const humanise = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function accessSetupConfig(type: string): AccessSetupTypeConfig {
  return REGISTRY[type] ?? { noun: "record", seats: {}, parts: {}, stages: {}, setAt: () => null };
}

export const seatLabel = (c: AccessSetupTypeConfig, key: string) => c.seats[key] ?? humanise(key);
export const partLabel = (c: AccessSetupTypeConfig, key: string) => c.parts[key] ?? humanise(key);
export const stageLabel = (c: AccessSetupTypeConfig, key: string) => c.stages[key] ?? `at ${humanise(key).toLowerCase()}`;
