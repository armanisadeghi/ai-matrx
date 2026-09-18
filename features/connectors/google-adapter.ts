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
import {
  diagnoseGoogleConnection,
  googleAccountRefusalSentence,
  googleDiscoveryOutageSentence,
} from "@/features/marketing/google/health";
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
import {
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
} from "./google-capability-health";

/**
 * GOOGLE'S ADMISSION CODES, IN PLAIN ENGLISH — and the codes are the SERVER's,
 * not ones this file wishes it emitted.
 *
 * The catalog returns a CODE (`capabilities.py` → `admission_error=exc.code`),
 * and a code is never shown to a person. Until 2026-09-17 three of the four
 * keys here were `*_internal_test_required` spellings the hub does not emit
 * (`google_read_only_internal_test_required` in particular), so the read-only
 * sweep's real refusals fell through to the generic sentence and the paused
 * case had no sentence at all — the map LOOKED exact and was not (VERIFY-U-P2).
 *
 * The exhaustive set the catalog can emit, read from the server on 2026-09-17:
 *   `aidream/aidream/services/google_integrations/capabilities.py`
 *     `_require_descriptor_admission` → `unauthenticated`,
 *     `google_analytics_internal_test_required`, `youtube_internal_test_required`,
 *     and whatever `require_google_read_only_product_admission` raises;
 *   `aidream/.../read_only_product_admission.py` → `unauthenticated`,
 *     `google_oauth_internal_test_required`, `google_read_only_sweep_paused`.
 *
 * `GOOGLE_ADMISSION_CODES` below is that set, and
 * `__tests__/admission-codes-are-the-servers-codes.test.ts` re-reads the two
 * server files and fails when they disagree — so a new server code cannot ship
 * without a sentence, and a key here cannot outlive the code it was written for.
 */
export const GOOGLE_ADMISSION_CODES = [
  "unauthenticated",
  "google_analytics_internal_test_required",
  "youtube_internal_test_required",
  "google_oauth_internal_test_required",
  "google_read_only_sweep_paused",
  // Raised when NOTHING in a multi-product selection is admitted
  // (`capabilities.py::resolve_google_product_selection`). It was missing until
  // 2026-09-17 because the census only read a code written as the first token of
  // the raise, and this one lives inside a conditional — so the hub's own
  // message, which names capability keys AND codes, was the sentence the person
  // got (VERIFY-U-P2-R2, N4).
  "google_products_rollout_conflict",
] as const;

export type GoogleAdmissionCode = (typeof GOOGLE_ADMISSION_CODES)[number];

export const ADMISSION_LANGUAGE: Record<GoogleAdmissionCode, string> = {
  unauthenticated: "Sign in to connect Google.",
  google_analytics_internal_test_required:
    "Analytics turns on automatically when ready for your account.",
  youtube_internal_test_required:
    "YouTube turns on automatically when ready for your account.",
  google_oauth_internal_test_required:
    "Turns on automatically when ready for your account.",
  google_read_only_sweep_paused:
    "This one is paused for everyone right now while we finish certifying it with Google. Nothing you have connected is affected.",
  google_products_rollout_conflict:
    "None of the products you switched on is available on your account yet. They turn on automatically when they are ready — nothing you have connected is affected.",
};

/**
 * An unknown code still says something true and useful rather than leaking
 * itself — and `null` here means "use the rollout sentence".
 */
export function admissionLanguage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return (
    ADMISSION_LANGUAGE[code as GoogleAdmissionCode] ??
    "Turns on automatically when ready for your account."
  );
}

/**
 * WHY A PRESS FAILED, IN ONE SENTENCE PER CODE — the exchange's own policy
 * refusals as well as the catalog's admission codes, because a press can be
 * refused before Google is reached (admission) or after the window closes
 * (policy). Read from the server on 2026-09-17:
 * `service.py` raises `error_code=` `google_products_conflict`,
 * `google_products_scope_conflict`, `google_capability_conflict`,
 * `google_capability_scope_conflict`, `google_oauth_client_migration_required`
 * and `google_reconnect_target_conflict`;
 * `capabilities.py` + `read_only_product_admission.py` raise the admission set
 * above. `__tests__/admission-codes-are-the-servers-codes.test.ts` censuses all
 * three files and fails when a code here is missing or extinct.
 */
export const GOOGLE_FAILURE_LANGUAGE: Record<string, string> = {
  unauthenticated: "Sign in again, then connect Google.",
  google_analytics_internal_test_required:
    "Analytics is not open on your account yet, so it was not connected. It turns on automatically when it is ready; anything else you approved is unaffected.",
  youtube_internal_test_required:
    "YouTube is not open on your account yet, so it was not connected. It turns on automatically when it is ready; anything else you approved is unaffected.",
  google_oauth_internal_test_required:
    "That one is not open on your account yet, so it was not connected. It turns on automatically when it is ready; anything else you approved is unaffected.",
  google_read_only_sweep_paused:
    "That one is paused for everyone right now while we finish certifying it with Google, so it was not connected. Nothing you already had is affected.",
  google_products_rollout_conflict:
    "None of the products you switched on is available on your account yet, so nothing was connected. They turn on automatically when they are ready, and nothing you already had changed.",
  google_products_conflict:
    "One of the products you switched on is not one we can ask Google for any more. Nothing changed — reload this page so the list is current, then try again.",
  google_products_scope_conflict:
    "Google did not return the permissions this connection needs, so nothing was changed. Try again and approve everything the Google window asks for.",
  google_capability_conflict:
    "That product is not one we can ask Google for on this account. Nothing was changed.",
  google_capability_scope_conflict:
    "Google did not return the permissions that product needs, so nothing was changed. Try again and approve everything the Google window asks for.",
  google_oauth_client_migration_required:
    "Our Google sign-in changed, so this account needs a fresh approval. Close the Google window, press Reconnect, and approve everything it asks for — nothing you picked is lost.",
  google_reconnect_target_conflict:
    "The Google window signed in as a different account, or for a different owner, than the one being reconnected. Nothing changed — try again and choose the account named on this screen.",
};

