"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@ai-matrx/design-system/controls";
import { CheckCircle2, RefreshCw } from "lucide-react";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";
import { useAppDispatch } from "@/lib/redux/hooks";
import { fetchEntitlementSnapshot } from "@/features/entitlements/service";
import {
  setEntitlementSnapshot,
  setUsageSnapshot,
} from "@/features/entitlements/state/entitlementsSlice";
import { readUsageSnapshot } from "@/features/entitlements/usage-gate/usageRead";
import {
  checkoutReturnKind,
  parseCheckoutStatus,
  type CheckoutStatus,
} from "./checkoutFeedback";

type FeedbackState = "checking" | "active" | "waiting" | "error";
const MAX_AUTOMATIC_CHECKS = 4;

/**
 * Checkout redirects are merely navigation. This component confirms a matched
 * Stripe session and subscription through the authenticated server endpoint
 * before announcing that access changed.
 */
export function CheckoutFeedback() {
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const returned = checkoutReturnKind(searchParams);
  const planKey = searchParams.get("plan");
  const cycle = searchParams.get("cycle") === "annual" ? "annual" : "monthly";
  const [state, setState] = useState<FeedbackState>("checking");
  const [attempt, setAttempt] = useState(0);

  const refreshAccess = useCallback(async () => {
    const [entitlements, usage] = await Promise.all([
      fetchEntitlementSnapshot(),
      readUsageSnapshot(),
    ]);
    if (entitlements) dispatch(setEntitlementSnapshot(entitlements));
    if (usage)
      dispatch(setUsageSnapshot({ snapshot: usage, fetchedAt: Date.now() }));
  }, [dispatch]);

  const check = useCallback(async (): Promise<CheckoutStatus | null> => {
    if (!planKey) return null;
    try {
      const response = await fetchWithOrganization(
        "/api/stripe/checkout-status",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey, cycle }),
        },
      );
      const parsed = parseCheckoutStatus(
        await response.json().catch(() => null),
      );
      if (!response.ok || !parsed) return null;
      if (parsed.status === "active") await refreshAccess();
      return parsed.status;
    } catch {
      return null;
    }
  }, [cycle, planKey, refreshAccess]);

  useEffect(() => {
    if (returned !== "success" || !planKey) return;
    let cancelled = false;
    void (async () => {
      for (let current = 0; current < MAX_AUTOMATIC_CHECKS; current += 1) {
        const status = await check();
        if (cancelled) return;
        if (status === "active") {
          setState("active");
          return;
        }
        if (status === "unavailable") {
          setState("error");
          return;
        }
        if (current < MAX_AUTOMATIC_CHECKS - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1_500));
          if (cancelled) return;
        }
      }
      setState("waiting");
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt, check, planKey, returned]);

  if (returned === "cancelled") {
    return (
      <p role="status" className="text-center text-sm text-muted-foreground">
        Checkout was canceled. Your plan has not changed.
      </p>
    );
  }
  if (returned !== "success" || !planKey) return null;
  if (state === "checking") {
    return (
      <p role="status" className="text-center text-sm text-muted-foreground">
        Checking your payment and plan…
      </p>
    );
  }
  if (state === "active") {
    return (
      <p
        role="status"
        className="flex items-center justify-center gap-2 text-center text-sm text-success"
      >
        <CheckCircle2 className="h-4 w-4" />
        Payment confirmed. Your access is ready.
      </p>
    );
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <span>
        {state === "waiting"
          ? "Payment is still being confirmed."
          : "We could not confirm that payment yet."}
      </span>
      <Button
        variant="outline"
        onClick={() => {
          setState("checking");
          setAttempt((value) => value + 1);
        }}
      >
        <RefreshCw className="h-4 w-4" />
        Check again
      </Button>
    </div>
  );
}
