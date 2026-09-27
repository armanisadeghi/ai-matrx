"use client";

import { useEffect, useRef } from "react";
import { installHeaderCrowdingGuard } from "./header-crowding";

/**
 * Mounts the header crowding guard on the shell header that contains it.
 * Renders an empty, unfocusable marker only. Why the guard exists:
 * `header-crowding.ts`.
 */
export function HeaderCrowdingGuard() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const header = marker.current?.closest<HTMLElement>(".shell-header");
    if (!header) return;
    return installHeaderCrowdingGuard(header);
  }, []);

  return <span ref={marker} hidden aria-hidden="true" />;
}
