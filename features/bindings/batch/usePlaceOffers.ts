"use client";

// features/bindings/batch/usePlaceOffers.ts
//
// WHAT EACH PLACE IN THE BATCH OFFERS — read per place, lazily, exactly the way
// the shortcut batch grid reads each surface's declared values when its row
// appears (`BatchBindingCell` dispatches `loadSurfaceValues` on mount). A batch
// over twenty jobs must never read twenty offers to show one.
//
// The two paths are the SAME two the single-place screen has:
//   · a code provision  → `fetchProvision` (cached, shared).
//   · described inputs  → the served input surface, through the ONE derivation
//     (`described-offer.ts`), so a job's offer is the same object whichever
//     mode is asking. D18.1: described inputs ARE the provision.
//
// 🚨 Never derived from the mandate row alone. If the server cannot answer,
// this hook says so IN WORDS and the row goes red — it does not guess an offer,
// which is the derivation that produced the "no provision" lie in the first
// place.

import { useEffect, useRef, useState } from "react";

import { callApi } from "@/lib/api/call-api";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { fetchProvision } from "@/features/mandates/provisions";
import { parseMandateInputSurface } from "@/features/mandates/input-surface";
import { parseMandateWave1 } from "@/features/mandates/provision-shapes";
import type { MandateRowDb } from "@/features/mandates/workspace/useMandateWorkspaceData";
import { describedOfferFrom } from "../described-offer";
import type { PlaceOfferState } from "./batch-model";

const LOADING: PlaceOfferState = { status: "loading" };

export function usePlaceOffers(
  places: readonly MandateRowDb[],
): (key: string) => PlaceOfferState {
  const dispatch = useAppDispatch();
  // The same hydration race the served run form hit: `callApi` refuses until
  // the active organization has hydrated, and a fetch fired before then fails
  // permanently with no retry.
  const organizationId = useAppSelector(selectOrganizationId);
  const [byKey, setByKey] = useState<Record<string, PlaceOfferState>>({});
  const startedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    for (const place of places) {
      const key = place.mandate_key;
      if (startedRef.current.has(key)) continue;
      startedRef.current.add(key);
      void (async () => {
        try {
          const wave1 = parseMandateWave1(place);
          if (wave1.provisionKey) {
            const offer = await fetchProvision(wave1.provisionKey);
            if (!live) return;
            setByKey((prev) => ({
              ...prev,
              [key]: offer
                ? { status: "ready", offered: offer.values }
                : {
                    status: "error",
                    message: `This job names the provision "${wave1.provisionKey}", which no longer exists — nothing can be mapped until that is fixed.`,
                  },
            }));
            return;
          }
          const result = await dispatch(
            callApi({
              path: "/mandates/{mandate_key}/input-surface",
              method: "GET",
              pathParams: { mandate_key: key },
            }),
          );
          if (!live) return;
          if (result.error) {
            setByKey((prev) => ({
              ...prev,
              [key]: {
                status: "error",
                message:
                  result.error?.message ||
                  "This job's inputs could not be read from the server.",
              },
            }));
            return;
          }
          const offer = describedOfferFrom({
            mandateKey: key,
            label: place.label,
            draftInputs: (place as { draft_inputs?: unknown }).draft_inputs,
            surface: parseMandateInputSurface(result.data, key),
          });
          setByKey((prev) => ({
            ...prev,
            [key]: { status: "ready", offered: offer?.values ?? [] },
          }));
        } catch (err) {
          if (!live) return;
          setByKey((prev) => ({
            ...prev,
            [key]: {
              status: "error",
              message:
                err instanceof Error
                  ? err.message
                  : "This job's inputs could not be read.",
            },
          }));
        }
      })();
    }
    return () => {
      live = false;
    };
  }, [places, organizationId, dispatch]);

  return (key: string) => byKey[key] ?? LOADING;
}
