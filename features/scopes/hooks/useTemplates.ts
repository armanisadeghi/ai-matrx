// features/scopes/hooks/useTemplates.ts
//
// Public hook for the read-only templates catalog. Fires the fetch on
// first mount of the gallery; subsequent mounts are served from cache.

"use client";

import { useEffect, useMemo } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectTemplatesError,
  selectTemplatesList,
  selectTemplatesStatus,
} from "@/features/scopes/redux/selectors/templates";
import { ensureTemplates } from "@/features/scopes/redux/thunks/ensureTemplates";
import type { ContextTemplate } from "@/features/scopes/types";

export interface UseTemplatesReturn {
  templates: ContextTemplate[];
  status: ReturnType<typeof selectTemplatesStatus>;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useTemplates(): UseTemplatesReturn {
  const dispatch = useAppDispatch();
  const templates = useAppSelector(selectTemplatesList);
  const status = useAppSelector(selectTemplatesStatus);
  const error = useAppSelector(selectTemplatesError);

  useEffect(() => {
    void dispatch(ensureTemplates());
  }, [dispatch]);

  return useMemo(
    () => ({
      templates,
      status,
      error,
      refresh: () => dispatch(ensureTemplates({ refresh: true })),
    }),
    [templates, status, error, dispatch],
  );
}
