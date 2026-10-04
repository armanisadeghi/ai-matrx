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
import type {
  UsageGateLevel,
  UsageSnapshot,
  UsageWindow,
} from "../usage-gate/usageState";

/**
 * THE USAGE GATE's client half (common-docs/systems/platform/entitlements-knobs/
 * USAGE-GATE.md rules 9-12). The person's state as `billing.user_usage_state`
 * last answered it. Seeded at landing with the layout's own reads, refreshed in
 * the background after each AI call, replaced by server notifications. Never
 * derived here.
 */
export interface UsageGateState {
  /** `unknown` until the first answer (guests stay `unknown`). */
  state: UsageGateLevel | "unknown";
  planName: string | null;
  bindingPeriod: string | null;
  resetsAt: string | null;
  windows: UsageWindow[];
  /** Server `computed_at` of the answer held. */
  computedAt: string | null;
  /** The server's enforcement switch with that answer; false never blocks. */
  enforced: boolean;
  /** A call ended since the last answer; a background refresh is due. */
  stale: boolean;
  /** Client clock when the answer landed. */
  fetchedAt: number | null;
  /** A fresh `over` stopped a call — the limit dialog renders while set. */
  refusal: UsageWindow | null;
}

export const initialUsageGateState: UsageGateState = {
  state: "unknown",
  planName: null,
  bindingPeriod: null,
  resetsAt: null,
  windows: [],
  computedAt: null,
  enforced: false,
  stale: false,
  fetchedAt: null,
  refusal: null,
};

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
  /** The usage gate — see `UsageGateState`. Separate from per-capability `usage`. */
  usageGate: UsageGateState;
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
  usageGate: initialUsageGateState,
};

/** Preloaded slice state carrying a landing-time usage answer (SSR seed). */
export function entitlementsStateWithUsage(
  snapshot: UsageSnapshot,
  fetchedAt: number,
): EntitlementsState {
  return {
    ...initialState,
    usageGate: usageGateFromSnapshot(snapshot, fetchedAt, null),
  };
}

function usageGateFromSnapshot(
  snapshot: UsageSnapshot,
  fetchedAt: number,
  refusal: UsageWindow | null,
): UsageGateState {
  return {
    state: snapshot.state,
    planName: snapshot.planName,
    bindingPeriod: snapshot.bindingPeriod,
    resetsAt: snapshot.resetsAt,
    windows: snapshot.windows,
    computedAt: snapshot.computedAt,
    enforced: snapshot.enforced,
    stale: false,
    fetchedAt,
    refusal,
  };
}

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
    /** A fresh answer from the one function (read, stream event or directive). */
    setUsageSnapshot: (
      state,
      action: PayloadAction<{ snapshot: UsageSnapshot; fetchedAt: number }>,
    ) => {
      const { snapshot, fetchedAt } = action.payload;
      // An answer that is no longer `over` clears an open refusal.
      const refusal = snapshot.state === "over" ? state.usageGate.refusal : null;
      state.usageGate = usageGateFromSnapshot(snapshot, fetchedAt, refusal);
    },
    /** A call ended — the held answer may be behind; refresh in the background. */
    markUsageStale: (state) => {
      state.usageGate.stale = true;
    },
    /** A fresh `over` stopped a call (window shown in the limit dialog), or null to close. */
    setUsageRefusal: (state, action: PayloadAction<UsageWindow | null>) => {
      state.usageGate.refusal = action.payload;
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
  setUsageSnapshot,
  markUsageStale,
  setUsageRefusal,
  clearEntitlements,
} = entitlementsSlice.actions;

export default entitlementsSlice.reducer;
