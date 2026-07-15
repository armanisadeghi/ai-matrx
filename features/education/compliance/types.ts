// features/education/compliance/types.ts
//
// Types for the school-safe COPPA age gate. The age band lives on
// `users.profiles.age_band`; the authoritative AI/data gate is the
// `edu_coppa_gate()` RPC (see migrations/edu_compliance_age_band_coppa.sql).
// This gate REUSES the guardian-consent system — an under-13 account is unblocked
// only by an ACTIVE inbound guardian link, never a second consent store.

/** COPPA age band. `null` = undeclared (nudged, not hard-blocked). */
export type AgeBand = "under_13" | "13_17" | "adult";

/**
 * Why the gate resolved the way it did.
 * - `guardian_consent_required` — under-13, NO active guardian link (ask a parent).
 * - `guardian_verification_pending` — under-13 with an active link, but the parent
 *   has NOT yet completed a *verifiable* consent step (COPPA §312.5). The child is
 *   still blocked; the UI shows "waiting for a parent to verify".
 */
export type CoppaGateReason =
  | "allowed"
  | "guardian_consent_required"
  | "guardian_verification_pending"
  | "age_undeclared";

/**
 * The verdict from `edu_coppa_gate()`. `aiAllowed=false` is the block. For an
 * under-13 it is allowed ONLY when a guardian link is VERIFIED
 * (`hasVerifiedGuardian`) — a mere active link (consent captured but not
 * verifiable) blocks with reason `guardian_verification_pending`. The UI renders
 * a clear "a parent must approve" / "waiting for a parent to verify" state.
 */
export interface CoppaGate {
  ageBand: AgeBand | null;
  requiresConsent: boolean;
  hasActiveGuardian: boolean;
  /** An active guardian link that completed a verifiable-consent method. */
  hasVerifiedGuardian: boolean;
  aiAllowed: boolean;
  reason: CoppaGateReason;
}

/** Raw jsonb shape returned by the RPC (snake_case). */
export interface CoppaGateRow {
  age_band: AgeBand | null;
  requires_consent: boolean | null;
  has_active_guardian: boolean;
  has_verified_guardian: boolean;
  ai_allowed: boolean;
  reason: CoppaGateReason;
}

export function mapCoppaGate(row: CoppaGateRow): CoppaGate {
  return {
    ageBand: row.age_band,
    requiresConsent: Boolean(row.requires_consent),
    hasActiveGuardian: Boolean(row.has_active_guardian),
    hasVerifiedGuardian: Boolean(row.has_verified_guardian),
    aiAllowed: Boolean(row.ai_allowed),
    reason: row.reason,
  };
}
