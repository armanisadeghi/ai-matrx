"use client";

// features/mandates/admin-list/context.tsx
//
// What a cell needs beyond its row: the live store (provision offers) and the
// page's pin-advance door. Provided once by the page around the list, so the
// column registry stays a module constant.

import { createContext, useContext, useSyncExternalStore } from "react";
import type { ImpactVerdict } from "@/features/mandates/admin/impact";
import {
  getMandateAdminListState,
  subscribeMandateAdminList,
  type MandateAdminListState,
} from "./store";

export interface MandateAdminListActions {
  advancing: boolean;
  advanceAnyway: (verdict: ImpactVerdict) => void;
}

export const MandateAdminListActionsContext =
  createContext<MandateAdminListActions | null>(null);

export function useMandateAdminListActions(): MandateAdminListActions | null {
  return useContext(MandateAdminListActionsContext);
}

export function useMandateAdminListState(): MandateAdminListState {
  return useSyncExternalStore(
    subscribeMandateAdminList,
    getMandateAdminListState,
    getMandateAdminListState,
  );
}
