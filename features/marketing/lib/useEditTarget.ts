"use client";

/**
 * Deep link to a field: `?edit=<target>` opens the page's existing editor and focuses the field
 * that carries `data-edit-target="<target>"`. aidream's readiness gate writes these links
 * (`mandate.readiness_verdict.missing[].fill_url`), so a "Not ready" flag lands ON the missing input.
 *
 * The state is the URL, so it survives redirects (the legacy brand tree forwards the query string).
 * Focus happens once per mount; the field mounts late (dialogs, loaded drafts), so the lookup retries
 * for about two seconds. Focusing never moves layout.
 */

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export const EDIT_PARAM = "edit";

/** True when the address asks for this field to be edited. */
export function useIsEditTarget(target: string): boolean {
  return useSearchParams().get(EDIT_PARAM) === target;
}

/** Focus the field `data-edit-target="<target>"` once `ready` and the address names it. */
export function useFocusEditTarget(target: string, ready = true): void {
  const wanted = useIsEditTarget(target);
  const done = useRef(false);
  useEffect(() => {
    if (!wanted || !ready || done.current) return;
    let frame = 0;
    let tries = 0;
    const attempt = () => {
      const host = document.querySelector<HTMLElement>(`[data-edit-target="${target}"]`);
      const el =
        host && /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(host.tagName)
          ? host
          : host?.querySelector<HTMLElement>("input, textarea, select");
      if (el && !(el as HTMLInputElement).disabled) {
        el.focus();
        done.current = true;
        return;
      }
      if (++tries < 120) frame = requestAnimationFrame(attempt);
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, [wanted, ready, target]);
}
