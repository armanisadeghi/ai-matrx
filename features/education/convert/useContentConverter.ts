// features/education/convert/useContentConverter.ts
//
// The React entry point to the converter contract. Resolves dispatch + store +
// personal org for you and exposes `convert(request)` (one target) and
// `convertMany(source, kinds, options)` (the kit fan-out — parallel, each target
// resolves/fails independently). Use this from any surface that offers a
// "make this into X" action.

"use client";

import { useCallback } from "react";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { ensureOrgId } from "@/lib/organizations/personalOrg";
import { runConvert } from "./registry";
import "./generators"; // ensure generators are registered even if index.ts wasn't imported
import type {
  ConvertOptions,
  ConvertRequest,
  ConvertResult,
  ConvertSource,
  TargetKind,
} from "./types";

/** One target's outcome in a fan-out — success carries the result, failure the reason. */
export type KitTargetOutcome =
  | { targetKind: TargetKind; status: "success"; result: ConvertResult }
  | { targetKind: TargetKind; status: "error"; error: string };

export interface UseContentConverter {
  /** Convert a source into ONE target. Throws on failure. */
  convert: (
    request: ConvertRequest,
    onRequestId?: (id: string) => void,
  ) => Promise<ConvertResult>;
  /**
   * Fan a single source out to MANY targets in parallel — the kit flow. Never
   * throws: each target resolves to a success or error outcome, so one failing
   * generator (e.g. a rate-limited agent) does not sink the rest.
   */
  convertMany: (
    source: ConvertSource,
    kinds: TargetKind[],
    options?: ConvertOptions,
    onEach?: (outcome: KitTargetOutcome) => void,
    onRequestId?: (kind: TargetKind, id: string) => void,
  ) => Promise<KitTargetOutcome[]>;
}

export function useContentConverter(): UseContentConverter {
  const dispatch = useAppDispatch();
  const store = useAppStore();

  const convert = useCallback(
    async (request: ConvertRequest, onRequestId?: (id: string) => void) => {
      const orgId = await ensureOrgId(undefined);
      return runConvert(request, { dispatch, store, orgId, onRequestId });
    },
    [dispatch, store],
  );

  const convertMany = useCallback(
    async (
      source: ConvertSource,
      kinds: TargetKind[],
      options?: ConvertOptions,
      onEach?: (outcome: KitTargetOutcome) => void,
      onRequestId?: (kind: TargetKind, id: string) => void,
    ): Promise<KitTargetOutcome[]> => {
      const orgId = await ensureOrgId(undefined);
      return Promise.all(
        kinds.map(async (targetKind): Promise<KitTargetOutcome> => {
          try {
            const result = await runConvert(
              { source, targetKind, options },
              {
                dispatch,
                store,
                orgId,
                onRequestId: onRequestId
                  ? (id) => onRequestId(targetKind, id)
                  : undefined,
              },
            );
            const outcome: KitTargetOutcome = {
              targetKind,
              status: "success",
              result,
            };
            onEach?.(outcome);
            return outcome;
          } catch (e) {
            const outcome: KitTargetOutcome = {
              targetKind,
              status: "error",
              error: e instanceof Error ? e.message : "Generation failed",
            };
            onEach?.(outcome);
            return outcome;
          }
        }),
      );
    },
    [dispatch, store],
  );

  return { convert, convertMany };
}