/**
 * The one sentence for a failure we have no sentence for. It states ONLY what is
 * known and never carries the code (D6).
 *
 * 🚨 IT MUST NOT CLAIM "nothing was changed" (VERIFY-U-P2-R3, N16). This
 * sentence is what every UNMAPPED failure gets, and the hub's own
 * post-authorization raise — "authorized, but NONE of its N discovered resources
 * could be persisted" — lands here AFTER the token exchange, the vault write and
 * the scope update. The connection very much changed. The mapped sentences that
 * do say "nothing was changed" are the pre-exchange policy refusals, where it is
 * true. So this one sends the person to the place that knows: the account's own
 * health rows.
 */
export const GOOGLE_GENERIC_FAILURE_SENTENCE =
  "Google did not finish connecting this. Part of it may already have been recorded, so check this account's health below before you try again — and if it keeps happening, open the details and send them to us.";

/** What a consent surface shows after a failed press. */
export interface ConsentFailureAnswer {
  /** The sentence the person reads. Never a code, never machine text. */
  sentence: string;
  /** The raw server text, for the disclosure only. Null when there is none. */
  details: string | null;
}

/**
 * Does this text read as something written FOR a person? A machine token
 * (`capability_key`, `google_oauth_internal_test_required`), a scope URL or a
 * shouted error class means no — and no means the generic sentence plus a
 * details disclosure, whatever the code was. This is what stops the NEXT
 * unmapped code from reaching the screen the way `google_products_rollout_conflict`
 * did (VERIFY-U-P2-R2, N4).
 */
function readsAsASentence(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return false;
  if (/[a-z0-9]_[a-z0-9]/i.test(trimmed)) return false;
  if (/https?:\/\//.test(trimmed)) return false;
  if (/\b[A-Z]{3,}[0-9]*\b/.test(trimmed)) return false;
  return /[.!?]$/.test(trimmed);
}

/**
 * THE ONE TRANSLATION OF A FAILED PRESS, for every consent surface. Until
 * 2026-09-17 both surfaces rendered `extractErrorMessage(cause)` verbatim, so
 * the hub's "…: calendar (google_oauth_internal_test_required)" was the answer a
 * person read (N4).
 */
export function consentFailureAnswer(cause: unknown): ConsentFailureAnswer {
  if (multiProductConsentUnsupported(cause)) {
    return {
      sentence: MULTI_PRODUCT_CONSENT_UNSUPPORTED_MESSAGE,
      details: null,
    };
  }
  const raw = extractErrorMessage(cause);
  if (cause instanceof BackendApiError) {
    const known = GOOGLE_FAILURE_LANGUAGE[cause.code];
    return known
      ? { sentence: known, details: raw }
      : { sentence: GOOGLE_GENERIC_FAILURE_SENTENCE, details: raw };
  }
  // Our own thrown sentences (an unchosen organization, an already-open window)
  // are written for the person; anything else goes behind the disclosure.
  return readsAsASentence(raw)
    ? { sentence: raw, details: null }
    : { sentence: GOOGLE_GENERIC_FAILURE_SENTENCE, details: raw };
}

/**
 * `users.integration_connections` row → the generic account shape, INCLUDING
 * the per-product call record the hub writes to `capability_health`. The
 * capability keys are folded into product keys here, so nothing downstream sees
 * a Google key (`google-capability-health.ts` does the folding).
 */
export function googleAccount(row: GoogleConnectionSummary): ConnectorAccount {
  const diagnosis = diagnoseGoogleConnection(row);
  const recorded = parseGoogleCapabilityHealth(row.capability_health);
  return {
    id: row.id,
    label: row.account_email || row.account_name || "Google account",
    ownerKind: row.owner_type === "organization" ? "organization" : "person",
    organizationId: row.organization_id,
    providerSubject: row.provider_subject,
    grantedScopes: row.scopes,
    usable: row.health === "connected",
    // 🚨 BLOCKED, NOT MERELY UNUSABLE (V17-1, R22). `unavailable` is Google (or
    // our own app configuration) refusing everything with nothing to press;
    // `unrecognized` is a status word this build cannot vouch for, which is never
    // rendered as a working connection either.
    blocked: row.health === "unavailable" || row.health === "unrecognized",
    statusLabel: diagnosis.label,
    statusReason: diagnosis.reason,
    statusRemedy: diagnosis.remedy,
    lastVerifiedAt: row.last_verified_at,
    // TRANSLATED, never the column. `last_error` is aidream's operator text and
    // the generic shape has no field a raw provider string may travel in
    // (VERIFY-U-P2-R3, N9).
    lastRefusalSentence: googleAccountRefusalSentence(row),
    // NOT a refusal, and never flags the credential (N15): the exchange
    // succeeded, and Google simply did not answer some discovery calls yet.
    discoveryOutageSentence: googleDiscoveryOutageSentence(row),
    activity: googleActivityByProduct(GOOGLE_CONNECTOR_PROVIDER, recorded),
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
