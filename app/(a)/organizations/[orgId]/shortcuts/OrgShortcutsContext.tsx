"use client";

import React, { createContext, useContext } from "react";
import type { OrgRole } from "@/features/organizations/types";

export interface OrgShortcutsContextValue {
  /** URL-safe org identifier (slug preferred) used to build sub-navigation hrefs */
  orgId: string;
  organizationId: string;
  organizationName: string;
  role: OrgRole;
  canWrite: boolean;
}

const OrgShortcutsContext = createContext<OrgShortcutsContextValue | null>(
  null,
);

export function OrgShortcutsProvider({
  value,
  children,
}: {
  value: OrgShortcutsContextValue;
  children: React.ReactNode;
}) {
  return (
    <OrgShortcutsContext.Provider value={value}>
      {children}
    </OrgShortcutsContext.Provider>
  );
}

export function useOrgShortcutsContext(): OrgShortcutsContextValue {
  const ctx = useContext(OrgShortcutsContext);
  if (!ctx) {
    throw new Error(
      "useOrgShortcutsContext must be used within OrgShortcutsProvider",
    );
  }
  return ctx;
}
