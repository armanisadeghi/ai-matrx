/**
 * features/hr/leave/policies/policy-form.ts — SPEC-LEAVE §2.3's field-visibility matrix, and
 * the payload builder, as ONE pure module.
 *
 * 🚨 §2.3'S TABLE **IS** THE EDITOR'S SPEC, so it lives here as data rather than as `&&` chains
 * scattered through JSX. Seven accrual methods decide which fields are live, which are hidden,
 * and what the runner does; a second copy of that decision inside a component is how a field
 * ends up visible on one render path and hidden on another.
 *
 * 🚨 **`waiting_period_days` AND `usable_after_days` ARE DIFFERENT THINGS.**
 * `waiting_period_days` delays when the employee starts **earning**. `usable_after_days` delays
 * when they may **spend**, and accrual continues throughout. California's statutory sick leave
 * is `accrual_starts='hire'`, `waiting_period_days=0`, `usable_after_days=90` — earning from
 * day one, spending from day 90. §2.3, verbatim: *"An editor that conflates them produces an
 * unlawful policy that validates clean."* That is why `FIELD_LABEL` and `FIELD_HELP` below say
 * EARNING and SPENDING in capitals, and why the two controls are never adjacent.
 *
 * 🚨 **THE CLIENT ENFORCES THE `hr.leave_policy` CHECK CONSTRAINTS BEFORE SENDING.**
 * `hr.leave_policy_save` catches sqlstate 23514 and returns it as
 * `{reason:'unlawful_configuration', detail:<sqlerrm>}` — the SAME reason a jurisdiction
 * refusal uses. So a forgotten `accrual_per_units` would open the §2.6 compliance dialog with
 * a Postgres sentence in it and no jurisdiction to name. `checkConstraintProblems()` catches
 * every one of them at the control instead, which is where §2.5 says a constraint belongs.
 */

import type { LeavePolicy, LeavePolicyBlackout } from "../manager/api/types";

// ── the vocabulary, from the live CHECK constraints ──────────────────────────

/** `hr.leave_policy_accrual_method_check`, verbatim. */
export const LEAVE_ACCRUAL_METHODS = [
  "per_hours_worked",
  "per_pay_period",
  "per_month",
  "annual_lump",
  "anniversary_lump",
  "unlimited",
  "none",
] as const;
export type LeaveAccrualMethod = (typeof LEAVE_ACCRUAL_METHODS)[number];

export const ACCRUAL_METHOD_LABEL: Record<LeaveAccrualMethod, string> = {
  per_hours_worked: "Earned per hours worked",
  per_pay_period: "Earned each pay period",
  per_month: "Earned each month",
  annual_lump: "Granted once a policy year",
  anniversary_lump: "Granted on each work anniversary",
  unlimited: "Unlimited — no balance is tracked",
  none: "No accrual — granted by hand only",
};

/** What the accrual runner does. §2.3's last column, said to the admin. */
export const ACCRUAL_METHOD_HELP: Record<LeaveAccrualMethod, string> = {
  per_hours_worked:
    "The runner adds time from finalised work weeks — the statutory sick-leave shape, for example 1 hour earned for every 30 hours worked.",
  per_pay_period: "The runner adds a flat number of hours for each pay period that closes.",
  per_month: "The runner adds a flat number of hours at each month boundary.",
  annual_lump: "The whole grant lands on the policy-year start date.",
  anniversary_lump: "The whole grant lands on the employee's work anniversary.",
  unlimited:
    "No ledger entries are written at all and no balance exists. Requests still need approval and still land on the timesheet.",
  none: "Nothing is written automatically. The balance changes only by an adjustment you make by hand.",
};

/** `accrual_unit` is decided by the method, not by the admin — §2.3's second column. */
export const ACCRUAL_UNIT_FOR: Record<LeaveAccrualMethod, string | null> = {
  per_hours_worked: "hour",
  per_pay_period: "pay_period",
  per_month: "month",
  annual_lump: "year",
  anniversary_lump: "year",
  unlimited: null,
  none: null,
};

/** `hr.leave_policy_leave_kind_check`, verbatim. */
export const LEAVE_KINDS = [
  "pto",
  "vacation",
  "sick",
  "personal",
  "bereavement",
  "jury",
  "parental",
  "unpaid",
  "floating_holiday",
  "comp_time",
] as const;

