import type { components } from "@/types/python-generated/api-types";

export type ClaimCreate = components["schemas"]["ClaimCreate"];
export type ClaimPatch = components["schemas"]["ClaimPatch"];
export type WcClaimRead = components["schemas"]["WcClaimRead"];
export type WcReportRead = components["schemas"]["WcReportRead"];
export type WcInjuryRead = components["schemas"]["WcInjuryRead"];
export type WcInjuryList = components["schemas"]["WcInjuryList"];
export type InjuryCreate = components["schemas"]["InjuryCreate"];
export type InjuryPatch = components["schemas"]["InjuryPatch"];
export type WcImpairmentDefinitionRead =
  components["schemas"]["WcImpairmentDefinitionRead"];
export type ImpairmentsResponse = components["schemas"]["ImpairmentsResponse"];
export type OccupationalCodesResponse =
  components["schemas"]["OccupationalCodesResponse"];
export type ImpairmentSearch = components["schemas"]["ImpairmentSearch"];
export type ImpairmentSearchResponse =
  components["schemas"]["ImpairmentSearchResponse"];
export type StatelessCalculate = components["schemas"]["StatelessCalculate"];
// `DefaultsResponse` is added by the new `GET /defaults` endpoint. Until the
// FE regenerates types via `pnpm sync-types` it isn't present on `components`,
// so we declare it inline. After regen this can be replaced with:
//   export type RatingDefaults = components["schemas"]["DefaultsResponse"];
export interface RatingDefaults {
  max_weekly_earnings: number;
  default_fec: number;
  default_fec_valid_from: number;
}
export type StatelessRatingResponse =
  components["schemas"]["StatelessRatingResponse"];
export type StatelessApplicant = components["schemas"]["StatelessApplicant"];
export type StatelessClaim = components["schemas"]["StatelessClaim"];
export type StatelessInjury = components["schemas"]["StatelessInjury"];
export type StatelessResultOut = components["schemas"]["StatelessResultOut"];
export type CombinedRatingOut = components["schemas"]["CombinedRatingOut"];
export type CompensationOut = components["schemas"]["CompensationOut"];
export type ImpairmentAvailableAttributes =
  components["schemas"]["ImpairmentAvailableAttributes"];

export type Side = "left" | "right" | "default";

export const WC_RATINGS_BASE = "/legal/wc/ratings" as const;

// Fallback used only until `useRatingDefaults()` resolves on first paint.
// Live consumers should always read `useRatingDefaults().data?.max_weekly_earnings`.
// Source of truth is the backend's `config/ama_pd_ratings/defaults.json`.
export const WEEKLY_EARNINGS_MAX_FALLBACK = 290;

/** @deprecated Use `useRatingDefaults().data?.max_weekly_earnings` instead. */
export const WEEKLY_EARNINGS_MAX = WEEKLY_EARNINGS_MAX_FALLBACK;

export interface ApiErrorDetail {
  code?: string;
  message?: string;
}

export function extractApiError(serverDetail: unknown): ApiErrorDetail | null {
  if (!serverDetail || typeof serverDetail !== "object") return null;
  const detail = (serverDetail as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") return null;
  return detail as ApiErrorDetail;
}
