import type {
  ClaimCreate,
  ClaimPatch,
  InjuryCreate,
  InjuryPatch,
} from "../api/types";
import { WEEKLY_EARNINGS_MAX } from "../api/types";
import type { ClaimDraft, InjuryDraft } from "./types";

function clampEarnings(weekly: number): number {
  return Math.min(weekly, WEEKLY_EARNINGS_MAX);
}

export function claimDraftToCreate(claim: ClaimDraft): ClaimCreate {
  if (!claim.applicant_name)
    throw new Error("Applicant name required to save the claim");
  if (claim.occupational_code == null)
    throw new Error("Occupation required to save the claim");
  if (claim.weekly_earnings == null)
    throw new Error("Weekly earnings required to save the claim");

  const body: ClaimCreate = {
    applicant_name: claim.applicant_name,
    occupational_code: claim.occupational_code,
    weekly_earnings: clampEarnings(claim.weekly_earnings),
  };
  if (claim.age_at_doi != null) body.age_at_doi = claim.age_at_doi;
  if (claim.date_of_birth) body.date_of_birth = claim.date_of_birth;
  if (claim.date_of_injury) body.date_of_injury = claim.date_of_injury;
  // Optional record-keeping fields — only include when set so the backend's
  // create-vs-patch semantics aren't muddled with explicit nulls on create.
  // Cast through `as Record<string, unknown>` because these fields aren't in
  // the regenerated TS schema yet (see `pnpm sync-types`).
  const extras = body as Record<string, unknown>;
  if (claim.gender) extras.gender = claim.gender;
  if (claim.case_number) extras.case_number = claim.case_number;
  if (claim.evaluator_name) extras.evaluator_name = claim.evaluator_name;
  if (claim.comments) extras.comments = claim.comments;
  return body;
}

export function claimDraftToPatch(claim: ClaimDraft): ClaimPatch {
  const body: ClaimPatch = {};
  body.applicant_name = claim.applicant_name || null;
  body.occupational_code = claim.occupational_code ?? null;
  body.weekly_earnings =
    claim.weekly_earnings == null ? null : clampEarnings(claim.weekly_earnings);
  body.age_at_doi = claim.age_at_doi ?? null;
  body.date_of_birth = claim.date_of_birth ?? null;
  body.date_of_injury = claim.date_of_injury ?? null;
  const extras = body as Record<string, unknown>;
  extras.gender = claim.gender ?? null;
  extras.case_number = claim.case_number ?? null;
  extras.evaluator_name = claim.evaluator_name ?? null;
  extras.comments = claim.comments ?? null;
  return body;
}

export function injuryDraftToCreate(injury: InjuryDraft): InjuryCreate {
  if (!injury.impairment_definition_id)
    throw new Error("Each injury needs an impairment");

  const body: InjuryCreate = {
    impairment_definition_id: injury.impairment_definition_id,
    pain: injury.pain,
    industrial: injury.industrial,
  };
  if (injury.wpi != null) body.wpi = injury.wpi;
  if (injury.ue != null) body.ue = injury.ue;
  if (injury.le != null) body.le = injury.le;
  if (injury.digit != null) body.digit = injury.digit;
  (body as Record<string, unknown>).side = injury.side;
  return body;
}

export function injuryDraftToPatch(injury: InjuryDraft): InjuryPatch {
  const body: InjuryPatch = {
    pain: injury.pain,
    industrial: injury.industrial,
  };
  body.wpi = injury.wpi;
  body.ue = injury.ue;
  body.le = injury.le;
  body.digit = injury.digit;
  if (injury.impairment_definition_id) {
    (body as Record<string, unknown>).impairment_definition_id =
      injury.impairment_definition_id;
  }
  (body as Record<string, unknown>).side = injury.side;
  return body;
}
