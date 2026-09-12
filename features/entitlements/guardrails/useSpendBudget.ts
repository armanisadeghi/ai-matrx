// features/entitlements/guardrails/useSpendBudget.ts
//
// One hook, one envelope: the entitlement, the guardrails, the effective limit
// and which layer bound it — for the signed-in user inside one organization.

"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  AI_POINTS_CAPABILITY,
  fetchEffectiveCapability,
  fetchGuardrails,
  type EffectiveCapability,
  type SpendGuardrail,
} from "./service";

export interface SpendBudgetState {
  userId: string | null;
  effective: EffectiveCapability | null;
  guardrails: SpendGuardrail[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useSpendBudget(
  organizationId: string | null | undefined,
  capability: string = AI_POINTS_CAPABILITY,
): SpendBudgetState {
  const userId = useAppSelector(selectUserId);
  const [effective, setEffective] = useState<EffectiveCapability | null>(null);
  const [guardrails, setGuardrails] = useState<SpendGuardrail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!organizationId || !userId) {
      return { effective: null, guardrails: [] as SpendGuardrail[], error: null as string | null };
    }
    try {
      const [env, rows] = await Promise.all([
        fetchEffectiveCapability(userId, organizationId, capability),
        fetchGuardrails(organizationId, capability),
      ]);
      return { effective: env, guardrails: rows, error: null as string | null };
    } catch (err) {
      return {
        effective: null,
        guardrails: [] as SpendGuardrail[],
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }, [organizationId, userId, capability]);

  // Mount / dependency change: every setState here happens AFTER the await,
  // never synchronously inside the effect body.
  useEffect(() => {
    let cancelled = false;
    void load().then((result) => {
      if (cancelled) return;
      setEffective(result.effective);
      setGuardrails(result.guardrails);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  // Explicit refresh (after a save/remove) — called from event handlers.
  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await load();
    setEffective(result.effective);
    setGuardrails(result.guardrails);
    setError(result.error);
    setLoading(false);
  }, [load]);

  return { userId, effective, guardrails, loading, error, refresh };
}
