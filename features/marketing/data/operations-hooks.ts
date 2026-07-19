"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { MatrxDataTableQueryState } from "@/components/official/matrx-data-table/types";
import {
  getBatch,
  getSiteCostTotal,
  listBatchItems,
  listBatches,
  listSiteCosts,
  listWorkspaceCosts,
} from "@/features/marketing/data/operations-queries";
import type {
  SiteCostMode,
  WorkspaceCostMode,
} from "@/features/marketing/data/operations-types";

const operationsKeys = {
  root: ["marketing", "operations"] as const,
  batches: (state: MatrxDataTableQueryState) =>
    [...operationsKeys.root, "batches", state] as const,
  batch: (batchId: string) =>
    [...operationsKeys.root, "batch", batchId] as const,
  batchItems: (
    siteId: string,
    batchId: string,
    state: MatrxDataTableQueryState,
  ) =>
    [
      ...operationsKeys.batch(batchId),
      "site",
      siteId,
      "items",
      state,
    ] as const,
  siteCost: (
    siteId: string,
    mode: SiteCostMode,
    state: MatrxDataTableQueryState,
  ) => [...operationsKeys.root, "site-cost", siteId, mode, state] as const,
  siteCostTotal: (siteId: string) =>
    [...operationsKeys.root, "site-cost-total", siteId] as const,
  workspaceCost: (
    mode: WorkspaceCostMode,
    state: MatrxDataTableQueryState,
  ) => [...operationsKeys.root, "workspace-cost", mode, state] as const,
};

export function useBatches(state: MatrxDataTableQueryState) {
  return useQuery({
    queryKey: operationsKeys.batches(state),
    queryFn: ({ signal }) => listBatches(state, signal),
    placeholderData: keepPreviousData,
  });
}

export function useBatch(batchId: string) {
  return useQuery({
    queryKey: operationsKeys.batch(batchId),
    queryFn: ({ signal }) => getBatch(batchId, signal),
    enabled: Boolean(batchId),
  });
}

export function useBatchItems(
  siteId: string,
  batchId: string,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: operationsKeys.batchItems(siteId, batchId, state),
    queryFn: ({ signal }) => listBatchItems(siteId, batchId, state, signal),
    enabled: Boolean(siteId && batchId),
    placeholderData: keepPreviousData,
  });
}

export function useSiteCosts(
  siteId: string,
  mode: SiteCostMode,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: operationsKeys.siteCost(siteId, mode, state),
    queryFn: ({ signal }) => listSiteCosts(siteId, mode, state, signal),
    enabled: Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useSiteCostTotal(siteId: string) {
  return useQuery({
    queryKey: operationsKeys.siteCostTotal(siteId),
    queryFn: ({ signal }) => getSiteCostTotal(siteId, signal),
    enabled: Boolean(siteId),
  });
}

export function useWorkspaceCosts(
  mode: WorkspaceCostMode,
  state: MatrxDataTableQueryState,
) {
  return useQuery({
    queryKey: operationsKeys.workspaceCost(mode, state),
    queryFn: ({ signal }) => listWorkspaceCosts(mode, state, signal),
    placeholderData: keepPreviousData,
  });
}
