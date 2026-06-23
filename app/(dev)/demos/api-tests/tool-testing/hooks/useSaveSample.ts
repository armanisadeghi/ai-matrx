"use client";

import { useState, useCallback } from "react";
import type { TypedStreamEvent } from "@/types/python-generated/stream-events";
import type { FinalPayload } from "@/features/tool-call-visualization/testing/types";

export interface SaveSampleParams {
  toolName: string;
  toolId?: string | null;
  arguments: Record<string, unknown>;
  rawStreamEvents: TypedStreamEvent[];
  finalPayload: FinalPayload | null;
  adminComments?: string | null;
  isSuccess?: boolean | null;
  useForComponent?: boolean;
}

export interface UseSaveSampleReturn {
  save: (params: SaveSampleParams) => Promise<string | null>;
  isSaving: boolean;
  savedId: string | null;
  reset: () => void;
}

export function useSaveSample(authToken?: string | null): UseSaveSampleReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const save = useCallback(
    async (params: SaveSampleParams): Promise<string | null> => {
      setIsSaving(true);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

        const response = await fetch("/api/tool-testing/samples", {
          method: "POST",
          headers,
          body: JSON.stringify({
            tool_name: params.toolName,
            tool_id: params.toolId ?? null,
            arguments: params.arguments,
            raw_stream_events: params.rawStreamEvents,
            final_payload: params.finalPayload,
            admin_comments: params.adminComments ?? null,
            is_success: params.isSuccess ?? null,
            use_for_component: params.useForComponent ?? false,
          }),
        });

        if (!response.ok) {
          const err = await response
            .json()
            .catch(() => ({ message: "Unknown error" }));
          throw new Error(err.message ?? `HTTP ${response.status}`);
        }

        const data = await response.json();
        setSavedId(data.id);
        return data.id as string;
      } finally {
        setIsSaving(false);
      }
    },
    [authToken],
  );

  const reset = useCallback(() => {
    setSavedId(null);
  }, []);

  return { save, isSaving, savedId, reset };
}
