/**
 * features/files/handler/hooks/useRagUploadPreference.ts
 *
 * Tiny localStorage-backed toggle for "Process for RAG immediately" on
 * menu uploads. When on, the upload sets `options.rag.trigger_now = true`
 * so the backend runs RAG at upload time instead of waiting for the
 * scheduled auto-RAG sweep.
 *
 * Default OFF. Only menu/explicit uploads consume this — drag-drop leaves
 * it unset (the scheduled sweep still runs).
 */

"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "cloud-files:rag-trigger-now";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function useRagUploadPreference(): {
  triggerNow: boolean;
  setTriggerNow: (next: boolean) => void;
} {
  const [triggerNow, setTriggerNowState] = useState<boolean>(false);

  // Hydrate from localStorage after mount (avoids SSR/client mismatch).
  useEffect(() => {
    setTriggerNowState(read());
  }, []);

  const setTriggerNow = useCallback((next: boolean) => {
    setTriggerNowState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* storage unavailable — keep the in-memory value */
    }
  }, []);

  return { triggerNow, setTriggerNow };
}
