// components/admin/markdown-tester/useMarkdownSamples.ts
// Hook that wraps the Redux slice for the admin Markdown Tester samples.
// Fetches on first mount, exposes a thin imperative surface for the UI.

"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createMarkdownSample,
  deleteMarkdownSample,
  fetchMarkdownSamples,
  updateMarkdownSample,
} from "@/lib/redux/slices/markdownSamples/slice";
import {
  selectMarkdownSamplesList,
  selectMarkdownSamplesListError,
  selectMarkdownSamplesListStatus,
} from "@/lib/redux/slices/markdownSamples/selectors";
import type {
  MarkdownSample,
  SampleCreateInput,
  SampleUpdateInput,
} from "./samples-service";

export interface UseMarkdownSamplesResult {
  samples: MarkdownSample[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: SampleCreateInput) => Promise<MarkdownSample>;
  update: (id: string, patch: SampleUpdateInput) => Promise<MarkdownSample>;
  remove: (id: string) => Promise<void>;
}

export function useMarkdownSamples(): UseMarkdownSamplesResult {
  const dispatch = useAppDispatch();
  const samples = useAppSelector(selectMarkdownSamplesList);
  const status = useAppSelector(selectMarkdownSamplesListStatus);
  const error = useAppSelector(selectMarkdownSamplesListError);

  useEffect(() => {
    if (status === "idle") {
      void dispatch(fetchMarkdownSamples());
    }
  }, [status, dispatch]);

  const refresh = useCallback(async () => {
    await dispatch(fetchMarkdownSamples()).unwrap();
  }, [dispatch]);

  const create = useCallback(
    async (input: SampleCreateInput) => {
      return await dispatch(createMarkdownSample(input)).unwrap();
    },
    [dispatch],
  );

  const update = useCallback(
    async (id: string, patch: SampleUpdateInput) => {
      return await dispatch(updateMarkdownSample({ id, patch })).unwrap();
    },
    [dispatch],
  );

  const remove = useCallback(
    async (id: string) => {
      await dispatch(deleteMarkdownSample(id)).unwrap();
    },
    [dispatch],
  );

  return {
    samples,
    isLoading: status === "loading" || status === "idle",
    error,
    refresh,
    create,
    update,
    remove,
  };
}
