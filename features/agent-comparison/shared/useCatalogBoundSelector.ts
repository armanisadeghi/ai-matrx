"use client";

/**
 * Battle columns are named after their model, read from the model catalog
 * (`readModelRecords()`), which is NOT part of the Redux store. A plain
 * `useAppSelector(selectActiveBattleColumns)` therefore only re-reads the names
 * when some other store state changes — a model list that finishes loading
 * left "Model 3" on screen. This hook subscribes to the catalog's records and
 * hands `useAppSelector` a selector whose identity changes with them, so
 * react-redux re-runs it the moment the catalog loads.
 */

import { useCallback } from "react";
import { useModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import { useAppSelector } from "@/lib/redux/hooks";
import type { RootState } from "@/lib/redux/store";

export function useCatalogBoundSelector<T>(selector: (state: RootState) => T): T {
  const entities = useModelRecords((s) => s.entities);
  const identities = useModelRecords((s) => s.identityById);
  const bound = useCallback(
    (state: RootState) => {
      void entities;
      void identities;
      return selector(state);
    },
    [selector, entities, identities],
  );
  return useAppSelector(bound);
}
