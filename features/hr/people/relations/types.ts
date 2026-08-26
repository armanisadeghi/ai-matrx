// features/hr/people/relations/types.ts
//
// EMPLOYEE RELATIONS — the vocabulary of routes 15 and 16 (SPEC-EMPLOYEES
// §2.2, §4.8, §4.9b).
//
// 🚨 TWO KINDS OF RECORD SHARE ONE LIST AND NOTHING ELSE.
//
//   • `hr.corrective_action` — something the org is doing TO a person. It has a
//     ladder, an acknowledgment, and an outcome.
//   • `hr.incident` — something that HAPPENED, reported by a person. It has
//     states, parties, restricted notes, and (for injuries) an OSHA block.
//
// They are unioned client-side with a `case_kind` discriminant because the two
// audited list doors are separate — there is no server-side union view, and
// asking for one would mean a door that returns rows of two shapes.
//
// 🚨 THE TONE RULE (Arman, R-L1 §F). Complaints and injuries stay CLINICAL AND
// EVIDENTIARY — this is a record somebody may one day read in a deposition.
// The ONE place warmth belongs is the coaching door in §4.8, and that warmth is
// in the door, not in the record. Softening the incident copy would be a
// mistake, not an improvement.

/** Which table a row in the unified list came from. */
export type HrCaseKind = "corrective_action" | "incident";

// ── Incident (SPEC-EMPLOYEES §2.2 route 16) ─────────────────────────────────

export const HR_INCIDENT_STATES = [
  "open",
  "investigating",
  "action-pending",
  "resolved",
  "closed",
  "referred",
] as const;
export type HrIncidentState = (typeof HR_INCIDENT_STATES)[number];

/** The state token the SERVER takes (`hr_incident_advance`), which is snake_case. */
export const HR_INCIDENT_STATE_TOKEN: Record<HrIncidentState, string> = {
  open: "intake",
  investigating: "investigating",
  "action-pending": "action_pending",
  resolved: "resolved",
  closed: "closed",
  referred: "referred",
};

export const HR_INCIDENT_STATE_LABELS: Record<HrIncidentState, string> = {
  open: "Open",
  investigating: "Investigating",
  "action-pending": "Action pending",
  resolved: "Resolved",
  closed: "Closed",
  referred: "Referred",
};

/**
 * The forward path, plus `referred` from anywhere. `closed` is terminal on this
 * surface: re-opening a closed case is a records-governance action, not a
 * dropdown, because closing started the retention clock.
 */
export const HR_INCIDENT_NEXT_STATES: Record<HrIncidentState, HrIncidentState[]> = {
  open: ["investigating", "referred"],
  investigating: ["action-pending", "resolved", "referred"],
  "action-pending": ["resolved", "referred"],
  resolved: ["closed", "referred"],
  closed: [],
  referred: [],
};

export const HR_INCIDENT_KINDS = [
  "injury",
  "illness",
  "near_miss",
  "safety",
  "complaint",
  "ethics",
  "harassment",
  "discrimination",
  "other",
] as const;
export type HrIncidentKind = (typeof HR_INCIDENT_KINDS)[number];

export const HR_INCIDENT_KIND_LABELS: Record<HrIncidentKind, string> = {
  injury: "Injury",
  illness: "Illness",
  near_miss: "Near miss",
  safety: "Safety",
  complaint: "Complaint",
  ethics: "Ethics",
  harassment: "Harassment",
  discrimination: "Discrimination",
  other: "Other",
};

/**
 * Which kinds default the subject out of their own record (§4.9b).
 *
 * A complaint about a person must not be readable by that person; a near-miss
 * on a forklift must be, because the person involved is the one who can explain
 * it. This is a DEFAULT the intake form shows and the reporter can change — the
 * real enforcement is `hr.incident_excluded()` on the server.
 */
export function defaultSubjectExcluded(kind: HrIncidentKind): boolean {
  return (
    kind === "complaint" ||
    kind === "ethics" ||
    kind === "harassment" ||
    kind === "discrimination"
  );
}

/** Injuries and illnesses capture the OSHA 300/301 set AT INTAKE — it cannot be captured later. */
export function needsOshaCapture(kind: HrIncidentKind): boolean {
  return kind === "injury" || kind === "illness";
}

export const HR_INCIDENT_PARTY_ROLES = [
  "witness",
  "involved",
  "accused",
  "reporter",
  "investigator",
  "responder",
  "third_party",
] as const;
export type HrIncidentPartyRole = (typeof HR_INCIDENT_PARTY_ROLES)[number];

export const HR_INCIDENT_PARTY_ROLE_LABELS: Record<HrIncidentPartyRole, string> = {
  witness: "Witness",
  involved: "Involved",
  accused: "Accused",
  reporter: "Reporter",
  investigator: "Investigator",
  responder: "Responder",
  third_party: "Third party",
};

export const HR_RESTRICTED_NOTE_KINDS = [
  "investigation",
  "witness_statement",
  "medical_certification",
  "accommodation_detail",
  "background_result",
  "legal_advice",
  "executive_only",
] as const;
export type HrRestrictedNoteKind = (typeof HR_RESTRICTED_NOTE_KINDS)[number];

