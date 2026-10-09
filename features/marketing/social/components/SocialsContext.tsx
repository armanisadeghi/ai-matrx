"use client";

/**
 * The Socials section's shared handles: the brand's organization (every
 * server call names it) and the one "Track account" dialog the header, the
 * Accounts empty state and the row actions all open.
 */

import { createContext, useContext } from "react";

export interface SocialsContextValue {
  brandId: string;
  brandSeg: string;
  organizationId: string;
  openTrack: () => void;
}

export const SocialsContext = createContext<SocialsContextValue | null>(null);

export function useSocials(): SocialsContextValue {
  const value = useContext(SocialsContext);
  if (!value) throw new Error("useSocials must render inside the Socials section shell");
  return value;
}
