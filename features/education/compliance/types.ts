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
 * - `age_undeclared` — no age band on a SIGNED-IN account. This does NOT block
 *   (`aiAllowed=true`) — it only nudges: `useAiComplianceGate` asks for the band
 *   inline and resumes. Hard-blocking undeclared signed-in accounts broke ~232
 *   real users on 2026-08-17, so it stays a nudge.
 * - `guest_age_undeclared` — an ANONYMOUS (guest) session with no age band.
 *   Since 2026-08-19 this BLOCKS (`aiAllowed=false`): a guest can't be an
 *   established account and can't hold consent, so it must declare before
 *   education AI. One tap in `AgeDeclarationDialog` (declare 13-17/adult → resume;
 *   under-13 → guardian flow), or sign in. Closes the "sign out and keep using AI
 *   as a guest" hole.
 */
export type CoppaGateReason =
  | "allowed"
  | "guardian_consent_required"
  | "guardian_verification_pending"
  | "age_undeclared"
  | "guest_age_undeclared";

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
  /**
   * An anonymous (guest) session. Since 2026-08-19 a guest with no declared age
   * band is BLOCKED (`reason='guest_age_undeclared'`) and asked to declare — the
   * same one-tap prompt a signed-in learner gets. A guest who declares an age is
   * allowed by the normal rules.
   */
  isAnonymous: boolean;
  aiAllowed: boolean;
  reason: CoppaGateReason;
}

/** Raw jsonb shape returned by the RPC (snake_case). */
export interface CoppaGateRow {
  age_band: AgeBand | null;
  requires_consent: boolean | null;
  has_active_guardian: boolean;
  has_verified_guardian: boolean;
  is_anonymous?: boolean;
  ai_allowed: boolean;
  reason: CoppaGateReason;
}

export function mapCoppaGate(row: CoppaGateRow): CoppaGate {
  return {
    ageBand: row.age_band,
    requiresConsent: Boolean(row.requires_consent),
    hasActiveGuardian: Boolean(row.has_active_guardian),
    hasVerifiedGuardian: Boolean(row.has_verified_guardian),
    isAnonymous: Boolean(row.is_anonymous),
    aiAllowed: Boolean(row.ai_allowed),
    reason: row.reason,
  };
}

/**
 * Outcome of an age-band write. `blocked` is the COPPA hard block: a child may
 * never self-declare out of `under_13` — that change is refused (band unchanged,
 * refusal audited) and routed to a VERIFIED guardian via
 * `coppaService.guardianSetAgeBand`. Downgrades and first declarations always
 * proceed, and `13_17 → adult` stays open (it is not a COPPA escape).
 */
export type AgeBandWriteStatus = "ok" | "blocked";

export interface AgeBandWriteResult {
  status: AgeBandWriteStatus;
  /** The band now stored — unchanged from before when `status === "blocked"`. */
  ageBand: AgeBand | null;
  reason: string;
  /** Present on a block: safe to show the learner verbatim. */
  message?: string;
}

/** Raw jsonb returned by `edu_set_age_band` / `edu_guardian_set_age_band`. */
export interface AgeBandWriteRow {
  status: AgeBandWriteStatus;
  age_band: AgeBand | null;
  reason: string;
  message?: string;
}

export function mapAgeBandWrite(row: AgeBandWriteRow): AgeBandWriteResult {
  return {
    status: row.status,
    ageBand: row.age_band,
    reason: row.reason,
    message: row.message,
  };
}
