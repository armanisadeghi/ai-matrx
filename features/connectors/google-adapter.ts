"use client";

// features/connectors/google-adapter.ts
//
// THE GOOGLE ADAPTER — the ONE file in the connector primitive allowed to name
// Google. It turns Google's inventory and capability catalog into the generic
// shapes in `health.ts`, and runs a `ConsentRequest` through Google's own
// incremental-consent path. The card, the dialog, the health rows and the
// settings panel take `provider` + these values as props and never import a
// Google service.
//
// Reuse, not a second reader (CLAUDE.md, reuse-first): connection state comes
// from `features/marketing/google/service.ts::listGoogleConnectionInventory()`
// through the existing auth-gated `useGoogleConnectionInventory` query, health
// sentences from `features/marketing/google/health.ts::diagnoseGoogleConnection`,
// rollout from the typed `/api/google-integrations/capabilities` catalog via
// `useGoogleCapabilities`, and the exchange from `useConnectGoogle`. Nothing
// here re-reads a table or re-derives a scope mapping.

import { useCallback, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import {
  useConnectGoogle,
  useGoogleCapabilities,
  useGoogleConnectionInventory,
} from "@/features/marketing/google/hooks";
import { diagnoseGoogleConnection } from "@/features/marketing/google/health";
import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";
import { useGoogleAPI } from "@/providers/google-provider/GoogleApiProvider";
import { extractErrorMessage } from "@/utils/errors";
import { BackendApiError } from "@/lib/api/errors";
import type { ConsentRequest } from "./consent-plan";
import type {
  ConnectorAccount,
  ConnectorCapabilityRollout,
} from "./health";
import { GOOGLE_CONNECTOR_PROVIDER } from "./provider-config";

/**
 * Google's admission codes, in plain English. The catalog returns a CODE
 * (`capabilities.py` → `admission_error=exc.code`), and a code is never shown
 * to a person. An unknown code still says something true and useful rather than
 * leaking itself — and `null` here means "use the rollout sentence".
 */
const ADMISSION_LANGUAGE: Record<string, string> = {
  unauthenticated: "Sign in to connect Google.",
  google_analytics_internal_test_required:
    "Analytics turns on automatically when ready for your account.",
  youtube_internal_test_required:
    "YouTube turns on automatically when ready for your account.",
  google_read_only_internal_test_required:
    "Turns on automatically when ready for your account.",
};

function admissionLanguage(code: string | null | undefined): string | null {
  if (!code) return null;
  return (
    ADMISSION_LANGUAGE[code] ??
    "Turns on automatically when ready for your account."
  );
}

/** `users.integration_connections` row → the generic account shape. */
export function googleAccount(row: GoogleConnectionSummary): ConnectorAccount {
  const diagnosis = diagnoseGoogleConnection(row);
  return {
    id: row.id,
    label: row.account_email || row.account_name || "Google account",
    ownerKind: row.owner_type === "organization" ? "organization" : "person",
    organizationId: row.organization_id,
    providerSubject: row.provider_subject,
    grantedScopes: row.scopes,
    usable: row.health === "connected",
    statusLabel: diagnosis.label,
    statusReason: diagnosis.reason,
    statusRemedy: diagnosis.remedy,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
  };
}

export interface ConnectorProviderState {
  accounts: ConnectorAccount[];
  rollout: ConnectorCapabilityRollout[];
  /** Picked/discovered resources per account id — what a revoke would strand. */
  resourceCountByAccount: Record<string, number>;
  isLoading: boolean;
  /** True when the catalog itself is unavailable; rows stay honest, not hopeful. */
  rolloutUnavailable: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => Promise<void>;
}

/** Live Google state for the connector surfaces, in provider-agnostic shapes. */
export function useGoogleConnectorState(): ConnectorProviderState {
  const inventory = useGoogleConnectionInventory();
  const capabilities = useGoogleCapabilities();

  const accounts = (inventory.data?.connections ?? []).map(googleAccount);

  const rollout: ConnectorCapabilityRollout[] = (capabilities.data ?? []).map(
    (row) => ({
      capabilityKey: row.key,
      phase: row.rollout_phase === "available" ? "available" : "pending",
      eligible: row.eligible,
      requiredScopes: row.required_scopes.map((scope) => scope.scope),
      ineligibleReason: row.eligible
        ? null
        : admissionLanguage(row.admission_error),
    }),
  );

  const resourceCountByAccount: Record<string, number> = {};
  for (const resource of (inventory.data?.resources ??
    []) as GoogleConnectionResource[]) {
    resourceCountByAccount[resource.connection_id] =
      (resourceCountByAccount[resource.connection_id] ?? 0) + 1;
  }

  const refetch = useCallback(async () => {
    await Promise.all([inventory.refetch(), capabilities.refetch()]);
  }, [inventory, capabilities]);

  return {
    accounts,
    rollout,
    resourceCountByAccount,
    isLoading: inventory.isLoading || capabilities.isLoading,
    rolloutUnavailable: capabilities.isError || rollout.length === 0,
    isError: inventory.isError,
    errorMessage: inventory.isError
      ? extractErrorMessage(inventory.error)
      : capabilities.isError
        ? extractErrorMessage(capabilities.error)
        : null,
    refetch,
  };
}

export interface ConsentRunOwner {
  type: "user" | "organization";
  organizationId?: string;
}

export interface ConsentRunResult {
  connectionId: string;
}

/**
 * The provider's own sentence when the deployed hub is older than this client.
 *
 * `connection_purpose: "google_products"` is a typed literal on the server, so
 * a hub that predates it answers 422 with a validation payload naming the
 * field. That is a half-deployed cross-repo feature, not a user error, and it
 * gets its own honest sentence instead of a raw validation dump (law 4:
 * nothing fails silently, and no stand-in lies).
 */
export function multiProductConsentUnsupported(error: unknown): boolean {
  if (!(error instanceof BackendApiError)) return false;
  if (error.status !== 422) return false;
  const haystack = JSON.stringify(error.details ?? "") + error.detail;
  return haystack.includes("connection_purpose") ||
    haystack.includes("capability_keys");
}

export const MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE =
  "Connecting several Google products in one step needs the newest AI Matrx server, which is still rolling out. Nothing was changed and nothing was sent to Google — try again shortly.";

/**
 * Run a consent request: ONE provider window, ONE exchange, carrying every
 * scope the account already holds so no existing grant and no picked file is
 * lost (the hub refuses a request that would drop one — that refusal is a
 * contract, and this is the client half of it).
 *
 * A cancelled window is control flow, not a failure.
 */
export function useGoogleConsentRunner() {
  const google = useGoogleAPI();
  const connectGoogle = useConnectGoogle();
  const organizationContextId = useAppSelector(selectOrganizationId);
  const userId = useAppSelector(selectUserId);
  const running = useRef(false);

  const run = useCallback(
    async (
      request: ConsentRequest,
      options: {
        owner: ConsentRunOwner;
        /** Google's account hint, so the popup lands on the right identity. */
        loginHint: string | null;
      },
    ): Promise<ConsentRunResult> => {
      if (running.current) {
        throw new Error("A Google authorization window is already open.");
      }
      if (!organizationContextId) {
        throw new Error(
          "Choose an organization before connecting Google — every connection is recorded against one.",
        );
      }
      running.current = true;
      try {
        const code = await google.requestAuthorizationCode(
          request.scopes,
          options.loginHint ?? undefined,
        );
        const result = await connectGoogle.mutateAsync({
          code,
          owner:
            options.owner.type === "organization" && options.owner.organizationId
              ? {
                  type: "organization",
                  organizationId: options.owner.organizationId,
                }
              : { type: "user" },
          connectionPurpose: "google_products",
          options: {
            organizationContextId,
            expectedUserId: userId ?? undefined,
            capabilityKeys: request.capabilityKeys,
            ...(request.targetAccountId
              ? { targetConnectionId: request.targetAccountId }
              : {}),
          },
        });
        return { connectionId: result.connectionId };
      } finally {
        running.current = false;
      }
    },
    [google, connectGoogle, organizationContextId, userId],
  );

  return {
    run,
    /** Google's own script has to be up before any window can open. */
    ready: google.isGoogleLoaded,
  };
}

export const GOOGLE_PROVIDER = GOOGLE_CONNECTOR_PROVIDER;
