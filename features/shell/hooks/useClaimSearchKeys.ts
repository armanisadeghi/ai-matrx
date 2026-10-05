"use client";

import { useEffect, useRef } from "react";
import { claimSearchKeys, searchKeyOf, type ClaimableSearchKey } from "./searchKeyClaim";

/**
 * Let the mounted route own Cmd/Ctrl+K and/or Cmd/Ctrl+P. While mounted the
 * shell's global search (Cmd+K) stays closed and the browser's print dialog
 * (Cmd+P) is suppressed; `onKey` runs instead. Return `false` from `onKey` to
 * decline a press (e.g. Cmd+K inside a text selection) — the key then falls
 * through to the global handler untouched.
 *
 * Docs: features/shell/FEATURE.md § A ROUTE CAN OWN CMD+K / CMD+P.
 */
export function useClaimSearchKeys(
  keys: readonly ClaimableSearchKey[],
  onKey: (key: ClaimableSearchKey, e: KeyboardEvent) => boolean | void,
): void {
  const handler = useRef(onKey);
  handler.current = onKey;
  const keyList = keys.join(",");

  useEffect(() => {
    const mine = keyList.split(",").filter(Boolean) as ClaimableSearchKey[];
    const release = claimSearchKeys(mine);
    const onKeyDown = (e: KeyboardEvent) => {
      const k = searchKeyOf(e);
      if (!k || !mine.includes(k) || e.repeat) return;
      if (handler.current(k, e) === false) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      release();
    };
  }, [keyList]);
}
