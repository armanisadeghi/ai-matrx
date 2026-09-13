"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

export type SettingsDesignVariant = "standard" | "compact";
export type SettingsDesignProviderProps = {
  children: ReactNode;
  variant?: SettingsDesignVariant;
};

const SettingsDesignContext = createContext<SettingsDesignVariant>("standard");

/**
 * Applies a presentation density to the local settings primitive family.
 * Omit it for existing embeddings, which retain the standard presentation.
 */
export function SettingsDesignProvider({
  children,
  variant = "standard",
}: SettingsDesignProviderProps) {
  return (
    <SettingsDesignContext.Provider value={variant}>
      {children}
    </SettingsDesignContext.Provider>
  );
}

export function useSettingsDesign() {
  return { variant: useContext(SettingsDesignContext) } as const;
}
