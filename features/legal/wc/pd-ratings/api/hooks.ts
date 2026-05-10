"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi, type ApiCallResult } from "@/lib/api/call-api";
import {
  WC_RATINGS_BASE,
  extractApiError,
  type ClaimCreate,
  type ClaimPatch,
  type ImpairmentsResponse,
  type ImpairmentSearch,
  type ImpairmentSearchResponse,
  type InjuryCreate,
  type InjuryPatch,
  type OccupationalCodesResponse,
  type StatelessCalculate,
  type StatelessRatingResponse,
  type WcClaimRead,
  type WcInjuryList,
  type WcInjuryRead,
  type WcReportRead,
} from "./types";

const ONE_HOUR_MS = 1000 * 60 * 60;

const QK = {
  occupationalCodes: ["wc-ratings", "occupational-codes"] as const,
  // v2: backend switched the impairment catalog from a JSON file to the
  // `wc_impairment_definition` table (2026-05-09). Old cached entries had
  // `id: null`, which broke injury creation — bump the key so any user
  // with a hot cache refetches.
  impairments: ["wc-ratings", "impairments", "v2"] as const,
  impairmentSearch: (phrase: string) =>
    ["wc-ratings", "impairment-search", phrase] as const,
  claim: (claimId: string | undefined) =>
    ["wc-ratings", "claim", claimId] as const,
  reportForClaim: (claimId: string | undefined) =>
    ["wc-ratings", "claim-report", claimId] as const,
  report: (reportId: string | undefined) =>
    ["wc-ratings", "report", reportId] as const,
  reportInjuries: (reportId: string | undefined) =>
    ["wc-ratings", "report-injuries", reportId] as const,
};

export const wcRatingsQueryKeys = QK;

class WcRatingsError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly serverDetail: unknown;

  constructor(result: ApiCallResult<unknown>) {
    const detail = extractApiError(result.error?.serverDetail);
    const message =
      detail?.message ?? result.error?.message ?? "Unknown rating API error";
    super(message);
    this.name = "WcRatingsError";
    this.status = result.error?.status;
    this.code = detail?.code;
    this.serverDetail = result.error?.serverDetail;
  }
}

export { WcRatingsError };

function unwrap<T>(result: ApiCallResult<T>): T {
  if (result.error) throw new WcRatingsError(result);
  if (result.data === undefined) {
    throw new WcRatingsError({
      error: {
        type: "unknown",
        message: "Empty response from rating API",
      },
    });
  }
  return result.data;
}

export function useOccupationalCodes(
  options?: Omit<
    UseQueryOptions<OccupationalCodesResponse>,
    "queryKey" | "queryFn"
  >,
) {
  const dispatch = useAppDispatch();
  return useQuery<OccupationalCodesResponse>({
    queryKey: QK.occupationalCodes,
    staleTime: ONE_HOUR_MS,
    ...options,
    queryFn: async () => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/occupational-codes` as never,
          method: "GET",
        }),
      );
      return unwrap(result as ApiCallResult<OccupationalCodesResponse>);
    },
  });
}

export function useImpairments(
  options?: Omit<UseQueryOptions<ImpairmentsResponse>, "queryKey" | "queryFn">,
) {
  const dispatch = useAppDispatch();
  return useQuery<ImpairmentsResponse>({
    queryKey: QK.impairments,
    staleTime: ONE_HOUR_MS,
    ...options,
    queryFn: async () => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/impairments` as never,
          method: "GET",
        }),
      );
      return unwrap(result as ApiCallResult<ImpairmentsResponse>);
    },
  });
}

export function useImpairmentSearch(
  phrase: string,
  options?: Omit<
    UseQueryOptions<ImpairmentSearchResponse>,
    "queryKey" | "queryFn"
  >,
) {
  const dispatch = useAppDispatch();
  const trimmed = phrase.trim();
  return useQuery<ImpairmentSearchResponse>({
    queryKey: QK.impairmentSearch(trimmed),
    enabled: trimmed.length >= 2,
    staleTime: 1000 * 60 * 5,
    ...options,
    queryFn: async () => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/impairments/search` as never,
          method: "POST",
          body: { phrases: [trimmed] } satisfies ImpairmentSearch as never,
        }),
      );
      return unwrap(result as ApiCallResult<ImpairmentSearchResponse>);
    },
  });
}

export function useClaim(claimId: string | undefined) {
  const dispatch = useAppDispatch();
  return useQuery<WcClaimRead>({
    queryKey: QK.claim(claimId),
    enabled: !!claimId,
    queryFn: async () => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/claims/{claim_id}` as never,
          method: "GET",
          pathParams: { claim_id: claimId! } as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcClaimRead>);
    },
  });
}

export function useReportForClaim(claimId: string | undefined) {
  const dispatch = useAppDispatch();
  return useQuery<WcReportRead | null>({
    queryKey: QK.reportForClaim(claimId),
    enabled: !!claimId,
    retry: (count, err) => {
      if (err instanceof WcRatingsError && err.status === 404) return false;
      return count < 1;
    },
    queryFn: async () => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/claims/{claim_id}/report` as never,
          method: "GET",
          pathParams: { claim_id: claimId! } as never,
        }),
      );
      if (result.error?.status === 404) return null;
      return unwrap(result as ApiCallResult<WcReportRead>);
    },
  });
}

export function useReportInjuries(reportId: string | undefined) {
  const dispatch = useAppDispatch();
  return useQuery<WcInjuryList>({
    queryKey: QK.reportInjuries(reportId),
    enabled: !!reportId,
    queryFn: async () => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/reports/{report_id}/injuries` as never,
          method: "GET",
          pathParams: { report_id: reportId! } as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcInjuryList>);
    },
  });
}

