"use client";

import React, { createContext, useContext } from "react";

type RefreshFn = (() => void) | (() => Promise<void>);

interface OrgSettingsLayoutContextValue {
  refreshLayoutOrganization: RefreshFn | undefined;
}

const OrgSettingsLayoutContext = createContext<OrgSettingsLayoutContextValue>({
  refreshLayoutOrganization: undefined,
});

export function OrgSettingsLayoutProvider({
  children,
  refreshLayoutOrganization,
}: {
  children: React.ReactNode;
  refreshLayoutOrganization: RefreshFn | undefined;
}) {
  return (
    <OrgSettingsLayoutContext.Provider value={{ refreshLayoutOrganization }}>
      {children}
    </OrgSettingsLayoutContext.Provider>
  );
}

export function useOrgSettingsLayoutRefresh(): RefreshFn | undefined {
  return useContext(OrgSettingsLayoutContext).refreshLayoutOrganization;
}
