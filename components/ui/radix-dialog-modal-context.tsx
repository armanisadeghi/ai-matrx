"use client";

import * as React from "react";

const RadixDialogModalContext = React.createContext(true);

interface RadixDialogModalProviderProps {
  children: React.ReactNode;
  modal: boolean;
}

/**
 * Keeps our Radix-based content wrappers aligned with the owning Root's
 * modality so ARIA semantics cannot drift from focus/pointer behavior.
 */
export function RadixDialogModalProvider({
  children,
  modal,
}: RadixDialogModalProviderProps) {
  return (
    <RadixDialogModalContext.Provider value={modal}>
      {children}
    </RadixDialogModalContext.Provider>
  );
}

/** Returns whether the nearest Radix Dialog-derived root is modal. */
export function useRadixDialogModal(): boolean {
  return React.useContext(RadixDialogModalContext);
}
