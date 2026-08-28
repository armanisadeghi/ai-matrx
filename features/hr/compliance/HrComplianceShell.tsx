// features/hr/compliance/HrComplianceShell.tsx
//
// THE CHROME FOR `/hr/compliance/*` (SPEC-UI-IA §3.12).
//
// Mounted ONCE by the section's `layout.tsx`, exactly like `HrSettingsChrome`: the
// tab bar keeps its pending state across a hop instead of remounting, and a page
// never renders a second bar that could disagree with this one.
//
// 🚨 THE CHROME RUNS NO GATE. Every door under `/hr/compliance` has its own server
// answer and its own audience — the law portal is HR-admin, and the surfaces that
// will land beside it are not necessarily the same rung. A chrome-level gate here
// would be a client-side guess layered over a server verdict, and the first time the
// two disagreed the honest one would lose. Each page renders its own refusal in
// place through `HrPageState`.

"use client";

import type { ReactNode } from "react";
import { Scale } from "lucide-react";

import { HrSubShell, type HrRouteTab } from "../shared/HrSubShell";
import { useHrContext } from "../shared/useHrContext";
import { hrComplianceLawsHref, type HrOrgRef } from "../routes";

/**
 * The section's tabs. ONE for v1 — the law portal (D25). Compliance's other
 * surfaces (work authorization, access review, the exception board) are other
 * lanes' and land here as they ship.
 */
export const HR_COMPLIANCE_TABS = [
  {
    key: "laws",
    label: "Laws & rules",
    icon: Scale,
    title: "Laws & rules",
    description:
      "The employment law that reaches this employer, and the rules you layer over it.",
    href: (org: HrOrgRef) => hrComplianceLawsHref(org),
  },
] as const;

export type HrComplianceTabKey = (typeof HR_COMPLIANCE_TABS)[number]["key"];

export function HrComplianceChrome({
  tab,
  children,
}: {
  tab: HrComplianceTabKey;
  children: ReactNode;
}) {
  const { orgRef } = useHrContext();
  const active = HR_COMPLIANCE_TABS.find((entry) => entry.key === tab);
  const tabs: HrRouteTab[] = HR_COMPLIANCE_TABS.map((entry) => ({
    key: entry.key,
    label: entry.label,
    icon: entry.icon,
    href: entry.href(orgRef),
  }));

  return (
    <HrSubShell
      tabs={tabs}
      title={active?.title ?? "Compliance"}
      description={active?.description}
    >
      {children}
    </HrSubShell>
  );
}
