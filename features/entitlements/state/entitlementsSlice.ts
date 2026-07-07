// features/entitlements/state/entitlementsSlice.ts
//
// Session-boot entitlement state. Hydrated once (like `adminLevel`) from the
// resolver's snapshot RPC; the resolver RPC remains truth on every ENFORCED
// action. Volatile — never persisted (billing state is server-issued and must
// not go stale in localStorage).

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type {
  EntitlementSnapshot,
  EntitlementTier,
  EntitlementUsage,
} from "../types";
import type { Capability } from "../registry";

export interface EntitlementsState extends EntitlementSnapshot {
  /** True until the boot hydration resolves (or fails). */
  isLoading: boolean;
  /** Set when the snapshot fetch errored; reads fail open, spend fails closed. */
  error: string | null;
}

const initialState: EntitlementsState = {
  tier: "free",
  isSubscribed: false,
  trialEndsAt: null,
  usage: {},
  fetchedAt: null,
  isLoading: true,
  error: null,
};

const entitlementsSlice = createSlice({
  name: "entitlements",
  initialState,
  reducers: {
    /** Replace the whole snapshot (boot hydration + manual refetch). */
    setEntitlementSnapshot: (
      state,
      action: PayloadAction<EntitlementSnapshot>,
    ) => {
      state.tier = action.payload.tier;
      state.isSubscribed = action.payload.isSubscribed;
      state.trialEndsAt = action.payload.trialEndsAt;
      state.usage = action.payload.usage;
      state.fetchedAt = action.payload.fetchedAt;
      state.isLoading = false;
      state.error = null;
    },
    /** Patch a single capability's usage (after a consume, for instant nudges). */
    setCapabilityUsage: (
      state,
      action: PayloadAction<{ capability: Capability; usage: EntitlementUsage }>,
    ) => {
      state.usage[action.payload.capability] = action.payload.usage;
    },
    setEntitlementTier: (state, action: PayloadAction<EntitlementTier>) => {
      state.tier = action.payload;
    },
    setEntitlementsLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setEntitlementsError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearEntitlements: () => initialState,
  },
});

export const {
  setEntitlementSnapshot,
  setCapabilityUsage,
  setEntitlementTier,
  setEntitlementsLoading,
  setEntitlementsError,
  clearEntitlements,
} = entitlementsSlice.actions;

export default entitlementsSlice.reducer;
