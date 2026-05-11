import type {
  StatelessCalculate,
  StatelessClaim,
  StatelessInjury,
} from "../api/types";
import { WEEKLY_EARNINGS_MAX } from "../api/types";
import type { ClaimDraft, InjuryDraft, RatingDraft } from "./types";

export interface DraftReadiness {
  ready: boolean;
  reason?: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidIsoDate(value: string | null | undefined): value is string {
  return !!value && ISO_DATE.test(value);
}

// Mirrors the backend `/legal/wc/ratings/calculate` contract:
//   applicant.name        — required
//   applicant.date_of_birth — required (YYYY-MM-DD; ApplicantInfo.is_valid)
//   claim.occupational_code — required
//   claim.weekly_earnings   — required (>0)
//   claim.date_of_injury    — required (YYYY-MM-DD)
//   claim.age_at_doi        — optional; backend computes from DOB+DOI when absent
//   ≥1 injury, each with impairment_definition_id and at least one percentage
export function evaluateDraftReadiness(draft: RatingDraft): DraftReadiness {
  const { claim, injuries } = draft;

  if (!claim.applicant_name.trim())
    return { ready: false, reason: "Enter the applicant name." };
  if (!claim.occupational_code)
    return { ready: false, reason: "Select an occupation." };
  if (claim.weekly_earnings == null || claim.weekly_earnings <= 0)
    return { ready: false, reason: "Enter weekly earnings." };
  if (!isValidIsoDate(claim.date_of_birth))
    return { ready: false, reason: "Add the date of birth." };
  if (!isValidIsoDate(claim.date_of_injury))
    return { ready: false, reason: "Add the date of injury." };
  if (injuries.length === 0)
    return { ready: false, reason: "Add at least one injury." };

  const incomplete = injuries.find((i) => !i.impairment_definition_id);
  if (incomplete)
    return { ready: false, reason: "Choose an impairment for every injury." };

  const noPercent = injuries.find(
    (i) =>
      (i.wpi ?? 0) <= 0 &&
      (i.le ?? 0) <= 0 &&
      (i.ue ?? 0) <= 0 &&
      (i.digit ?? 0) <= 0,
  );
  if (noPercent)
    return {
      ready: false,
      reason: "Each injury needs at least one percentage.",
    };

  return { ready: true };
}

function clampEarnings(weekly: number): number {
  return Math.min(weekly, WEEKLY_EARNINGS_MAX);
}

function buildClaimSection(claim: ClaimDraft): StatelessClaim {
  // Readiness has already proven date_of_injury is a valid YYYY-MM-DD string.
  const section: StatelessClaim = {
    occupational_code: claim.occupational_code!,
    weekly_earnings: clampEarnings(claim.weekly_earnings!),
    age_at_doi: claim.age_at_doi ?? undefined,
    date_of_injury: claim.date_of_injury!,
  };
  // Compensation-driving fields (LC §4658(d) and §4659). Backend treats
  // missing values as "rule not triggered". Cast through `unknown` because
  // these fields are not yet in the regenerated TS types — pnpm sync-types
  // will pick them up from the OpenAPI schema.
  const extras = section as unknown as Record<string, unknown>;
  if (claim.p_s_date) extras.p_s_date = claim.p_s_date;
  if (claim.job_offer_date) extras.job_offer_date = claim.job_offer_date;
  if (claim.large_employer) extras.large_employer = true;
  return section;
}

function buildInjurySection(injury: InjuryDraft): StatelessInjury {
  const attributes: Record<string, unknown> = { side: injury.side };
  if (injury.wpi != null) attributes.wpi = injury.wpi;
  if (injury.ue != null) attributes.ue = injury.ue;
  if (injury.le != null) attributes.le = injury.le;
  if (injury.digit != null) attributes.digit = injury.digit;

  return {
    impairment_definition_id: injury.impairment_definition_id!,
    attributes: attributes as never,
    pain: injury.pain,
    industrial: injury.industrial,
  };
}

export function buildStatelessPayload(
  draft: RatingDraft,
): StatelessCalculate | null {
  const readiness = evaluateDraftReadiness(draft);
  if (!readiness.ready) return null;

  const { claim, injuries } = draft;
  // Readiness has proven both name and DOB are present and valid.
  return {
    applicant: {
      name: claim.applicant_name.trim(),
      employee_id: "",
      date_of_birth: claim.date_of_birth!,
    } as never,
    claim: buildClaimSection(claim),
    injuries: injuries.map(buildInjurySection),
  };
}

export function hashDraft(draft: RatingDraft): string {
  const payload = buildStatelessPayload(draft);
  if (!payload) {
    return JSON.stringify({
      _ready: false,
      claim: draft.claim,
      injuries: draft.injuries.length,
    });
  }
  return JSON.stringify(payload);
}
