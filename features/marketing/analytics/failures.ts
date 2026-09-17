/**
 * GA4 failure classification — quota and access, each a NAMED visible state
 * with its own door (google-native PLAN §4.9: "Quota exhaustion is a visible
 * self-healing state"; §5.3: "'Connected' is never a boolean that lies").
 *
 * Access failures reuse `classifyGscAccessFailure` — its patterns are Google
 * OAuth / credential-resolution vocabulary, not Search Console specifics, so
 * forking a second copy for Analytics would be the defect. Quota is the one
 * Analytics-shaped addition: the GA4 Data API refuses per-property tokens per
 * hour and per day, and that refusal HEALS on its own once the window rolls.
 */

import {
  classifyGscAccessFailure,
  type GscAccessFailure,
} from "@/features/marketing/google/gsc-property";

export interface AnalyticsFailureVerdict {
  kind: "quota" | "access" | "other";
  reason: string;
  remedy: string;
  /** True when waiting alone fixes it — the UI says so instead of nagging. */
  selfHealing: boolean;
}

const QUOTA_PATTERNS: readonly RegExp[] = [
  /quota/i,
  /RESOURCE_EXHAUSTED/i,
  /rate.?limit/i,
  /\b429\b/,
  /tokens? (per|remaining)/i,
];

export function classifyAnalyticsFailure(
  text: string | null | undefined,
): AnalyticsFailureVerdict | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  if (QUOTA_PATTERNS.some((pattern) => pattern.test(value))) {
    return {
      kind: "quota",
      reason:
        "Google Analytics has temporarily stopped answering because this property used up its share of Google's reporting requests. Nothing is broken and nothing was lost.",
      remedy:
        "Google refills the allowance hourly, and the nightly sync will fill the gap on its own. Syncing again right now will most likely be refused.",
      selfHealing: true,
    };
  }
  const access: GscAccessFailure | null = classifyGscAccessFailure(value);
  if (access) {
    return {
      kind: "access",
      reason: access.reason.replace("Search Console", "Analytics"),
      remedy: access.remedy.replace(
        "the site's Search Console property binding",
        "the site's Google Analytics property binding",
      ),
      selfHealing: false,
    };
  }
  return { kind: "other", reason: value, remedy: "", selfHealing: false };
}