export const LEAVE_KIND_LABEL: Record<string, string> = {
  pto: "Paid time off",
  vacation: "Vacation",
  sick: "Sick leave",
  personal: "Personal",
  bereavement: "Bereavement",
  jury: "Jury duty",
  parental: "Parental",
  unpaid: "Unpaid",
  floating_holiday: "Floating holiday",
  comp_time: "Comp time",
};

/** `hr.leave_policy_accrual_starts_check`, verbatim. */
export const ACCRUAL_STARTS = ["hire", "after_waiting_period", "policy_year_start"] as const;

export const ACCRUAL_STARTS_LABEL: Record<string, string> = {
  hire: "On the hire date",
  after_waiting_period: "After a waiting period",
  policy_year_start: "At the start of the policy year",
};

/** `hr.leave_policy_payout_on_termination_check`, verbatim. */
export const PAYOUT_ON_TERMINATION = ["never", "always", "jurisdiction", "policy"] as const;

export const PAYOUT_LABEL: Record<string, string> = {
  never: "Never paid out",
  always: "Always paid out",
  jurisdiction: "Paid out where the law requires it",
  policy: "Paid out under this policy's own terms",
};

/**
 * The classes `hr._leave_config_parameters` knows how to check.
 *
 * A class outside this list is accepted and saved, and the validator answers
 * `checked:false` with its own sentence about what it could NOT check — which the editor
 * renders rather than implying the policy was cleared.
 */
export const STATUTORY_RULE_CLASSES = [
  { value: "", label: "No statutory basis" },
  { value: "sick-leave-floor", label: "Statutory sick leave (sick-leave-floor)" },
  { value: "pto-carryover-legality", label: "Carryover legality (pto-carryover-legality)" },
] as const;

// ── the form ─────────────────────────────────────────────────────────────────

/**
 * Numeric fields are held as STRINGS, deliberately.
 *
 * An empty numeric control means "this policy has no cap", which is `NULL` — and a `number`
 * field cannot hold that apart from `0`, which means "a cap of zero hours". They are different
 * policies and an admin acts differently on each. `hr.leave_policy_save` reads
 * `nullif(p_payload ->> 'balance_cap','')::numeric`, so an empty string is exactly how the
 * door is told NULL.
 */
export interface LeavePolicyForm {
  id: string | null;
  name: string;
  leaveKind: string;
  statutoryBasisRuleClass: string;
  accrualMethod: string;
  accrualRate: string;
  accrualPerUnits: string;
  accrualStarts: string;
  waitingPeriodDays: string;
  usableAfterDays: string;
  annualAccrualCap: string;
  balanceCap: string;
  carryoverAllowed: boolean;
  carryoverCap: string;
  carryoverExpiresAfterDays: string;
  negativeBalanceAllowed: boolean;
  negativeBalanceFloor: string;
  payoutOnTermination: string;
  reinstateOnRehireWithinDays: string;
  incrementMinutes: string;
  documentationRequiredAfterDays: string;
  earningCodeId: string;
  mandatedUses: string[];
  blackoutRules: LeavePolicyBlackout[];
  workerClassScope: string[];
  scheduleClassScope: string[];
  isActive: boolean;
}