export const HR_RESTRICTED_NOTE_KIND_LABELS: Record<HrRestrictedNoteKind, string> = {
  investigation: "Investigation note",
  witness_statement: "Witness statement",
  medical_certification: "Medical certification",
  accommodation_detail: "Accommodation detail",
  background_result: "Background result",
  legal_advice: "Legal advice",
  executive_only: "Executive only",
};

// ── Corrective action (SPEC-EMPLOYEES §4.8) ─────────────────────────────────

export const HR_CORRECTIVE_ACTION_STATES = [
  "issued",
  "acknowledged",
  "follow-up-due",
  "outcome-recorded",
] as const;
export type HrCorrectiveActionState = (typeof HR_CORRECTIVE_ACTION_STATES)[number];

export const HR_CORRECTIVE_ACTION_STATE_LABELS: Record<
  HrCorrectiveActionState,
  string
> = {
  issued: "Issued",
  acknowledged: "Acknowledged",
  "follow-up-due": "Follow-up due",
  "outcome-recorded": "Outcome recorded",
};

/**
 * THE LADDER, in order. `coaching` is rung ZERO and it is the whole point of
 * Arman's two-door ruling: a manager who has to open something called
 * *Corrective Action* to record a good coaching conversation simply will not
 * record it — which is exactly how undocumented discipline happens.
 */
export const HR_CORRECTIVE_ACTION_LEVELS = [
  "coaching",
  "verbal",
  "written",
  "final_written",
  "pip",
  "suspension",
  "termination_recommendation",
] as const;
export type HrCorrectiveActionLevel = (typeof HR_CORRECTIVE_ACTION_LEVELS)[number];

export const HR_CORRECTIVE_ACTION_LEVEL_LABELS: Record<
  HrCorrectiveActionLevel,
  string
> = {
  coaching: "Coaching conversation",
  verbal: "Verbal warning",
  written: "Written warning",
  final_written: "Final written warning",
  pip: "Performance improvement plan",
  suspension: "Suspension",
  termination_recommendation: "Recommendation to separate",
};

export function ladderRung(level: HrCorrectiveActionLevel): number {
  return HR_CORRECTIVE_ACTION_LEVELS.indexOf(level);
}

/**
 * 🚨 SKIPPING THE LADDER WARNS, IT NEVER BLOCKS.
 *
 * A first offence can genuinely be a suspension, and a system that refuses to
 * record what actually happened produces a record that is worse than none. The
 * warning exists so the issuer SEES the prior chain (`prior_action_id`) before
 * they commit, not to stop them. Governed by the knob
 * `hr.relations.corrective_action_ladder_skip`.
 */
export const HR_LADDER_SKIP_KNOB = "hr.relations.corrective_action_ladder_skip";

export function ladderSkipWarning(
  level: HrCorrectiveActionLevel,
  priorLevel: HrCorrectiveActionLevel | null,
): string | null {
  const next = priorLevel === null ? 0 : ladderRung(priorLevel) + 1;
  if (ladderRung(level) <= next) return null;
  const expected = HR_CORRECTIVE_ACTION_LEVELS[Math.min(next, HR_CORRECTIVE_ACTION_LEVELS.length - 1)];
  return priorLevel === null
    ? `This person has no prior corrective action on file. The usual next step would be ${HR_CORRECTIVE_ACTION_LEVEL_LABELS[expected].toLowerCase()}.`
    : `The last step on file was ${HR_CORRECTIVE_ACTION_LEVEL_LABELS[priorLevel].toLowerCase()}. The usual next step would be ${HR_CORRECTIVE_ACTION_LEVEL_LABELS[expected].toLowerCase()}.`;
}

export const HR_ACKNOWLEDGMENT_KINDS = [
  "esign",
  "wet_signature",
  "verbal_witnessed",
  "refused",
] as const;
export type HrAcknowledgmentKind = (typeof HR_ACKNOWLEDGMENT_KINDS)[number];

export const HR_ACKNOWLEDGMENT_KIND_LABELS: Record<HrAcknowledgmentKind, string> = {
  esign: "Sign electronically",
  wet_signature: "Sign on paper",
  verbal_witnessed: "Verbal, with a witness",
  refused: "Declined to sign",
};

/**
 * 🚨 KIOSK-ONLY STAFF ARE FIRST-CLASS. For a subject with no `login_user_id`,
 * `esign` is ABSENT — not disabled, not "requires a login". They get paper or a
 * witnessed verbal, and the printed copy is the delivery. Nothing in this
 * module may assume `login_user_id IS NOT NULL` (SPEC-ACCESS T-17).
 */
export function acknowledgmentKindsFor(
  subjectHasLogin: boolean,
): HrAcknowledgmentKind[] {
  return subjectHasLogin
    ? ["esign", "wet_signature", "verbal_witnessed", "refused"]
    : ["wet_signature", "verbal_witnessed", "refused"];
}

