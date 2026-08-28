import type { ReactNode } from "react";

import { createRouteMetadata } from "@/utils/route-metadata";

/**
 * `/hr/compliance/*` — SPEC-UI-IA §3.12.
 *
 * No wrapper element and no shell here. Each page mounts `HrComplianceChrome`
 * (which is `HrSubShell`, which is `HrShell`), exactly like every `/hr` section
 * that is not `/hr/settings`: `HrShell` is `h-full` and its height chain must reach
 * `.shell-main` unbroken, so a plain `<div>` in this file would break the scroll
 * chain from somewhere nobody would think to look, and a second shell would inject a
 * second route header.
 *
 * The employer is resolved ONCE for the whole tree by `app/(core)/hr/layout.tsx`;
 * this layout must not resolve it again.
 */
export const metadata = createRouteMetadata("/hr/compliance", {
  title: "Compliance",
  description:
    "The employment law that reaches this employer, and what your organization layers over it.",
});

export default function HrComplianceLayout({ children }: { children: ReactNode }) {
  return children;
}
