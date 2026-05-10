import type {
  WcClaimRead,
  WcInjuryList,
  WcReportRead,
  Side,
} from "../api/types";
import type { ClaimDraft, InjuryDraft, RatingDraft } from "./types";

function readSide(value: unknown): Side {
  if (value === "left" || value === "right") return value;
  return "default";
}

export function hydrateRatingDraft(
  claim: WcClaimRead,
  report: WcReportRead,
  injuries: WcInjuryList,
): RatingDraft {
  const rawClaim = claim as unknown as Record<string, unknown>;
  const claimDraft: ClaimDraft = {
    applicant_name: (rawClaim.applicant_name as string | null | undefined) ?? "",
    occupational_code:
      (rawClaim.occupational_code as number | null | undefined) ?? null,
    weekly_earnings:
      (rawClaim.weekly_earnings as number | null | undefined) ?? null,
    age_at_doi: (rawClaim.age_at_doi as number | null | undefined) ?? null,
    date_of_birth: (rawClaim.date_of_birth as string | null | undefined) ?? null,
    date_of_injury: (rawClaim.date_of_injury as string | null | undefined) ?? null,
    gender: (rawClaim.gender as string | null | undefined) ?? null,
    case_number: (rawClaim.case_number as string | null | undefined) ?? null,
    evaluator_name: (rawClaim.evaluator_name as string | null | undefined) ?? null,
    comments: (rawClaim.comments as string | null | undefined) ?? null,
  };

  const injuryDrafts: InjuryDraft[] = injuries.injuries.map((inj) => {
    const raw = inj as unknown as Record<string, unknown>;
    return {
      tmpId: typeof crypto !== "undefined" ? crypto.randomUUID() : `tmp-${Math.random()}`,
      persistedId: (raw.id as string | undefined) ?? undefined,
      impairment_definition_id:
        (raw.impairment_definition_id as string | undefined) ?? null,
      side: readSide(raw.side),
      wpi: (raw.wpi as number | null | undefined) ?? null,
      ue: (raw.ue as number | null | undefined) ?? null,
      le: (raw.le as number | null | undefined) ?? null,
      digit: (raw.digit as number | null | undefined) ?? null,
      pain: (raw.pain as number | undefined) ?? 0,
      industrial: (raw.industrial as number | undefined) ?? 100,
    };
  });

  return {
    claim: claimDraft,
    injuries: injuryDrafts,
    persistedClaimId: claim.id,
    persistedReportId: report.id,
  };
}
