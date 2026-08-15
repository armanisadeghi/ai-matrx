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
  OrgCapabilityStatus,
} from "../types";
import type { Capability } from "../registry";

export interface EntitlementsState extends EntitlementSnapshot {
  /** True until the boot hydration resolves (or fails). */
  isLoading: boolean;
  /** Set when the snapshot fetch errored; reads fail open, spend fails closed. */
  error: string | null;
  /**
   * Per-organization capability verdicts, keyed by organization id.
   *
   * NOT hydrated at boot — an org tier is a property of the record being acted
   * on, so it is fetched by the surface that names an org and cached here for
   * every other surface naming the same one. Volatile like the rest of this
   * slice; a tier change lands on the next fetch, and the server gate is truth
   * regardless of what is cached here.
   */
  orgs: Record<string, OrgCapabilityStatus>;
}

const initialState: EntitlementsState = {
  tier: "free",
  isSubscribed: false,
  trialEndsAt: null,
  usage: {},
  fetchedAt: null,
  isLoading: true,
  error: null,
  orgs: {},
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
    /** Cache one org's capability verdicts (see `orgs` above). */
    setOrgCapabilityStatus: (
      state,
      action: PayloadAction<OrgCapabilityStatus>,
    ) => {
      state.orgs[action.payload.organizationId] = action.payload;
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
  setOrgCapabilityStatus,
  setEntitlementTier,
  setEntitlementsLoading,
  setEntitlementsError,
  clearEntitlements,
} = entitlementsSlice.actions;

export default entitlementsSlice.reducer;
