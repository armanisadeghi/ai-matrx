// features/education/compliance/types.ts
//
// Types for the school-safe COPPA age gate. The age band lives on
// `users.profiles.age_band`; the authoritative AI/data gate is the
// `edu_coppa_gate()` RPC (see migrations/edu_compliance_age_band_coppa.sql).
// This gate REUSES the guardian-consent system — an under-13 account is unblocked
// only by an ACTIVE inbound guardian link, never a second consent store.

/** COPPA age band. `null` = undeclared (nudged, not hard-blocked). */
export type AgeBand = "under_13" | "13_17" | "adult";

/** Why the gate resolved the way it did. */
export type CoppaGateReason =
  | "allowed"
  | "guardian_consent_required"
  | "age_undeclared";

/**
 * The verdict from `edu_coppa_gate()`. `aiAllowed=false` (reason
 * `guardian_consent_required`) is the only block — an under-13 account with no
 * active guardian link. The UI renders a clear "a parent must approve" state.
 */
export interface CoppaGate {
  ageBand: AgeBand | null;
  requiresConsent: boolean;
  hasActiveGuardian: boolean;
  aiAllowed: boolean;
  reason: CoppaGateReason;
}

/** Raw jsonb shape returned by the RPC (snake_case). */
export interface CoppaGateRow {
  age_band: AgeBand | null;
  requires_consent: boolean | null;
  has_active_guardian: boolean;
  ai_allowed: boolean;
  reason: CoppaGateReason;
}

export function mapCoppaGate(row: CoppaGateRow): CoppaGate {
  return {
    ageBand: row.age_band,
    requiresConsent: Boolean(row.requires_consent),
    hasActiveGuardian: Boolean(row.has_active_guardian),
    aiAllowed: Boolean(row.ai_allowed),
    reason: row.reason,
  };
}
