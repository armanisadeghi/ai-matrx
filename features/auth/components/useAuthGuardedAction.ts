"use client";

import { useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsAuthenticated } from "@/lib/redux/selectors/userSelectors";
import { useOpenAuthGateDialog } from "@/features/overlays/openers/authGate";

interface UseAuthGuardedActionOptions {
  /** Surfaced as `featureName` in `AuthGateDialog`. */
  featureName: string;
  /** Optional longer description for `AuthGateDialog`. */
  featureDescription?: string;
}

/**
 * Wraps an action so that authenticated callers run it directly and
 * unauthenticated callers see `AuthGateDialog` instead. The single
 * "soft gate" primitive used by chat send, agent open, save-to-notes,
 * upload, etc. — anything that requires an account to mean anything.
 *
 *     const handleSubmit = useAuthGuardedAction(
 *       () => dispatch(smartExecute(...)),
 *       { featureName: "Chat" },
 *     );
 */
export function useAuthGuardedAction<TArgs extends unknown[]>(
  action: (...args: TArgs) => void,
  { featureName, featureDescription }: UseAuthGuardedActionOptions,
): (...args: TArgs) => void {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const openAuthGate = useOpenAuthGateDialog();

  return useCallback(
    (...args: TArgs) => {
      if (!isAuthenticated) {
        openAuthGate({ featureName, featureDescription });
        return;
      }
      action(...args);
    },
    [isAuthenticated, openAuthGate, action, featureName, featureDescription],
  );
}
