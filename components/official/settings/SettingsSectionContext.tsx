"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

const SettingsSectionContext = createContext<string | undefined>(undefined);

/** The nearest section title gives static controls a stable deep-link scope. */
export function SettingsSectionProvider({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <SettingsSectionContext.Provider value={title}>
      {children}
    </SettingsSectionContext.Provider>
  );
}

export function useSettingsSectionTitle(): string | undefined {
  return useContext(SettingsSectionContext);
}
