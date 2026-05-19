// components/markdown-studio/useUserMarkdownSamples.ts
// Hook that wraps the per-user Markdown Studio samples slice.

"use client";

import { useCallback, useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  createUserMarkdownSample,
  deleteUserMarkdownSample,
  fetchUserMarkdownSamples,
  updateUserMarkdownSample,
} from "@/lib/redux/slices/userMarkdownSamples/slice";
import {
  selectUserMarkdownSamplesList,
  selectUserMarkdownSamplesListError,
  selectUserMarkdownSamplesListStatus,
} from "@/lib/redux/slices/userMarkdownSamples/selectors";
import type {
  UserMarkdownSample,
  UserSampleCreateInput,
  UserSampleUpdateInput,
} from "./user-samples-service";

export interface UseUserMarkdownSamplesResult {
  samples: UserMarkdownSample[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: UserSampleCreateInput) => Promise<UserMarkdownSample>;
  update: (
    id: string,
    patch: UserSampleUpdateInput,
  ) => Promise<UserMarkdownSample>;
  remove: (id: string) => Promise<void>;
}

export function useUserMarkdownSamples(): UseUserMarkdownSamplesResult {
  const dispatch = useAppDispatch();
  const samples = useAppSelector(selectUserMarkdownSamplesList);
  const status = useAppSelector(selectUserMarkdownSamplesListStatus);
  const error = useAppSelector(selectUserMarkdownSamplesListError);

  useEffect(() => {
    if (status === "idle") void dispatch(fetchUserMarkdownSamples());
  }, [status, dispatch]);

  const refresh = useCallback(async () => {
    await dispatch(fetchUserMarkdownSamples()).unwrap();
  }, [dispatch]);

  const create = useCallback(
    async (input: UserSampleCreateInput) =>
      await dispatch(createUserMarkdownSample(input)).unwrap(),
    [dispatch],
  );

  const update = useCallback(
    async (id: string, patch: UserSampleUpdateInput) =>
      await dispatch(updateUserMarkdownSample({ id, patch })).unwrap(),
    [dispatch],
  );

  const remove = useCallback(
    async (id: string) => {
      await dispatch(deleteUserMarkdownSample(id)).unwrap();
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
