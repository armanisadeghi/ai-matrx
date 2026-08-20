"use client";

/**
 * The safety net + the "still arriving" affordance for a provisional kind
 * render (streaming partial kinds — see `partial-kind-route.ts` and
 * `common-docs/systems/content-ir-system/STREAMING_PARTIAL_KINDS.md`).
 *
 * TWO JOBS
 * --------
 * 1. **Never let a component throw mid-stream.** A provisional value may be
 *    missing required fields. The routed kind opted in to tolerating that
 *    (`partialReady`), but an opt-in is a claim, not a proof — so a throw is
 *    caught here, SCREAMS to the Error Inspector, drops the kind back to
 *    withhold for the session (`markKindPartialUnsafe`), and falls back to the
 *    kind's own loading skeleton. The user sees the pre-partial behavior, not
 *    a broken message.
 * 2. **Say it is still arriving.** The user must be able to tell a live
 *    fill-in from a finished render, and it must not read as an error. A quiet
 *    shimmering "Still arriving" pill sits in the block's top-right corner —
 *    absolutely positioned and `pointer-events-none`, so it costs the content
 *    no layout and cannot shift the page when it disappears.
 *
 * No wrapper chrome: no border, no background, no padding. The kind component
 * already carries its own (CLAUDE.md § Don't wrap a component in wrappers).
 */

import React from "react";
import { ShimmerText } from "@/components/loaders/ShimmerText";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { markKindPartialUnsafe } from "./partial-kind-route";

interface ProvisionalKindBoundaryProps {
  kind: string;
  /** Rendered instead of the children when the provisional render throws. */
  fallback: React.ReactNode;
  children: React.ReactNode;
}

interface ProvisionalKindBoundaryState {
  failed: boolean;
}

export class ProvisionalKindBoundary extends React.Component<
  ProvisionalKindBoundaryProps,
  ProvisionalKindBoundaryState
> {
  override state: ProvisionalKindBoundaryState = { failed: false };

  static getDerivedStateFromError(): ProvisionalKindBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    const { kind } = this.props;
    // Loud recovery: the kind CLAIMED partial-readiness and its component
    // threw on a provisional value. Stop handing it one — for every block, for
    // the rest of the session — and report it as the defect it is.
    markKindPartialUnsafe(kind);
    captureError({
      source: "content-ir",
      message: `kind "${kind}" declares partialReady but its component threw on a provisional value — provisional rendering disabled for this kind (falling back to its loading skeleton). Fix the component or drop partialReady.`,
      name: error.name,
      stack: error.stack,
      relation: "partial-kind",
      raw: { kind, componentStack: info.componentStack },
    });
  }

  override render(): React.ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

/**
 * The "still arriving" frame. `aria-busy` carries the same fact to assistive
 * tech that the pill carries visually.
 */
export const ProvisionalKindFrame: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => (
  <div className="relative" aria-busy="true">
    {children}
    <span className="pointer-events-none absolute right-2 top-2 z-10 select-none">
      <ShimmerText text="Still arriving" className="text-[10px]" />
    </span>
  </div>
);
