import type { Side } from "../api/types";

export interface ClaimDraft {
  applicant_name: string;
  occupational_code: number | null;
  weekly_earnings: number | null;
  age_at_doi: number | null;
  date_of_birth: string | null;
  date_of_injury: string | null;
  // Optional record-keeping fields. These don't affect the rating math;
  // they ride along on the persisted claim so the FE can render a complete
  // case sheet later. None of them gate `evaluateDraftReadiness`.
  gender: string | null;
  case_number: string | null;
  evaluator_name: string | null;
  comments: string | null;
}

export interface InjuryDraft {
  tmpId: string;
  persistedId?: string;
  impairment_definition_id: string | null;
  side: Side;
  wpi: number | null;
  ue: number | null;
  le: number | null;
  digit: number | null;
  pain: number;
  industrial: number;
}

export type DraftMode = "draft" | "loading" | "saved";

export interface RatingDraft {
  claim: ClaimDraft;
  injuries: InjuryDraft[];
  persistedClaimId?: string;
  persistedReportId?: string;
}

export const EMPTY_CLAIM_DRAFT: ClaimDraft = {
  applicant_name: "",
  occupational_code: null,
  weekly_earnings: null,
  age_at_doi: null,
  date_of_birth: null,
  date_of_injury: null,
  gender: null,
  case_number: null,
  evaluator_name: null,
  comments: null,
};

export const EMPTY_DRAFT: RatingDraft = {
  claim: EMPTY_CLAIM_DRAFT,
  injuries: [],
};

export function makeInjuryDraft(): InjuryDraft {
  return {
    tmpId: crypto.randomUUID(),
    impairment_definition_id: null,
    side: "default",
    wpi: null,
    ue: null,
    le: null,
    digit: null,
    pain: 0,
    industrial: 100,
  };
}
