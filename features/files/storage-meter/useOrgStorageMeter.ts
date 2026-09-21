/**
 * features/files/storage-meter/useOrgStorageMeter.ts
 *
 * The two reads behind the storage meter, for ONE organization.
 *
 *   LIMIT  → `billing.plan_status(p_org)` (every dimension is
 *            `billing.resolve_capability(user, capability, org)` — D11's one
 *            resolver). Read through `readPlanStatus`, which carries its own
 *            failure rather than collapsing to null.
 *   BYTES  → `files.user_storage_usage`, read directly under RLS (owner-only
 *            SELECT). NOT through `public.get_usage_status`, because that RPC
 *            resolves its limits from `public.get_user_limits` →
 *            `files.account_tiers`, the ladder D11 retires.
 *
 * There is deliberately no third source. If either read fails the meter says
 * so; it never borrows a number from somewhere else.
 */

"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/utils/supabase/client";
import { filesDb } from "@/features/files/filesDb";
import { readPlanStatus } from "@/features/entitlements/plan-service";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  selectAuthReady,
  selectIsAuthenticated,
  selectUserId,
} from "@/lib/redux/selectors/userSelectors";
import { extractErrorMessage } from "@/utils/errors";

import {
  STORAGE_CAPABILITY,
  summarizeOrgStorage,
  type PlanInput,
  type StorageMeter,
  type UsageInput,
} from "./summary";

export interface UseOrgStorageMeterResult {
  meter: StorageMeter;
  loading: boolean;
  refresh: () => Promise<void>;
}

/** The measured ledger row for the signed-in user, or why there is none. */
async function readUsage(userId: string): Promise<UsageInput> {
  try {
    const { data, error } = await filesDb(supabase)
      .from("user_storage_usage")
      .select("bytes_used, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { status: "unreadable", reason: error.message };
    if (!data) return { status: "unmeasured" };
    return {
      status: "read",
      bytesUsed: Number(data.bytes_used ?? 0),
      measuredAt: data.updated_at ?? null,
    };
  } catch (err) {
    return { status: "unreadable", reason: extractErrorMessage(err) };
  }
}

/** Billing's answer for this organization, or why there is none. */
async function readPlan(organizationId: string): Promise<PlanInput> {
  const read = await readPlanStatus(organizationId);
  if (!read.ok) return { status: "unreadable", reason: read.reason };
  const dimension = read.status.dimensions.find(
    (d) => d.capability === STORAGE_CAPABILITY,
  );
  return {
    status: "read",
    planName: read.status.plan?.name ?? null,
    limitBytes: dimension ? dimension.limit : null,
    missingDimension: !dimension,
  };
}

/**
 * The meter for the organization that OWNS the thing on screen — never the
 * sidebar's active-org selection, and never a personal-workspace fallback.
 * Pass `null` while the owning organization is still unknown; the hook reports
 * `loading` and reads nothing rather than metering the wrong tenant.
 */
export function useOrgStorageMeter(
  organizationId: string | null,
): UseOrgStorageMeterResult {
  const userId = useAppSelector(selectUserId);
  const authReady = useAppSelector(selectAuthReady);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const active = authReady && isAuthenticated && !!userId && !!organizationId;
  const [nonce, setNonce] = useState(0);
  // The answer is STAMPED with what it describes. Switching organizations (or
  // signing in as someone else) makes the held answer stop matching the key,
  // so the meter reports `loading` instead of showing the previous
  // organization's plan for a frame — and nothing has to reset state inside an
  // effect to make that true. Same shape as `useUserOrganizations`.
  const key = active ? `${userId}:${organizationId}:${nonce}` : null;

  const [resolved, setResolved] = useState<{
    key: string;
    plan: PlanInput;
    usage: UsageInput;
  } | null>(null);

  useEffect(() => {
    if (!key || !organizationId || !userId) return undefined;
    let alive = true;
    void (async () => {
      const [plan, usage] = await Promise.all([
        readPlan(organizationId),
        readUsage(userId),
      ]);
      if (alive) setResolved({ key, plan, usage });
    })();
    return () => {
      alive = false;
    };
  }, [key, organizationId, userId]);

  const current = resolved?.key === key ? resolved : null;

  return {
    meter: current
      ? summarizeOrgStorage({ plan: current.plan, usage: current.usage })
      : { kind: "loading" },
    loading: key !== null && current === null,
    refresh: async () => {
      setNonce((value) => value + 1);
    },
  };
}
