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

/**
 * 🚨 FOR THESE THREE KINDS THE EXCLUSION IS NOT A DEFAULT — IT IS THE PLATFORM'S,
 * AND NOBODY CAN TURN IT OFF.
 *
 * `public.hr_incident_create` computes it before it writes anything:
 *
 *     v_locked := v_kind in ('harassment','discrimination','ethics');
 *     v_excluded := case when v_locked then true … end;
 *
 * — the payload's `subject_excluded` is not even consulted on that branch, and
 * the knob `hr.relations.complaint_subject_excluded_default` is scoped to "other
 * kinds only" for the same reason (§7). So a SWITCH rendered next to a
 * harassment report is a control that cannot do the thing it offers: it moved,
 * it looked answered, and the server ignored it. A control that lies about an
 * access decision on a harassment complaint is worse than no control, because
 * the person filing it is deciding whether they are safe.
 *
 * `defaultSubjectExcluded` still governs `complaint` — where the org's knob
 * really can loosen it — and safety/near-miss/injury, where the reporter really
 * can tighten it.
 */
export function subjectExclusionLocked(kind: HrIncidentKind): boolean {
  return (
    kind === "harassment" || kind === "discrimination" || kind === "ethics"
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
  "declined",
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
  // §4.8 F4. A refusal is a valid OUTCOME of the acknowledgment step, not a
  // stuck flow — and it is NOT "Acknowledged". Calling it that on a chip would
  // put a false statement about a person on the one record that may be read in
  // a deposition. Same words as the acknowledgment choice that produced it.
  declined: "Declined to sign",
  "follow-up-due": "Follow-up due",
  "outcome-recorded": "Outcome recorded",
};

/**
 * 🚨 `hr.corrective_action` HAS NO `state` COLUMN, AND IT NEVER HAS.
 *
 * Read off `information_schema.columns` and off a live `hr_confidential_get`
 * payload on 2026-08-29 — the door emits 36 keys and `state` is not one of them.
 * `hr.incident` has a `state` column; the corrective action carries a
 * LIFECYCLE spread across `employee_acknowledged_at`,
 * `employee_acknowledgement_kind`, `follow_up_on` and `outcome`.
 *
 * So `String(row.state)` produced the literal string `"undefined"`, which then
 * missed every key in the label map and fell through the `?? state` fallback to
 * render **`undefined`** as the state chip on EVERY corrective action, in the
 * queue and on the case page. The fallback is what hid it: a lookup miss that
 * shows the raw value looks deliberate, so nothing about the render said the
 * field was absent rather than unmapped.
 *
 * The derivation lives HERE, once, because the previous arrangement had two
 * call sites independently spelling a column that does not exist.
 */
export function correctiveActionState(row: {
  outcome?: string | null;
  follow_up_on?: string | null;
  employee_acknowledged_at?: string | null;
  employee_acknowledgement_kind?: string | null;
}): HrCorrectiveActionState {
  // Terminal: §4.8 node I. An outcome is recorded and the ladder step is closed.
  if (row.outcome) return "outcome-recorded";
  // A refusal leaves `employee_acknowledged_at` NULL on purpose — nobody
  // acknowledged anything — and stamps the kind. Checked BEFORE the
  // acknowledged branch for exactly that reason.
  if (row.employee_acknowledgement_kind === "refused") return "declined";
  if (row.employee_acknowledged_at) {
    // Acknowledged, but a follow-up date has come due and no outcome is on file.
    if (row.follow_up_on && row.follow_up_on <= todayIsoDay()) {
      return "follow-up-due";
    }
    return "acknowledged";
  }
  return "issued";
}

/** Local calendar day as `YYYY-MM-DD`, to compare against a DATE column. */
function todayIsoDay(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

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

// 🚨 EVERY FIELD BELOW WAS RE-READ OFF `hr.incident` AND `hr._project_row` ON
// 2026-08-30, AND SEVEN OF THEM DID NOT EXIST. `redacted_summary`,
// `assignee_employment_id`, `assignee_name`, `reporter_name`,
// `establishment_name`, `osha_fields`, `legal_hold_id` and `legal_hold_origin`
// were all declared here and none of them has ever been on the wire — an
// optional key that names nothing is indistinguishable from a key the viewer's
// tier stripped, which is exactly how "the legal-hold banner never renders"
// survived a build. The door emits the flat table row plus `subject_name`, and
// that is what this type says now.
export type HrIncidentRow = {
  id: string;
  organization_id?: string | null;
  incident_kind: HrIncidentKind | string;
  state: string;
  occurred_at: string | null;
  reported_at: string | null;
  summary?: string | null;
  subject_employment_id?: string | null;
  /** Added by `hr._project_row` from the subject employment, per viewer. */
  subject_name?: string | null;
  /** NULL for an anonymous report. The page never renders an empty "Reported by". */
  reporter_employment_id?: string | null;
  reported_anonymously?: boolean | null;
  assigned_to_employment_id?: string | null;
  establishment_id?: string | null;
  follow_up_on?: string | null;
  osha_recordable?: boolean | null;
  osha_privacy_case?: boolean | null;
  /** The OSHA 300/301 set is FLAT on the row — never a nested `osha_fields` bag. */
  injury_body_part?: string | null;
  injury_nature?: string | null;
  injury_object_substance?: string | null;
  injury_event_description?: string | null;
  treatment_beyond_first_aid?: boolean | null;
  treatment_facility?: string | null;
  physician_name?: string | null;
  hospitalized_overnight?: boolean | null;
  emergency_room?: boolean | null;
  work_restrictions?: string | null;
  return_to_work_on?: string | null;
  workers_comp_claim_ref?: string | null;
  provider_ref?: string | null;
  resolution_summary?: string | null;
  resolved_at?: string | null;
  /** `{{RETAIN}}`. There is no `legal_hold_id` and there never was. */
  legal_hold_count?: number | null;
  retention_trigger_at?: string | null;
  subject_excluded?: boolean | null;
  /** Set by `hr_incident_void` (hr_l1_76). A void is NEVER hidden. */
  voided_at?: string | null;
  void_reason?: string | null;
};

// 🚨 RE-READ OFF A LIVE `hr_confidential_get` PAYLOAD ON 2026-08-29 (36 keys,
// as the issuer, in a rolled-back transaction) AND OFF
// `information_schema.columns`. SIX DECLARED FIELDS DID NOT EXIST:
//
//   `state`                  → there is no state column; see `correctiveActionState`
//   `acknowledgment_kind`    → the column is `employee_acknowledgement_kind`
//                              (British spelling, and prefixed)
//   `issuer_name`            → `hr._project_row` names only the SUBJECT; the
//                              issuer is `issued_by_employment_id`, a uuid
//   `issuer_employment_id`   → the column is `issued_by_employment_id`
//   `prior_action_level`     → only `prior_action_id` is on the row
//   `subject_login_user_id`  → lives on `hr.employee`, never projected here
//   `reason_category`        → no such column
//
// The first two rendered wrong words to a user. The rest rendered as absent,
// which the panel's "absent stays absent" law makes safe but silently dead: the
// "Issued by" line and the ladder-chain sentence could never appear, and `esign`
// was absent from the acknowledgment choices for EVERY subject, including ones
// who do hold a login. Those are recorded as findings rather than papered over
// with a guess — the door has to project them before a surface can show them.
export type HrCorrectiveActionRow = {
  id: string;
  organization_id?: string | null;
  level: HrCorrectiveActionLevel | string;
  issued_on: string | null;
  incident_on: string | null;
  /** `hr.corrective_action` names its subject `employment_id`, not `subject_…`. */
  employment_id?: string | null;
  subject_name?: string | null;
  /** The ISSUER, as a uuid. The door projects no display name for them. */
  issued_by_employment_id?: string | null;
  policy_cited?: string | null;
  policy_document_file_id?: string | null;
  summary?: string | null;
  expected_improvement?: string | null;
  consequence_if_unmet?: string | null;
  follow_up_on?: string | null;
  /** §4.8 node H → I — what actually happened at the follow-up. */
  follow_up_outcome?: string | null;
  prior_action_id?: string | null;
  /** `esign` · `wet_signature` · `verbal_witnessed` · `refused`. */
  employee_acknowledgement_kind?: HrAcknowledgmentKind | string | null;
  /** NULL on a refusal, by design — nobody acknowledged anything. */
  employee_acknowledged_at?: string | null;
  /** THE EMPLOYEE'S OWN WORDS. The issuer can never edit this. */
  employee_statement?: string | null;
  esign_request_id?: string | null;
  outcome?: string | null;
  outcome_on?: string | null;
  attendance_exception_id?: string | null;
  legal_hold_count?: number | null;
  /**
   * Where the acknowledgment's FACTS land, write-once, from
   * `hr.corrective_ack_wf_apply`: `metadata.acknowledgement.{witness_name,
   * refusal_note, signed_file_id, recorded_off_platform, …}`. There is no
   * column for a witness — this is the only place one is kept.
   */
  metadata?: Record<string, unknown> | null;
};

/** The acknowledgment facts the apply function wrote, or `null` if none. */
export function acknowledgementFacts(
  row: Pick<HrCorrectiveActionRow, "metadata">,
): Record<string, unknown> | null {
  const bag = row.metadata?.acknowledgement;
  return bag && typeof bag === "object"
    ? (bag as Record<string, unknown>)
    : null;
}

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
  /**
   * Set aside as wrong (hr_l1_79). The row still LISTS — struck through, never
   * removed: "a hidden void is a destroyed record."
   */
  voided: boolean;
  voidReason: string | null;
  incident?: HrIncidentRow;
  correctiveAction?: HrCorrectiveActionRow;
};

/**
 * MAPPED in `fetchHrIncidentParties`, not cast. The wire column is `party_role`
 * and the person's name arrives as `subject_name`; `note` is gone because
 * `hr.incident_party` has no note column — a narrative about a party belongs in
 * `hr.restricted_note`, behind its own lane.
 */
export type HrIncidentParty = {
  id: string;
  role: HrIncidentPartyRole | string;
  employment_id?: string | null;
  display_name?: string | null;
  external_name?: string | null;
  interviewed_at?: string | null;
  added_at?: string | null;
};

export type HrRestrictedNote = {
  id: string;
  note_kind: HrRestrictedNoteKind | string;
  title?: string | null;
  /** Present ONLY through the note's own per-kind reader lane. */
  body?: string | null;
  /** What a non-owner may be given instead — often nothing at all. */
  redacted_summary?: string | null;
  /**
   * The note's WRITER, resolved by the door. `hr.restricted_note` names its person
   * `author_employment_id`, and since hr_l3_120 `hr._project_row` has an author
   * branch beside its subject one, so the row arrives carrying `author_name` —
   * always through `hr._subject_display_name`, which applies the viewer's own
   * directory permissions. NULL when this viewer may not see that person's name,
   * and rendered as absent rather than as a uuid.
   */
  author_name?: string | null;
  created_at?: string | null;
};

/**
 * The COMPOSED case, assembled by `useHrRelationsCase` out of three separately
 * audited reads (§2.2 route 16). It is NOT what any one door returns — that
 * mistake is what made the case page render a heading and nothing else.
 */
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