export const HR_CORRECTIVE_ACTION_OUTCOMES = [
  "resolved",
  "escalated",
  "expired",
  "rescinded",
  "led_to_separation",
] as const;
export type HrCorrectiveActionOutcome =
  (typeof HR_CORRECTIVE_ACTION_OUTCOMES)[number];

export const HR_CORRECTIVE_ACTION_OUTCOME_LABELS: Record<
  HrCorrectiveActionOutcome,
  string
> = {
  resolved: "Resolved",
  escalated: "Escalated to a further step",
  expired: "Expired",
  // "The record is NOT deleted. Rescission is a state with a reason." (§4.8)
  rescinded: "Rescinded",
  led_to_separation: "Led to separation",
};

// ── The wire rows ───────────────────────────────────────────────────────────
//
// Hand-written against the audited list doors' payloads. Everything is
// optional-or-nullable on purpose: the RESTRICTED tier strips keys per viewer
// exactly the way `hr_employee_profile.personal` does, so `key in row` is a
// real access answer and a null is a real "nobody filled this in".

export type HrIncidentRow = {
  id: string;
  organization_id?: string | null;
  incident_kind: HrIncidentKind | string;
  state: string;
  occurred_at: string | null;
  reported_at: string | null;
  summary?: string | null;
  redacted_summary?: string | null;
  subject_employment_id?: string | null;
  subject_name?: string | null;
  /** ABSENT for an anonymous report. The page never renders an empty "Reported by". */
  reporter_employment_id?: string | null;
  reporter_name?: string | null;
  reported_anonymously?: boolean | null;
  assignee_employment_id?: string | null;
  assignee_name?: string | null;
  establishment_id?: string | null;
  establishment_name?: string | null;
  osha_recordable?: boolean | null;
  osha_privacy_case?: boolean | null;
  osha_fields?: Record<string, unknown> | null;
  resolution_summary?: string | null;
  resolved_at?: string | null;
  legal_hold_id?: string | null;
  legal_hold_origin?: string | null;
  subject_excluded?: boolean | null;
};

export type HrCorrectiveActionRow = {
  id: string;
  organization_id?: string | null;
  level: HrCorrectiveActionLevel | string;
  state: string;
  issued_on: string | null;
  incident_on: string | null;
  subject_employment_id?: string | null;
  subject_name?: string | null;
  /** null → `esign` is ABSENT from the acknowledgment choices. */
  subject_login_user_id?: string | null;
  issuer_employment_id?: string | null;
  issuer_name?: string | null;
  policy_cited?: string | null;
  policy_document_file_id?: string | null;
  summary?: string | null;
  expected_improvement?: string | null;
  consequence_if_unmet?: string | null;
  follow_up_on?: string | null;
  reason_category?: string | null;
  prior_action_id?: string | null;
  prior_action_level?: HrCorrectiveActionLevel | string | null;
  acknowledgment_kind?: HrAcknowledgmentKind | string | null;
  employee_acknowledged_at?: string | null;
  /** THE EMPLOYEE'S OWN WORDS. The issuer can never edit this. */
  employee_statement?: string | null;
  esign_request_id?: string | null;
  outcome?: string | null;
  attendance_exception_id?: string | null;
  legal_hold_id?: string | null;
  legal_hold_origin?: string | null;
};

/** One row of the unified route-15 list. */
export type HrRelationsCase = {
  id: string;
  caseKind: HrCaseKind;
  /** `reported_at` for an incident, `issued_on` for a corrective action. */
  occurredOn: string | null;
  /** The kind label a human reads: "Harassment", "Written warning". */
  kindLabel: string;
  stateLabel: string;
  state: string;
  subjectName: string | null;
  subjectEmploymentId: string | null;
  assigneeName: string | null;
  oshaRecordable: boolean | null;
  underLegalHold: boolean;
  /** Whichever summary this viewer was given — full, redacted, or none. */
  summary: string | null;
  incident?: HrIncidentRow;
  correctiveAction?: HrCorrectiveActionRow;
};

export type HrIncidentParty = {
  id: string;
  role: HrIncidentPartyRole | string;
  employment_id?: string | null;
  display_name?: string | null;
  external_name?: string | null;
  note?: string | null;
  added_at?: string | null;
};

export type HrRestrictedNote = {
  id: string;
  note_kind: HrRestrictedNoteKind | string;
  /** Present ONLY through the note's own owner lane. */
  body?: string | null;
  /** What a non-owner may be given instead — often nothing at all. */
  redacted_summary?: string | null;
  author_name?: string | null;
  created_at?: string | null;
  is_owner?: boolean | null;
};

/** What `hr_restricted_get` returns for one case, either kind. */
export type HrCaseDetail = {
  case_kind?: HrCaseKind | string;
  incident?: HrIncidentRow;
  corrective_action?: HrCorrectiveActionRow;
  parties?: HrIncidentParty[];
  /** ABSENT for a non-owner. An owner-only panel, never a greyed one. */
  restricted_notes?: HrRestrictedNote[];
  attachments?: { file_id: string; name?: string | null }[];
  capabilities?: string[];
  /** The viewer's relationship to this case, resolved server-side. */
  viewer_role?: "investigator" | "issuer" | "reporter" | "subject" | "hr" | string;
};
