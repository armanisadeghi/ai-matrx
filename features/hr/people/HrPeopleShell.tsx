"use client";

// features/hr/people/HrPeopleShell.tsx
//
// The People section's route-tab bar — `HrSubShell` for routes 10–17.
//
// 🚨 A TAB THIS VIEWER CANNOT USE IS ABSENT FROM THE BAR, not disabled. That is
// §4.2 applied to navigation, and it is why `visible` is computed from the live
// capability set rather than from a persona string: a custom Access Level that
// carries `incident.read` and nothing else gets Employee relations without
// inheriting the rest (SPEC-UI-IA §2.2).
//
// Directory and Org chart are PAIRED as route tabs (the BambooHR pairing,
// SPEC-UI-IA §5.2) — they are two views of one population, not two features.

import type { ReactNode } from "react";
import { FileCheck2, Network, ShieldAlert, Users } from "lucide-react";

import { HrSubShell, type HrRouteTab } from "../shared/HrSubShell";
import { useHrContext } from "../shared/useHrContext";
import { useHrPersona } from "../shared/useHrPersona";
import {
  hrOrgChartHref,
  hrPeopleHref,
  hrRelationsHref,
  hrVerificationsHref,
} from "../routes";

export function HrPeopleShell({
  children,
  title,
  description,
  actions,
}: {
  children: ReactNode;
  title?: string;
  description?: string;
  actions?: ReactNode;
}) {
  const { orgRef } = useHrContext();
  const { can } = useHrPersona();

  const tabs: HrRouteTab[] = [
    {
      key: "directory",
      label: "Directory",
      href: hrPeopleHref({ org: orgRef }),
      icon: Users,
    },
    {
      key: "org-chart",
      label: "Org chart",
      href: hrOrgChartHref({ org: orgRef }),
      icon: Network,
    },
    {
      key: "relations",
      label: "Employee relations",
      href: hrRelationsHref(orgRef),
      icon: ShieldAlert,
      // The strongest instance of the absence rule (SPEC-EMPLOYEES §2.2 route
      // 15): no capability, no tab, no route, no hint that cases exist.
      visible: can("incident.read") || can("corrective_action.issue"),
    },
    {
      key: "verifications",
      label: "Verifications",
      href: hrVerificationsHref(orgRef),
      icon: FileCheck2,
      visible: can("identity.write") || can("identity.read"),
    },
  ];

  return (
    <HrSubShell
      tabs={tabs}
      title={title}
      description={description}
      actions={actions}
    >
      {children}
    </HrSubShell>
  );
}
