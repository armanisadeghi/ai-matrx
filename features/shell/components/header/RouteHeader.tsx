// RouteHeader — the canonical three-part route header.
//
// Pass three nodes; it handles everything else:
//   - Injects into the shell header center slot via <PageHeader> (transparent,
//     no border/background — children bring their own glass).
//   - LEFT and RIGHT sit in normal flow at the edges; CENTER is absolutely
//     pinned to the viewport center of the injection zone (`left-1/2 -translate-x-1/2`)
//     so its position never shifts when left/right text or actions change width.
//     A ResizeObserver derives the bounded width available to the center slot
//     (`total - 2 * max(left, right)`) so RouteModeNav can still collapse
//     full → icons → menu without overlapping the flanks.
//
//   <RouteHeader
//     left={<><BackButton /><span>{title}</span></>}
//     center={<ModeNav ... />}
//     right={<CopyButton ... />}
//   />
//
// Pairs with the `paddingTop: var(--shell-header-h)` content pattern on the
// page so the body flows seamlessly under the transparent header.
//
// Rules (enforced by convention — see the route-header skill):
//   - ONE canonical control per choice. Don't add a second control (e.g. a
//     dropdown in `left`) that duplicates a selection already owned by `center`.
//   - Header regions must NOT resize with their content. Use static labels or
//     fixed/min-w slots — never a content-sized control that shifts the layout.
//   - Tap buttons self-space (44pt touch target). Don't add gap/padding around
//     them inside a region; space only non-tap items with margins.

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import PageHeader from "./PageHeader";

interface RouteHeaderProps {
  /** Back affordance + title/identity. Kept layout-stable (no content-sized controls). */
  left?: React.ReactNode;
  /** The canonical navigation/selection for this route's sub-views. Stays centered. */
  center?: React.ReactNode;
  /** Contextual actions. Tap buttons self-space; overflow into "…" only when non-redundant. */
  right?: React.ReactNode;
}

function centerSlotWidth(
  total: number,
  leftWidth: number,
  rightWidth: number,
): number {
  if (total <= 0) return 0;
  // Center is pinned at 50%; the nav may extend equally left/right from there.
  return Math.max(0, total - 2 * Math.max(leftWidth, rightWidth));
}

export default function RouteHeader({ left, center, right }: RouteHeaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const [boundedCenterWidth, setBoundedCenterWidth] = useState(0);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      setBoundedCenterWidth(
        centerSlotWidth(
          root.clientWidth,
          leftRef.current?.offsetWidth ?? 0,
          rightRef.current?.offsetWidth ?? 0,
        ),
      );
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (leftRef.current) ro.observe(leftRef.current);
    if (rightRef.current) ro.observe(rightRef.current);
    return () => ro.disconnect();
  }, [left, center, right]);

  return (
    <PageHeader>
      <div
        ref={rootRef}
        className="relative flex w-full min-w-0 items-center justify-between"
      >
        <div ref={leftRef} className="relative z-10 flex min-w-0 items-center">
          {left}
        </div>
        <div
          ref={rightRef}
          className="relative z-10 flex min-w-0 items-center justify-end"
        >
          {right}
        </div>
        {center ? (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden"
            style={
              boundedCenterWidth > 0 ? { width: boundedCenterWidth } : undefined
            }
          >
            <div className="pointer-events-auto w-full min-w-0">{center}</div>
          </div>
        ) : null}
      </div>
    </PageHeader>
  );
}