export function useStatelessCalculate() {
  const dispatch = useAppDispatch();
  return useMutation<
    StatelessRatingResponse,
    WcRatingsError,
    StatelessCalculate
  >({
    mutationFn: async (body) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/calculate` as never,
          method: "POST",
          body: body as never,
        }),
      );
      return unwrap(result as ApiCallResult<StatelessRatingResponse>);
    },
  });
}

export function useCreateClaim() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation<WcClaimRead, WcRatingsError, ClaimCreate>({
    mutationFn: async (body) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/claims` as never,
          method: "POST",
          body: body as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcClaimRead>);
    },
    onSuccess: (claim) => {
      qc.setQueryData(QK.claim(claim.id), claim);
    },
  });
}

export function useUpdateClaim(claimId: string) {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation<WcClaimRead, WcRatingsError, ClaimPatch>({
    mutationFn: async (body) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/claims/{claim_id}` as never,
          method: "PATCH",
          pathParams: { claim_id: claimId } as never,
          body: body as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcClaimRead>);
    },
    onSuccess: (claim) => {
      qc.setQueryData(QK.claim(claim.id), claim);
    },
  });
}

export function useCreateReport() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation<WcReportRead, WcRatingsError, string>({
    mutationFn: async (claimId) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/claims/{claim_id}/report` as never,
          method: "POST",
          pathParams: { claim_id: claimId } as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcReportRead>);
    },
    onSuccess: (report, claimId) => {
      qc.setQueryData(QK.reportForClaim(claimId), report);
      qc.setQueryData(QK.report(report.id), report);
    },
  });
}

export function useEnsureReport() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useCallback(
    async (claimId: string): Promise<WcReportRead> => {
      const created = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/claims/{claim_id}/report` as never,
          method: "POST",
          pathParams: { claim_id: claimId } as never,
        }),
      );
      const createdResult = created as ApiCallResult<WcReportRead>;
      if (!createdResult.error) {
        qc.setQueryData(QK.reportForClaim(claimId), createdResult.data);
        qc.setQueryData(QK.report(createdResult.data!.id), createdResult.data);
        return createdResult.data!;
      }
      const detail = extractApiError(createdResult.error.serverDetail);
      if (
        createdResult.error.status === 409 &&
        detail?.code === "report_already_exists"
      ) {
        const existing = await dispatch(
          callApi({
            path: `${WC_RATINGS_BASE}/claims/{claim_id}/report` as never,
            method: "GET",
            pathParams: { claim_id: claimId } as never,
          }),
        );
        const existingResult = existing as ApiCallResult<WcReportRead>;
        if (existingResult.error) throw new WcRatingsError(existingResult);
        qc.setQueryData(QK.reportForClaim(claimId), existingResult.data);
        qc.setQueryData(
          QK.report(existingResult.data!.id),
          existingResult.data,
        );
        return existingResult.data!;
      }
      throw new WcRatingsError(createdResult);
    },
    [dispatch, qc],
  );
}

export function useCalculateReport() {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation<WcReportRead, WcRatingsError, string>({
    mutationFn: async (reportId) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/reports/{report_id}/calculate` as never,
          method: "POST",
          pathParams: { report_id: reportId } as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcReportRead>);
    },
    onSuccess: (report) => {
      qc.setQueryData(QK.report(report.id), report);
      qc.invalidateQueries({ queryKey: QK.reportInjuries(report.id) });
    },
  });
}

export function useAddInjury(reportId: string) {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation<WcInjuryRead, WcRatingsError, InjuryCreate>({
    mutationFn: async (body) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/reports/{report_id}/injuries` as never,
          method: "POST",
          pathParams: { report_id: reportId } as never,
          body: body as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcInjuryRead>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.reportInjuries(reportId) });
    },
  });
}

export function useUpdateInjury(reportId: string) {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation<
    WcInjuryRead,
    WcRatingsError,
    { injuryId: string; body: InjuryPatch }
  >({
    mutationFn: async ({ injuryId, body }) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/injuries/{injury_id}` as never,
          method: "PATCH",
          pathParams: { injury_id: injuryId } as never,
          body: body as never,
        }),
      );
      return unwrap(result as ApiCallResult<WcInjuryRead>);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.reportInjuries(reportId) });
    },
  });
}

export function useDeleteInjury(reportId: string) {
  const dispatch = useAppDispatch();
  const qc = useQueryClient();
  return useMutation<void, WcRatingsError, string>({
    mutationFn: async (injuryId) => {
      const result = await dispatch(
        callApi({
          path: `${WC_RATINGS_BASE}/injuries/{injury_id}` as never,
          method: "DELETE",
          pathParams: { injury_id: injuryId } as never,
        }),
      );
      if (result.error) throw new WcRatingsError(result);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK.reportInjuries(reportId) });
    },
  });
}
