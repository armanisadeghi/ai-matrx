import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

/**
 * `/hr/leave/*` — UI-IA routes 42, 43, 44 and 44a (SPEC-LEAVE §4.4, §5.1, §10, §12).
 *
 * This layout deliberately adds NO wrapper element and NO shell. `LeaveDeskShell` (which is
 * `HrSubShell`, which is `HrShell`) is mounted by each page, exactly like the other `/hr`
 * sections that are not `/hr/settings`: `HrShell` is `h-full` and its height chain runs up to
 * `.shell-main`, so a plain `<div>` here would break that chain from a file nobody would think
 * to look in, and a second shell would inject a second route header.
 *
 * The employer resolution is already provided once for the whole tree by
 * `app/(core)/hr/layout.tsx` — this layout must not resolve it again.
 */
export const metadata = createRouteMetadata("/hr/leave", {
  title: "Time off",
  description:
    "Time-off decisions waiting on you, the balances behind them, and who is out.",
});

export default function HrLeaveLayout({ children }: { children: ReactNode }) {
  return children;
}
