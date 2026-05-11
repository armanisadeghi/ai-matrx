"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectIsAuthenticated,
  selectUserId,
} from "@/lib/redux/slices/userSlice";
import { callApi, type ApiCallResult } from "@/lib/api/call-api";
import {
  useCalculateReport,
  useCreateClaim,
  useEnsureReport,
} from "../api/hooks";
import { claimsKeys } from "../api/claims";
import {
  extractApiError,
  type WcClaimRead,
  type WcInjuryRead,
} from "../api/types";
import {
  claimDraftToCreate,
  claimDraftToPatch,
  injuryDraftToCreate,
  injuryDraftToPatch,
} from "./buildPersistencePayloads";
import type { RatingDraft } from "./types";

const WC_RATINGS_BASE = "/legal/wc/ratings";

// `bookmark` is gone — wc_claim now carries user_id directly, so creating
// the claim IS the saved-case write. The "Saved cases" page reads wc_claim
// via Supabase + RLS, no separate join table.
export type SaveStep = "claim" | "report" | "injuries" | "calculate";

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving"; step: SaveStep }
  | { kind: "saved"; claimId: string; reportId: string }
  | { kind: "error"; message: string }
  | { kind: "needs_login" };

export interface SaveResult {
  claimId: string;
  reportId: string;
  injuryIds: Record<string, string>;
}

export function useSaveCase() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const isAuthed = useAppSelector(selectIsAuthenticated);
  const qc = useQueryClient();

  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const createClaim = useCreateClaim();
  const ensureReport = useEnsureReport();
  const calculate = useCalculateReport();

  const save = useCallback(
    async (draft: RatingDraft): Promise<SaveResult | null> => {
      if (!isAuthed || !userId) {
        setStatus({ kind: "needs_login" });
        return null;
      }

      try {
        setStatus({ kind: "saving", step: "claim" });
        const claim = await createClaim.mutateAsync(
          claimDraftToCreate(draft.claim),
        );

        setStatus({ kind: "saving", step: "report" });
        const report = await ensureReport(claim.id);

        setStatus({ kind: "saving", step: "injuries" });
        const injuryIds: Record<string, string> = {};
        for (const injury of draft.injuries) {
          const result = (await dispatch(
            callApi({
              path: `${WC_RATINGS_BASE}/reports/{report_id}/injuries` as never,
              method: "POST",
              pathParams: { report_id: report.id } as never,
              body: injuryDraftToCreate(injury) as never,
            }),
          )) as ApiCallResult<WcInjuryRead>;
          if (result.error) {
            const detail = extractApiError(result.error.serverDetail);
            throw new Error(detail?.message ?? result.error.message);
          }
          injuryIds[injury.tmpId] = result.data!.id;
        }

        setStatus({ kind: "saving", step: "calculate" });
        await calculate.mutateAsync(report.id);

        // Invalidate the saved-cases list so the user's new claim appears
        // immediately on the cases page (RLS surfaces it once user_id was
        // set on the row by the create endpoint).
        qc.invalidateQueries({ queryKey: claimsKeys.list(userId) });

        setStatus({ kind: "saved", claimId: claim.id, reportId: report.id });
        return { claimId: claim.id, reportId: report.id, injuryIds };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Save failed";
        setStatus({ kind: "error", message });
        return null;
      }
    },
    [
      calculate,
      createClaim,
      dispatch,
      ensureReport,
      isAuthed,
      qc,
      userId,
    ],
  );

  /**
   * Update an already-persisted case in place. Used in saved-case mode
   * when the user edits any field (claim metadata, optional record-
   * keeping fields, or the injury list) and clicks Save changes.
   *
   * Steps:
   *   1. PATCH the claim (carries gender / case_number / evaluator_name /
   *      comments alongside the rating-critical fields).
   *   2. DELETE every injury the user removed (tracked in
   *      `draft.removedPersistedInjuryIds`).
   *   3. For each injury currently in the draft:
   *        - PATCH if it has a `persistedId` (server-known)
   *        - POST if it doesn't (added after the case was loaded)
   *   4. Recalculate the report so derived totals are fresh.
   *   5. Invalidate the saved-cases list cache so any updated_at-driven
   *      sort reflects this edit on the cases page.
   */
  const update = useCallback(
    async (draft: RatingDraft): Promise<SaveResult | null> => {
      if (!isAuthed || !userId) {
        setStatus({ kind: "needs_login" });
        return null;
      }
      const claimId = draft.persistedClaimId;
      const reportId = draft.persistedReportId;
      if (!claimId || !reportId) {
        setStatus({
          kind: "error",
          message: "Can't update — case isn't saved yet.",
        });
        return null;
      }

      try {
        setStatus({ kind: "saving", step: "claim" });
        const patchResult = (await dispatch(
          callApi({
            path: `${WC_RATINGS_BASE}/claims/{claim_id}` as never,
            method: "PATCH",
            pathParams: { claim_id: claimId } as never,
            body: claimDraftToPatch(draft.claim) as never,
          }),
        )) as ApiCallResult<WcClaimRead>;
        if (patchResult.error) {
          const detail = extractApiError(patchResult.error.serverDetail);
          throw new Error(detail?.message ?? patchResult.error.message);
        }

        setStatus({ kind: "saving", step: "injuries" });
        for (const injuryId of draft.removedPersistedInjuryIds ?? []) {
          const delResult = await dispatch(
            callApi({
              path: `${WC_RATINGS_BASE}/injuries/{injury_id}` as never,
              method: "DELETE",
              pathParams: { injury_id: injuryId } as never,
            }),
          );
          // 404 = already gone; tolerate it.
          if (delResult.error && delResult.error.status !== 404) {
            const detail = extractApiError(delResult.error.serverDetail);
            throw new Error(detail?.message ?? delResult.error.message);
          }
        }

        const injuryIds: Record<string, string> = {};
        for (const injury of draft.injuries) {
          if (injury.persistedId) {
            const patch = (await dispatch(
              callApi({
                path: `${WC_RATINGS_BASE}/injuries/{injury_id}` as never,
                method: "PATCH",
                pathParams: { injury_id: injury.persistedId } as never,
                body: injuryDraftToPatch(injury) as never,
              }),
            )) as ApiCallResult<WcInjuryRead>;
            if (patch.error) {
              const detail = extractApiError(patch.error.serverDetail);
              throw new Error(detail?.message ?? patch.error.message);
            }
            injuryIds[injury.tmpId] = injury.persistedId;
          } else {
            const created = (await dispatch(
              callApi({
                path: `${WC_RATINGS_BASE}/reports/{report_id}/injuries` as never,
                method: "POST",
                pathParams: { report_id: reportId } as never,
                body: injuryDraftToCreate(injury) as never,
              }),
            )) as ApiCallResult<WcInjuryRead>;
            if (created.error) {
              const detail = extractApiError(created.error.serverDetail);
              throw new Error(detail?.message ?? created.error.message);
            }
            injuryIds[injury.tmpId] = created.data!.id;
          }
        }

        setStatus({ kind: "saving", step: "calculate" });
        await calculate.mutateAsync(reportId);

        // Bump the saved-cases list cache so any updated_at-driven sort
        // reflects this edit.
        qc.invalidateQueries({ queryKey: claimsKeys.list(userId) });

        setStatus({ kind: "saved", claimId, reportId });
        return { claimId, reportId, injuryIds };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Update failed";
        setStatus({ kind: "error", message });
        return null;
      }
    },
    [calculate, dispatch, isAuthed, qc, userId],
  );

  const reset = useCallback(() => setStatus({ kind: "idle" }), []);

  return { status, save, update, reset, isAuthed };
}
