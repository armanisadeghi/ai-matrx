"use client";

import { useContext, useSyncExternalStore } from "react";
import { ReactReduxContext } from "react-redux";
import { parsePointsRate } from "@ai-matrx/kit/format";
import type { RootState } from "@/lib/redux/store";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";
import { POINTS_RATE_KNOB, selectPointsRateAddress } from "./pointsRate";

const noopSubscribe = () => () => {};

function addressKey(state: RootState): string {
  try {
    const { organizationId, userId } = selectPointsRateAddress(state);
    return `${organizationId ?? ""}|${userId ?? ""}`;
  } catch {
    return "|";
  }
}

/** The viewer's rate, re-rendering when the snapshot lands or the organization changes. */
export function usePointsRate(): number | null {
  const store = useContext(ReactReduxContext)?.store ?? null;
  const key = useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => (store ? addressKey(store.getState() as RootState) : "|"),
    () => "|",
  );
  const [org = "", user = ""] = key.split("|");
  return parsePointsRate(useEffectiveKnob(org || null, user || null, POINTS_RATE_KNOB));
}
