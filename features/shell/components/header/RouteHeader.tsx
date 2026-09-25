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
//
// Narrow widths (platform behaviour, inherited by every consumer — 2026-09-25):
//   - RIGHT folds. Pass actions as siblings (fragments are fine); when they do not all
//     fit beside a title of TITLE_MIN_PX, the leftmost fold into ONE "…" overflow that
//     opens them as a glass strip. Order your actions lowest-priority first, primary
//     last. A single wrapper component is one action and cannot fold — pass siblings.
//   - LEFT always ellipsizes. Loose text inside a flex/grid host element is wrapped in a
//     truncating span (see route-header-layout.tsx), so a clipped title ends in "…".

"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { MoreHorizontalTapButton } from "@ai-matrx/tap-target/buttons";
import PageHeader from "./PageHeader";
import {
  DEFAULT_ACTION_PX,
  TITLE_MIN_PX,
  ellipsizeLooseText,
  flattenActions,
  foldCount,
} from "./route-header-layout";

interface RouteHeaderProps {
  /** Back affordance + title/identity. Kept layout-stable (no content-sized controls). */
  left?: React.ReactNode;
  /** The canonical navigation/selection for this route's sub-views. Stays centered. */
  center?: React.ReactNode;
  /** Contextual actions, lowest priority first. Pass siblings — they fold into "…" when the row is narrow. */
  right?: React.ReactNode;
  /** Yield to any page-specific header mounted deeper in the route tree. */
  fallback?: boolean;
}

export function centerSlotWidth(
  total: number,
  leftWidth: number,
  rightWidth: number,
): number {
  if (total <= 0) return 0;
  // Center is pinned at 50%; the nav may extend equally left/right from there.
  return Math.max(0, total - 2 * Math.max(leftWidth, rightWidth));
}

/** The left region's natural (unclipped) width, read without a paint. */
function naturalWidth(el: HTMLElement): number {
  const { width, flexShrink } = el.style;
  el.style.width = "max-content";
  el.style.flexShrink = "0";
  const w = el.offsetWidth;
  el.style.width = width;
  el.style.flexShrink = flexShrink;
  return w;
}

export default function RouteHeader({
  left,
  center,
  right,
  fallback = false,
}: RouteHeaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLSpanElement>(null);
  const widthsRef = useRef(new Map<string, number>());
  const [boundedCenterWidth, setBoundedCenterWidth] = useState(0);
  const [folded, setFolded] = useState(0);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const actions = flattenActions(right);
  const leftNode = ellipsizeLooseText(left);
  const actionKeys = actions.map((a) => a.key).join("|");
  const fold = Math.min(folded, actions.length);

  // Latest render's inputs for the (stable) observer callback.
  const liveRef = useRef({ actions, fold });
  useLayoutEffect(() => {
    liveRef.current = { actions, fold };
  });

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const measure = () => {
      const leftEl = leftRef.current;
      const rightEl = rightRef.current;
      const { actions: current, fold: currentFold } = liveRef.current;

      // Record every action currently in the row; folded ones keep their last width.
      rightEl
        ?.querySelectorAll<HTMLElement>("[data-route-header-action]")
        .forEach((el) => {
          const key = el.dataset.routeHeaderAction;
          if (key) widthsRef.current.set(key, el.offsetWidth);
        });

      const reserve = leftEl
        ? Math.min(naturalWidth(leftEl), TITLE_MIN_PX)
        : 0;
      const overflowWidth = overflowRef.current?.offsetWidth || DEFAULT_ACTION_PX;
      const widths = current.map(
        (a) => widthsRef.current.get(a.key) ?? DEFAULT_ACTION_PX,
      );
      const nextFold = foldCount(widths, root.clientWidth - reserve, overflowWidth);
      if (nextFold !== currentFold) setFolded(nextFold);

      setBoundedCenterWidth(
        centerSlotWidth(
          root.clientWidth,
          leftEl?.offsetWidth ?? 0,
          rightEl?.offsetWidth ?? 0,
        ),
      );
    };

    measure();
    // PageHeader mounts through a portal. Its first layout pass can happen
    // before the injection slot has its final width, so measure once more on
    // the next frame instead of leaving the absolute center at auto width.
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (root.parentElement) ro.observe(root.parentElement);
    if (leftRef.current) ro.observe(leftRef.current);
    if (rightRef.current) ro.observe(rightRef.current);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
    // Re-measure whenever the set of actions or the fold point changes.
  }, [actionKeys, fold]);

  const overflowActions = actions.slice(0, fold);
  const rowActions = actions.slice(fold);

  return (
    <PageHeader fallback={fallback}>
      <div
        ref={rootRef}
        data-route-header-root
        className="relative flex w-full min-w-0 items-center justify-between"
      >
        <div
          ref={leftRef}
          data-route-header-left
          // The title yields on ONE line: clipped and ellipsised, never wrapped
          // a letter per line under the actions (375px sample, 2026-09-25).
          className="relative z-10 flex min-w-0 items-center overflow-hidden whitespace-nowrap [&_h1]:truncate [&_h2]:truncate [&_svg]:shrink-0 [&>span]:min-w-0 [&>span]:truncate"
        >
          {leftNode}
        </div>
        <div
          ref={rightRef}
          data-route-header-right
          // Actions never squeeze: they FOLD into "…" (see foldCount) so the
          // title keeps TITLE_MIN_PX. With `min-w-0` here a long title once
          // crushed a phone's header door to an 8px sliver (2026-09-25).
          className="relative z-10 flex shrink-0 items-center justify-end"
        >
          {overflowActions.length > 0 ? (
            <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
              <PopoverTrigger asChild>
                <span
                  ref={overflowRef}
                  data-route-header-overflow
                  className="inline-flex shrink-0"
                >
                  <MoreHorizontalTapButton
                    ariaLabel={`${overflowActions.length} more action${overflowActions.length === 1 ? "" : "s"}`}
                  />
                </span>
              </PopoverTrigger>
              <PopoverContent
                sizing="content"
                align="end"
                sideOffset={6}
                className="w-auto max-w-[calc(100vw-2rem)] p-1"
              >
                <div
                  data-route-header-overflow-strip
                  className="flex flex-wrap items-center justify-end"
                >
                  {overflowActions.map((a) => (
                    <div key={a.key} className="flex shrink-0 items-center">
                      {a.node}
                    </div>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          {rowActions.map((a) => (
            <div
              key={a.key}
              data-route-header-action={a.key}
              className="flex shrink-0 items-center"
            >
              {a.node}
            </div>
          ))}
        </div>
        {center ? (
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 z-0 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden"
            // `width: 100%` is the safe portal-mount fallback. An auto-width
            // absolute child shrink-wraps the currently rendered nav variant;
            // once that variant becomes the menu, the measurement can never
            // grow again to discover that the full or compact nav fits.
            style={{
              width: boundedCenterWidth > 0 ? boundedCenterWidth : "100%",
            }}
          >
            <div className="pointer-events-auto w-full min-w-0">{center}</div>
          </div>
        ) : null}
      </div>
    </PageHeader>
  );
}
