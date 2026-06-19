"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps focus on a rapid-entry input after an async add completes.
 *
 * Inputs are often disabled while `isBusy` — calling `focus()` immediately
 * after `await` hits a still-disabled field. Call `scheduleRefocus()` on
 * success; the effect refocuses once `isBusy` is false and React re-renders.
 */
export function useRefocusInputAfterAsync(isBusy: boolean) {
  const inputRef = useRef<HTMLInputElement>(null);
  const shouldRefocusRef = useRef(false);

  const scheduleRefocus = () => {
    shouldRefocusRef.current = true;
  };

  useEffect(() => {
    if (!shouldRefocusRef.current || isBusy) return;
    shouldRefocusRef.current = false;
    inputRef.current?.focus();
  }, [isBusy]);

  return { inputRef, scheduleRefocus };
}
