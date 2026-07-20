// features/education/classes/hooks/useClassAccess.ts
//
// The read+act hook behind the Join / Request / Enroll button and the class hub
// header. Wraps the edu_class_* contract (service.ts) with load state + the
// action verbs a non-member needs. Owner-only controls are gated on `state.isOwner`
// — which the SERVER computes (edu_class_state), never a client guess; the RPCs
// re-check on every write, so a bypassed UI check is not an escalation.

"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/lib/toast";
import {
  getClassState,
  joinClass,
  requestClass,
  leaveClass,
  startClassCheckout,
  type ClassCheckoutResult,
} from "../service";
import type { ClassAccessState, ClassJoinResult } from "../types";

export interface UseClassAccessReturn {
  state: ClassAccessState | null;
  loading: boolean;
  error: string | null;
  /** True while a join/request/leave/purchase action is in flight. */
  acting: boolean;
  refresh: () => Promise<void>;
  join: () => Promise<ClassJoinResult | null>;
  request: () => Promise<ClassJoinResult | null>;
  leave: () => Promise<ClassJoinResult | null>;
  /**
   * Start Stripe Checkout for a paid class. Resolves to the API result; the caller
   * redirects to `url`. Access is conferred ONLY by the webhook after payment —
   * this never grants access (webhook-only paid gate).
   */
  startCheckout: (returnTo?: string) => Promise<ClassCheckoutResult>;
}

export function useClassAccess(classId: string | null): UseClassAccessReturn {
  const [state, setState] = useState<ClassAccessState | null>(null);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    setError(null);
    try {
      setState(await getClassState(classId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this class.");
      setState(null);
    } finally {
      setLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const run = useCallback(
    async (
      fn: (id: string) => Promise<ClassJoinResult>,
    ): Promise<ClassJoinResult | null> => {
      if (!classId) return null;
      setActing(true);
      try {
        const result = await fn(classId);
        await refresh();
        return result;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong.");
        return null;
      } finally {
        setActing(false);
      }
    },
    [classId, refresh],
  );

  const startCheckout = useCallback(
    async (returnTo?: string): Promise<ClassCheckoutResult> => {
      if (!classId) return { error: "No class." };
      setActing(true);
      try {
        return await startClassCheckout(classId, returnTo);
      } finally {
        setActing(false);
      }
    },
    [classId],
  );

  return {
    state,
    loading,
    error,
    acting,
    refresh,
    join: useCallback(() => run(joinClass), [run]),
    request: useCallback(() => run(requestClass), [run]),
    leave: useCallback(() => run(leaveClass), [run]),
    startCheckout,
  };
}