function numText(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/** A brand-new policy. Every default here is `hr.leave_policy`'s own column default. */
export function emptyLeavePolicyForm(): LeavePolicyForm {
  return {
    id: null,
    name: "",
    leaveKind: "pto",
    statutoryBasisRuleClass: "",
    accrualMethod: "per_pay_period",
    accrualRate: "",
    accrualPerUnits: "",
    accrualStarts: "hire",
    waitingPeriodDays: "0",
    usableAfterDays: "0",
    annualAccrualCap: "",
    balanceCap: "",
    carryoverAllowed: true,
    carryoverCap: "",
    carryoverExpiresAfterDays: "",
    negativeBalanceAllowed: false,
    negativeBalanceFloor: "",
    payoutOnTermination: "jurisdiction",
    reinstateOnRehireWithinDays: "",
    incrementMinutes: "15",
    documentationRequiredAfterDays: "",
    earningCodeId: "",
    mandatedUses: [],
    blackoutRules: [],
    workerClassScope: [],
    scheduleClassScope: [],
    isActive: false,
  };
}

export function leavePolicyToForm(policy: LeavePolicy): LeavePolicyForm {
  return {
    id: policy.id,
    name: policy.name ?? "",
    leaveKind: policy.leaveKind ?? "pto",
    statutoryBasisRuleClass: policy.statutoryBasisRuleClass ?? "",
    accrualMethod: policy.accrualMethod ?? "per_pay_period",
    accrualRate: numText(policy.accrualRate),
    accrualPerUnits: numText(policy.accrualPerUnits),
    accrualStarts: policy.accrualStarts ?? "hire",
    waitingPeriodDays: numText(policy.waitingPeriodDays),
    usableAfterDays: numText(policy.usableAfterDays),
    annualAccrualCap: numText(policy.annualAccrualCap),
    balanceCap: numText(policy.balanceCap),
    carryoverAllowed: policy.carryoverAllowed ?? true,
    carryoverCap: numText(policy.carryoverCap),
    carryoverExpiresAfterDays: numText(policy.carryoverExpiresAfterDays),
    negativeBalanceAllowed: policy.negativeBalanceAllowed ?? false,
    negativeBalanceFloor: numText(policy.negativeBalanceFloor),
    payoutOnTermination: policy.payoutOnTermination ?? "jurisdiction",
    reinstateOnRehireWithinDays: numText(policy.reinstateOnRehireWithinDays),
    incrementMinutes: numText(policy.incrementMinutes),
    documentationRequiredAfterDays: numText(policy.documentationRequiredAfterDays),
    earningCodeId: policy.earningCodeId ?? "",
    mandatedUses: policy.mandatedUses,
    blackoutRules: policy.blackoutRules,
    workerClassScope: policy.workerClassScope,
    scheduleClassScope: policy.scheduleClassScope,
    isActive: policy.isActive ?? false,
  };
}

// ── §2.3, as data ────────────────────────────────────────────────────────────

/** Every control the editor can render. `focus_field` values map onto these. */
export type LeavePolicyField =
  | "name"
  | "leave_kind"
  | "statutory_basis_rule_class"
  | "accrual_method"
  | "accrual_rate"
  | "accrual_per_units"
  | "accrual_starts"
  | "waiting_period_days"
  | "usable_after_days"
  | "annual_accrual_cap"
  | "balance_cap"
  | "carryover_allowed"
  | "carryover_cap"
  | "carryover_expires_after_days"
  | "negative_balance_allowed"
  | "negative_balance_floor"
  | "payout_on_termination"
  | "reinstate_on_rehire_within_days"
  | "increment_minutes"
  | "documentation_required_after_days"
  | "earning_code_id";

/**
 * 🚨 THE TWO LABELS THAT MUST NEVER READ ALIKE. Everything else here is ordinary copy; these
 * two are the §2.3 defect guard.
 */
export const FIELD_LABEL: Record<LeavePolicyField, string> = {
  name: "Policy name",
  leave_kind: "Kind of leave",
  statutory_basis_rule_class: "Statutory basis",
  accrual_method: "How time is earned",
  accrual_rate: "Hours earned",
  accrual_per_units: "Per hours worked",
  accrual_starts: "Earning starts",
  waiting_period_days: "Waiting period before EARNING starts (days)",
  usable_after_days: "Wait before time can be SPENT (days)",
  annual_accrual_cap: "Most that can be earned in a policy year (hours)",
  balance_cap: "Most that can be held at once (hours)",
  carryover_allowed: "Unused time carries into the next policy year",
  carryover_cap: "Most that can carry over (hours)",
  carryover_expires_after_days: "Carried-over time expires after (days)",
  negative_balance_allowed: "Employees may go into a negative balance",
  negative_balance_floor: "Lowest balance allowed (hours, negative)",
  payout_on_termination: "Paid out when someone leaves",
  reinstate_on_rehire_within_days: "Reinstate a balance on rehire within (days)",
  increment_minutes: "Requests must be a multiple of (minutes)",
  documentation_required_after_days: "Documentation required after (consecutive days)",
  earning_code_id: "Earning code",
};

export const FIELD_HELP: Partial<Record<LeavePolicyField, string>> = {
  waiting_period_days:
    "Delays when the employee starts EARNING. Nothing accrues during this period. This is not the same as the wait before they can spend time.",
  usable_after_days:
    "Delays when the employee may SPEND time they have already earned. Accrual continues throughout. California's statutory sick leave earns from day one and can be spent from day 90.",
  accrual_per_units:
    "Only for time earned per hours worked. \"1 hour earned per 30 hours worked\" is 1 here and 30 in this box.",
  balance_cap:
    "Accrual stops at the cap until the employee uses some time. Nothing expires because of a cap.",
  increment_minutes:
    "Constrains every request's hours and every part-day. 1 minute is legal; 0 is not.",
  earning_code_id:
    "Required for any paid policy — without it the timesheet cannot categorise the hours and the payroll export has no line.",
};

/** The fields §2.3 says are live for each accrual method, beyond the always-live ones. */
const ACCRUAL_FIELDS: Record<LeaveAccrualMethod, LeavePolicyField[]> = {
  per_hours_worked: ["accrual_rate", "accrual_per_units"],
  per_pay_period: ["accrual_rate"],
  per_month: ["accrual_rate"],
  annual_lump: ["accrual_rate"],
  anniversary_lump: ["accrual_rate"],
  unlimited: [],
  none: [],
};

/**
 * The balance-shaped fields. §2.3: `unlimited` HIDES every one of them — *"forces
 * annual_accrual_cap, balance_cap, carryover_allowed, carryover_cap,
 * negative_balance_allowed, and payout_on_termination to be absent from the form"*. Absent, not
 * disabled: an unlimited policy has no balance, so a greyed cap control would be describing a
 * number that does not exist.
 */
const BALANCE_FIELDS: LeavePolicyField[] = [
  "annual_accrual_cap",
  "balance_cap",
  "carryover_allowed",
  "carryover_cap",
  "carryover_expires_after_days",
  "negative_balance_allowed",
  "negative_balance_floor",
  "payout_on_termination",
  "reinstate_on_rehire_within_days",
];

const ALWAYS: LeavePolicyField[] = [
  "name",
  "leave_kind",
  "statutory_basis_rule_class",
  "accrual_method",
  "accrual_starts",
  "usable_after_days",
  "increment_minutes",
  "documentation_required_after_days",
];

function isAccrualMethod(value: string): value is LeaveAccrualMethod {
  return (LEAVE_ACCRUAL_METHODS as readonly string[]).includes(value);
}

/**
 * Which controls are IN THE DOM for this form state. §2.3's matrix, evaluated.
 *
 * Note what is NOT here: a month-anchor selector for `per_month`, and controls for
 * `requires_approval` / `statutory_jurisdiction_id`. §2.3 names a month anchor, but
 * `hr.leave_policy` carries no column for it and `hr_leave_policy_list` returns none — and the
 * other two are accepted by the save door and never returned by the list, so a control for them
 * would render its default on every load and silently rewrite the column on every save. A field
 * the server will not read back does not get a control.
 */
export function visibleLeavePolicyFields(form: LeavePolicyForm): Set<LeavePolicyField> {
  const method = isAccrualMethod(form.accrualMethod) ? form.accrualMethod : "none";
  const fields = new Set<LeavePolicyField>(ALWAYS);

  for (const field of ACCRUAL_FIELDS[method]) fields.add(field);

  if (method !== "unlimited") {
    for (const field of BALANCE_FIELDS) {
      // A cap on a carryover that is switched off is a number nothing reads — the CHECK
      // constraint says so too (`carryover_allowed OR carryover_cap IS NULL`).
      if (
        !form.carryoverAllowed &&
        (field === "carryover_cap" || field === "carryover_expires_after_days")
      ) {
        continue;
      }
      if (!form.negativeBalanceAllowed && field === "negative_balance_floor") continue;
      fields.add(field);
    }
  }

  // §2.3: live ONLY when earning is deliberately delayed.
  if (form.accrualStarts === "after_waiting_period") fields.add("waiting_period_days");

  // §2.3: required whenever the policy is paid.
  if (form.leaveKind !== "unpaid") fields.add("earning_code_id");

  return fields;
}

// ── the constraints, checked at the control ──────────────────────────────────

export interface LeaveFieldProblem {
  field: LeavePolicyField;
  message: string;
}

/**
 * Every `hr.leave_policy` CHECK constraint, restated as a sentence at the control it belongs
 * to. These are the PRODUCT's own rules, never a jurisdiction's — a jurisdiction refusal is
 * §2.6's dialog and looks nothing like this.
 */
export function checkConstraintProblems(form: LeavePolicyForm): LeaveFieldProblem[] {
  const problems: LeaveFieldProblem[] = [];
  const method = isAccrualMethod(form.accrualMethod) ? form.accrualMethod : "none";
  const rate = form.accrualRate.trim() === "" ? null : Number(form.accrualRate);
  const perUnits = form.accrualPerUnits.trim() === "" ? null : Number(form.accrualPerUnits);
  const balanceCap = form.balanceCap.trim() === "" ? null : Number(form.balanceCap);
  const annualCap = form.annualAccrualCap.trim() === "" ? null : Number(form.annualAccrualCap);
  const increment = form.incrementMinutes.trim() === "" ? null : Number(form.incrementMinutes);

  if (form.name.trim() === "") {
    problems.push({ field: "name", message: "Give this policy a name people will recognise." });
  }

  if (method !== "unlimited" && method !== "none" && (rate === null || !Number.isFinite(rate))) {
    problems.push({
      field: "accrual_rate",
      message: "A policy that earns time needs a rate. Say how many hours are earned.",
    });
  }

  if (method === "per_hours_worked") {
    if (perUnits === null || !Number.isFinite(perUnits) || perUnits <= 0) {
      problems.push({
        field: "accrual_per_units",
        message:
          "Time earned per hours worked needs the number of hours worked it is measured against, and it must be more than zero.",
      });
    }
  } else if (form.accrualPerUnits.trim() !== "") {
    problems.push({
      field: "accrual_per_units",
      message:
        "This only applies to time earned per hours worked. Clear it, or change how time is earned.",
    });
  }

  if (increment === null || !Number.isFinite(increment) || increment <= 0) {
    problems.push({
      field: "increment_minutes",
      message: "Requests are rounded to a whole number of minutes, and it must be more than zero.",
    });
  }

  if (
    balanceCap !== null &&
    annualCap !== null &&
    Number.isFinite(balanceCap) &&
    Number.isFinite(annualCap) &&
    balanceCap < annualCap
  ) {
    problems.push({
      field: "balance_cap",
      message:
        "Someone cannot be allowed to earn more in a year than they are allowed to hold. Raise the holding limit or lower the yearly one.",
    });
  }

  if (form.leaveKind !== "unpaid" && form.earningCodeId.trim() === "") {
    problems.push({
      field: "earning_code_id",
      message:
        "A paid policy needs an earning code, or the timesheet cannot categorise the hours and payroll has no line for them.",
    });
  }

  const floor =
    form.negativeBalanceFloor.trim() === "" ? null : Number(form.negativeBalanceFloor);
  if (form.negativeBalanceAllowed && floor !== null && Number.isFinite(floor) && floor > 0) {
    problems.push({
      field: "negative_balance_floor",
      message: "The lowest allowed balance is a negative number, for example −16.",
    });
  }

  return problems;
}

// ── the payload ──────────────────────────────────────────────────────────────

function numOrEmpty(value: string): string {
  return value.trim();
}

/**
 * The `p_payload` for `hr_leave_policy_validate` and `hr_leave_policy_save`.
 *
 * 🚨 KEYS ARE `hr.leave_policy` COLUMN NAMES. The save door reads `p_payload ->> 'balance_cap'`
 * — a camelCase key is silently a no-op there, which on the UPDATE branch means the column
 * keeps whatever it had while the admin watches a success toast.
 *
 * 🚨 `unlimited` SENDS THE CLEARING VALUES, NOT NOTHING. §2.3 requires the cap, carryover,
 * negative-balance and payout fields to be NULL/false on save; the UPDATE branch clears a
 * nullable numeric on an empty string, so the empty strings below are how a policy switched to
 * unlimited actually loses its old caps. `payout_on_termination` is NOT NULL with a CHECK, so
 * it goes to `never` — an unlimited policy has no balance to pay out.
 */
export function leavePolicyPayload(form: LeavePolicyForm): Record<string, unknown> {
  const unlimited = form.accrualMethod === "unlimited";
  const method = isAccrualMethod(form.accrualMethod) ? form.accrualMethod : "none";
  const carryover = unlimited ? false : form.carryoverAllowed;
  const negative = unlimited ? false : form.negativeBalanceAllowed;

  return {
    ...(form.id ? { id: form.id } : {}),
    name: form.name.trim(),
    leave_kind: form.leaveKind,
    statutory_basis_rule_class: form.statutoryBasisRuleClass,
    accrual_method: form.accrualMethod,
    accrual_rate: unlimited || method === "none" ? "" : numOrEmpty(form.accrualRate),
    accrual_per_units:
      method === "per_hours_worked" ? numOrEmpty(form.accrualPerUnits) : "",
    accrual_unit: ACCRUAL_UNIT_FOR[method] ?? "",
    accrual_starts: form.accrualStarts,
    waiting_period_days:
      form.accrualStarts === "after_waiting_period" ? numOrEmpty(form.waitingPeriodDays) : "0",
    usable_after_days: numOrEmpty(form.usableAfterDays),
    annual_accrual_cap: unlimited ? "" : numOrEmpty(form.annualAccrualCap),
    balance_cap: unlimited ? "" : numOrEmpty(form.balanceCap),
    carryover_allowed: carryover,
    carryover_cap: carryover ? numOrEmpty(form.carryoverCap) : "",
    carryover_expires_after_days: carryover
      ? numOrEmpty(form.carryoverExpiresAfterDays)
      : "",
    negative_balance_allowed: negative,
    negative_balance_floor: negative ? numOrEmpty(form.negativeBalanceFloor) : "",
    payout_on_termination: unlimited ? "never" : form.payoutOnTermination,
    reinstate_on_rehire_within_days: unlimited
      ? ""
      : numOrEmpty(form.reinstateOnRehireWithinDays),
    increment_minutes: numOrEmpty(form.incrementMinutes),
    documentation_required_after_days: numOrEmpty(form.documentationRequiredAfterDays),
    earning_code_id: form.earningCodeId,
    blackout_rules: form.blackoutRules,
    mandated_uses: form.mandatedUses,
    worker_class_scope: form.workerClassScope,
    schedule_class_scope: form.scheduleClassScope,
    is_active: form.isActive,
  };
}

/**
 * Apply a violation's own `fix.set` to the form.
 *
 * The patch arrives camel-keyed (the transport maps response keys), which is the form's own
 * spelling — so this is a merge, not a translation. Numbers become strings because that is how
 * the numeric controls hold "absent" apart from zero.
 *
 * 🚨 THE ADMIN'S REJECTED INPUT IS NOT CLEARED BY THIS. Only the keys the engine named are
 * touched; §2.6 requires everything else to stay exactly as typed.
 */
export function applyLeaveFix(
  form: LeavePolicyForm,
  set: Record<string, unknown> | null,
): LeavePolicyForm {
  if (!set) return form;
  const next: LeavePolicyForm = { ...form };
  for (const [key, value] of Object.entries(set)) {
    if (value === null || value === undefined) continue;
    switch (key) {
      case "carryoverAllowed":
        next.carryoverAllowed = value === true;
        break;
      case "negativeBalanceAllowed":
        next.negativeBalanceAllowed = value === true;
        break;
      case "accrualRate":
        next.accrualRate = String(value);
        break;
      case "accrualPerUnits":
        next.accrualPerUnits = String(value);
        break;
      case "usableAfterDays":
        next.usableAfterDays = String(value);
        break;
      case "waitingPeriodDays":
        next.waitingPeriodDays = String(value);
        break;
      case "carryoverCap":
        next.carryoverCap = String(value);
        break;
      case "balanceCap":
        next.balanceCap = String(value);
        break;
      case "annualAccrualCap":
        next.annualAccrualCap = String(value);
        break;
      case "incrementMinutes":
        next.incrementMinutes = String(value);
        break;
      default:
        // A key we do not know how to apply is left alone rather than guessed at. The dialog
        // still focuses `focus_field`, so the admin fixes it themselves with the number in
        // front of them.
        break;
    }
  }
  return next;
}

/**
 * `focus_field` is a COLUMN name; the DOM ids are the same strings, so this is identity — but
 * it is a named function so the coupling is visible and a rename cannot quietly break focus.
 */
export function fieldElementId(field: string): string {
  return `leave-policy-${field}`;
}
