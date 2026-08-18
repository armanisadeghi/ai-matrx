"use client";

import dynamic from "next/dynamic";

import { DeskSkeleton } from "./components/DeskStates";

/**
 * The desk is time-aware — every countdown, every urgency band and the queue
 * order itself are functions of `Date.now()`. Server-rendering that would
 * produce a hydration mismatch on the first tick, so the workspace is
 * client-only behind the repo's existing gate pattern
 * (`features/marketing/components/reputation/ReputationGate.tsx`), with a
 * skeleton in the desk's own geometry so nothing shifts when it arrives.
 */
const PressDeskWorkspace = dynamic(
  () =>
    import("./PressDeskWorkspace").then((module) => module.PressDeskWorkspace),
  {
    ssr: false,
    loading: () => <DeskSkeleton />,
  },
);

export function PressDeskGate() {
  return <PressDeskWorkspace />;
}
