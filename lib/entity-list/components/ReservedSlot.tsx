"use client";

/**
 * ONE RESERVED TOOLBAR SLOT: the slot element and the inline script that reserves its remembered
 * size while the server's HTML is still being parsed (see `useReservedSlot`).
 *
 * The script writes `min-width`, `min-height` and `display` onto the slot BEFORE React hydrates, and
 * the client's first render carries the same reservation (or none on a first visit) — so the slot's
 * `style` attribute differs from the server's HTML by design. `suppressHydrationWarning` sits on
 * exactly this element for exactly that reason; nothing below it is exempted (React only waives the
 * element's own attributes, never its children).
 */
import type { CSSProperties } from "react";

import { reserveSlotScript } from "./useReservedSlot";

export function ReservedSlot({
  slotRef,
  style,
  surfaceKey,
  name,
  reserve,
  className,
  ...data
}: {
  slotRef: (element: HTMLDivElement | null) => void;
  style: CSSProperties | undefined;
  surfaceKey: string | undefined;
  name: string;
  reserve: boolean;
  className: string;
} & Record<`data-${string}`, string>) {
  return (
    <>
      <div ref={slotRef} style={style} className={className} suppressHydrationWarning {...data} />
      {surfaceKey && reserve ? (
        <script suppressHydrationWarning dangerouslySetInnerHTML={{ __html: reserveSlotScript(surfaceKey, name) }} />
      ) : null}
    </>
  );
}
