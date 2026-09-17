/**
 * Surface manifest — CA Workers' Comp (`matrx-user/legal-ca-wc`).
 *
 * The California workers'-compensation vertical under `/legal/ca-wc/**`: the
 * landing, the saved cases list, the PD ratings calculator (and one claim at
 * `/legal/ca-wc/pd-ratings-calculator/[claimId]`), and the utility calculators
 * (present value, weeks, life expectancy).
 *
 * Declared 2026-08-17: an entire product vertical with no surface declaration.
 *
 * THE MISMATCH RULE applies hard here: the person in this UI is NOT necessarily
 * a workers'-comp attorney. The system supplies the expertise.
 *
 * PII: a claim carries a real injured worker's details. `applicant_name` and the
 * rating inputs are declared because an assisting agent is useless without
 * them; `date_of_birth` is bindable-only (`autoContext: false`) so it is never
 * swept into context that did not deliberately ask for it.
 *
 * Curated groups (band 0-899):
 *   workspace   Which calculator/route the user is on
 *   the_claim   The claim being rated
 *   the_rating  The injuries and the computed result
 *   utility     Inputs and results for the open utility calculator
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

const groups: SurfaceValueGroup[] = [
  {
    key: "workspace",
    label: "Workspace",
    sortOrder: 100,
    description: "Which part of the workers'-comp vertical is open.",
  },
  {
    key: "the_claim",
    label: "The claim",
    sortOrder: 200,
    description: "The claim currently loaded into the rating calculator.",
  },
  {
    key: "the_rating",
    label: "Injuries & rating",
    sortOrder: 300,
    description: "The rated injuries and the calculator's current result.",
  },
  {
    key: "utility",
    label: "Utility calculator",
    sortOrder: 400,
    description:
      "Inputs and calculated outputs for the open utility calculator.",
  },
];

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "calculator_id",
    label: "Active calculator",
    description:
      '"ppd", "present-value", "weeks", "life-expectancy", or "awc" when a calculator is open. Empty on the landing and the saved-cases list.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 16,
    sortOrder: 100,
    group: "workspace",
  },
  {
    name: "draft_mode",
    label: "Draft mode",
    description:
      '"draft" for unsaved work, "loading" while a saved case is being fetched, "saved" once it is persisted. Empty when no calculator is open.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 110,
    group: "workspace",
  },
  {
    name: "claim_id",
    label: "Claim ID",
    description:
      "UUID of the persisted claim loaded into the calculator. Empty on a fresh unsaved draft and on the list route.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 36,
    sortOrder: 200,
    group: "the_claim",
  },
  {
    name: "applicant_name",
    label: "Applicant name",
    description:
      "Name of the injured worker on the loaded claim. Empty on a fresh draft or when no claim is open. Real personal data about a real person — handle accordingly.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 30,
    sortOrder: 210,
    group: "the_claim",
  },
  {
    name: "case_number",
    label: "Case number",
    description:
      "The case number recorded on the loaded claim. Empty when none was entered or no claim is open.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 20,
    sortOrder: 220,
    group: "the_claim",
  },
  {
    name: "date_of_injury",
    label: "Date of injury",
    description:
      "ISO date of injury on the loaded claim. Empty when not entered. Load-bearing: the DOI year decides which compensation rules apply.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    sortOrder: 230,
    group: "the_claim",
  },
  {
    name: "date_of_birth",
    label: "Date of birth",
    description:
      "ISO date of birth on the loaded claim. Empty when not entered. Bindable-only: sensitive personal data that must be asked for deliberately, never swept into context by default.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 10,
    autoContext: false,
    sortOrder: 240,
    group: "the_claim",
  },
  {
    name: "claim_rating_inputs",
    label: "Rating inputs",
    description:
      "The rating-driving fields of the loaded claim as one object: { occupational_code, weekly_earnings, age_at_doi, p_s_date, job_offer_date, large_employer }. Absent when no claim is open. These, not the record-keeping fields, are what the math uses.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 220,
    sortOrder: 250,
    group: "the_claim",
  },
  {
    name: "injuries",
    label: "Rated injuries",
    description:
      "One entry per injury on the draft with { impairment_definition_id, side, wpi, pain, industrial }. Populated when a calculator is open — empty array before any injury is added. Absent on the landing and list routes.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 700,
    sortOrder: 300,
    group: "the_rating",
  },
  {
    name: "injury_count",
    label: "Injury count",
    description:
      "How many injuries are on the current draft. Absent when no calculator is open.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 310,
    group: "the_rating",
  },
  {
    name: "final_rating",
    label: "Final rating",
    description:
      "The calculator's current combined permanent-disability rating. Absent while the draft is incomplete — an absent rating means not-yet-computable, never zero.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 320,
    group: "the_rating",
  },
  {
    name: "draft_is_ready",
    label: "Draft is ratable",
    description:
      "True when the draft has everything the rating engine requires. Absent when no calculator is open. False means the result on screen is provisional.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 330,
    group: "the_rating",
  },
  {
    name: "weekly_payment",
    label: "Weekly payment amount",
    description:
      "Weekly payment amount entered in the Present Value utility. Zero when the field is empty or set to zero.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 12,
    sortOrder: 400,
    group: "utility",
  },
  {
    name: "number_of_weeks",
    label: "Number of weeks",
    description:
      "Number of future weekly payments entered in the Present Value utility. Zero when the field is empty or set to zero.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 6,
    sortOrder: 410,
    group: "utility",
  },
  {
    name: "annual_interest_rate",
    label: "Annual interest rate",
    description:
      "Annual percentage rate used to discount future payments in the Present Value utility. Zero when the field is empty or set to zero.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 420,
    group: "utility",
  },
  {
    name: "present_value",
    label: "Present value",
    description:
      "Calculated lump-sum value today for the Present Value utility. Absent while the payment or week inputs are not positive.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 430,
    group: "utility",
  },
  {
    name: "total_payments",
    label: "Total payments",
    description:
      "Undiscounted total of all future payments in the Present Value utility. Absent while the calculation inputs are incomplete.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 440,
    group: "utility",
  },
  {
    name: "discount_amount",
    label: "Discount amount",
    description:
      "Difference between undiscounted payments and their present value. Absent while the calculation inputs are incomplete.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 14,
    sortOrder: 450,
    group: "utility",
  },
  {
    name: "discount_percent",
    label: "Discount %",
    description:
      "Percentage reduction from undiscounted payments to present value. Absent while the calculation inputs are incomplete.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 8,
    sortOrder: 460,
    group: "utility",
  },
  {
    name: "utility_calculation_ready",
    label: "Utility calculation ready",
    description:
      "True when the Present Value utility has positive payment and week inputs and can show a result. False otherwise.",
    valueType: "boolean",
    alwaysAvailable: false,
    typicalCharCount: 5,
    sortOrder: 470,
    group: "utility",
  },
];

export const legalCaWcManifest: SurfaceManifest = {
  surfaceName: "matrx-user/legal-ca-wc",
  readiness: "partial",
  readinessNote:
    "The Present Value utility now emits its declared inputs and results. The Weeks, Life Expectancy, and AWC utility calculators still need their own declared values and emitters, followed by live surface verification.",
  label: "CA Workers' Comp",
  urlPattern: "/legal/ca-wc",
  intro: `<surface_intro>
You are in the California workers'-compensation workspace: saved cases, the permanent-disability ratings calculator, and the utility calculators (present value, weeks, life expectancy).
Do not assume the person here is a workers'-comp attorney — they may be an expert at something else entirely. Supply the expertise; explain the terms you use.
Read claim_rating_inputs and injuries as what the math actually consumes; the record-keeping fields do not affect the result. date_of_injury is load-bearing because the DOI year selects the applicable rules. When draft_is_ready is false, the rating on screen is provisional — say so rather than presenting it as an answer.
This is real personal data about a real injured worker. Never repeat it beyond what the task needs, and never invent a value that was not entered.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(
    pickBaseline("selection", "context"),
    surfaceSpecific,
  ),
};

/** One entry as emitted in `injuries`. */
export interface LegalCaWcInjuryEntry {
  impairment_definition_id: string | null;
  side: string;
  wpi: number | null;
  pain: number;
  industrial: number;
}

/** Type-safe payload helper. Every value here is route-conditional. */
export function createLegalCaWcScope(values: {
  selection?: string;
  context?: Record<string, unknown>;
  calculator_id?: string;
  draft_mode?: "draft" | "loading" | "saved";
  claim_id?: string;
  applicant_name?: string;
  case_number?: string;
  date_of_injury?: string;
  date_of_birth?: string;
  claim_rating_inputs?: {
    occupational_code: number | null;
    weekly_earnings: number | null;
    age_at_doi: number | null;
    p_s_date: string | null;
    job_offer_date: string | null;
    large_employer: boolean;
  };
  injuries?: LegalCaWcInjuryEntry[];
  injury_count?: number;
  final_rating?: number;
  draft_is_ready?: boolean;
  weekly_payment?: number;
  number_of_weeks?: number;
  annual_interest_rate?: number;
  present_value?: number;
  total_payments?: number;
  discount_amount?: number;
  discount_percent?: number;
  utility_calculation_ready?: boolean;
}): SurfaceScopePayload {
  return values as SurfaceScopePayload;
}
