// features/mandates/status/mandate-status.ts
//
// THE ONE ANSWER to "what state is this mandate in?" — every surface that
// shows a mandate (admin list, member lists, record header, window, peek,
// feature intelligence cards, dashboard counts) reads its status from here,
// and the list databases classify with the SAME rule
// (migrations/mnd_list_status_facet_2026_09_25.sql), so a filter option can
// never name a status the badge does not show.
//
// There is no `status` column on `mandate.definition`. The status is DERIVED
// from the real fields, worst-first:
//
//   archived  — `deleted_at` is set. Removed; restorable from Trash.
//   disabled  — `is_enabled` is false. Turned off: resolving it refuses, for everyone.
//   draft     — on, but nothing fills it: no Mandate Holder at its own rung,
//               no fallback job, and no live binding at any level. It exists
//               only as a definition; running it refuses.
//   active    — on, and something runs it.
//
// Owner (2026-09-25): "A UI that doesn't CLEARLY show draft vs. active is
// lying to itself when it calls something a draft."

import type { LucideIcon } from "lucide-react";
import { Archive, CircleCheck, CircleDashed, CircleOff } from "lucide-react";
import type { StatusTone } from "@/components/official/status-badge/StatusBadge";

export type MandateStatus = "draft" | "active" | "disabled" | "archived";

/** Worst-first — the order a status facet, a sort and a count read in. */
export const MANDATE_STATUS_ORDER: readonly MandateStatus[] = [
  "draft",
  "disabled",
  "active",
  "archived",
] as const;

export interface MandateStatusFacts {
  /** `mandate.definition.deleted_at`. */
  deletedAt?: string | null;
  /** `mandate.definition.is_enabled`. */
  isEnabled: boolean;
  /**
   * Something fills the job: a default Holder at its own rung, a fallback
   * job, or at least one live binding (from the admin seat), or the
   * resolved winner (from a member's seat).
   */
  hasHolder: boolean;
}

export function mandateStatusOf(facts: MandateStatusFacts): MandateStatus {
  if (facts.deletedAt) return "archived";
  if (!facts.isEnabled) return "disabled";
  if (!facts.hasHolder) return "draft";
  return "active";
}

export interface MandateStatusMeta {
  label: string;
  tone: StatusTone;
  icon: LucideIcon;
  /** One plain sentence: what this status means for the person looking. */
  meaning: string;
}

export const MANDATE_STATUS_META: Record<MandateStatus, MandateStatusMeta> = {
  draft: {
    label: "Draft",
    tone: "warning",
    icon: CircleDashed,
    meaning: "No Mandate Holder yet, so asking for this job is refused. Set one to make it active.",
  },
  active: {
    label: "Active",
    tone: "success",
    icon: CircleCheck,
    meaning: "On, and a Mandate Holder answers it.",
  },
  disabled: {
    label: "Disabled",
    tone: "danger",
    icon: CircleOff,
    meaning: "Turned off: asking for this job is refused for everyone until it is enabled.",
  },
  archived: {
    label: "Archived",
    tone: "neutral",
    icon: Archive,
    meaning: "Removed. It can be restored from Trash.",
  },
};

export function isMandateStatus(value: unknown): value is MandateStatus {
  return (
    value === "draft" || value === "active" || value === "disabled" || value === "archived"
  );
}

/** Facet label for a raw status value (the list databases facet by the key). */
export function mandateStatusLabel(value: string): string {
  return isMandateStatus(value) ? MANDATE_STATUS_META[value].label : value;
}

/** Count rows by status, every status present (zero when none). */
export function countMandateStatuses<T>(
  rows: readonly T[],
  statusOf: (row: T) => MandateStatus,
): Record<MandateStatus, number> {
  const out: Record<MandateStatus, number> = { draft: 0, active: 0, disabled: 0, archived: 0 };
  for (const row of rows) out[statusOf(row)] += 1;
  return out;
}

/**
 * The status of one mandate ROW with its live bindings — for surfaces that
 * hold the definition row itself (record page, window, workspace). Same rule
 * as the admin list database: a default Holder, a fallback job, or any live
 * binding fills it.
 */
export function mandateStatusOfRow(
  mandate: {
    deleted_at?: string | null;
    is_enabled?: boolean | null;
    default_holder_id?: string | null;
    default_holder_version_id?: string | null;
    fallback_mandate_key?: string | null;
  },
  liveBindings: readonly { deleted_at?: string | null }[] = [],
): MandateStatus {
  return mandateStatusOf({
    deletedAt: mandate.deleted_at ?? null,
    isEnabled: mandate.is_enabled !== false,
    hasHolder:
      Boolean(mandate.default_holder_id || mandate.default_holder_version_id) ||
      Boolean(mandate.fallback_mandate_key) ||
      liveBindings.some((b) => !b.deleted_at),
  });
}
