// features/connectors/consent-plan.ts
//
// THE CONSENT PLAN — pure. Given what the person switched on and what the
// account already holds, produce the ONE authorization request to make, and say
// plainly what could not be asked for and why.
//
// ONE button, ONE request (PLAN §2; chair ruling 2026-09-17). The provider hub
// takes the whole selection at once:
//
//   POST /api/google-integrations/exchange
//     { code, client_id, owner_type, organization_id, redirect_uri,
//       connection_purpose: "google_products",
//       capability_keys: string[],            // any of the twelve catalog keys
//       target_connection_id?: string }       // set when adding to an account
//
//   • creates the connection on a first connect;
//   • adds only the selected products' scopes to an existing one, incrementally;
//   • refuses, BY NAME, any scope outside the selection, and any request that
//     would drop a scope the connection already holds — which is what preserves
//     existing grants and picked files across a re-consent.
//
// This file therefore never builds a queue of exchanges. The scopes it computes
// are identity + everything the account already holds + exactly what the
// switched-on rows add: the union is what the provider is asked for, and
// `addedScopes` is what the person is really approving.
//
// Per-row outcome is read back from the account's own scopes after the exchange
// (`consentOutcomes` below), so one product failing never hides the ones that
// landed and nothing has to be believed on the client's word.

import type {
  ConnectorProduct,
  ConnectorProviderConfig,
} from "./provider-config";
import { productByKey } from "./provider-config";
import {
  productIsEligible,
  requiredScopesFor,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
} from "./health";

export interface ConsentRequest {
  /** Catalog keys the hub validates the scope set against. */
  capabilityKeys: string[];
  /** Everything the request asks for: identity + existing grants + new scopes. */
  scopes: string[];
  /** Only what this request ADDS — what the person is approving. */
  addedScopes: string[];
  /** The rows this request turns on, in config order. */
  products: ConnectorProduct[];
  /** The account being added to, or null for a new connection. */
  targetAccountId: string | null;
}

export interface ConsentBlock {
  productKey: string;
  productName: string;
  /** Plain English, with the action that unblocks it. Never a code. */
  reason: string;
}

export interface ConsentPlan {
  request: ConsentRequest | null;
  /** Rows that were switched on but cannot be asked for, each with its reason. */
  blocked: ConsentBlock[];
  /** Rows already fully granted on this account — nothing to ask for. */
  alreadyGranted: ConnectorProduct[];
  /** True when pressing the button would ask the provider for nothing. */
  empty: boolean;
}

export function buildConsentPlan({
  provider,
  selectedProductKeys,
  account,
  rollout,
}: {
  provider: ConnectorProviderConfig;
  selectedProductKeys: readonly string[];
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
}): ConsentPlan {
  const granted = new Set(account?.grantedScopes ?? []);

  const selected = selectedProductKeys
    .map((key) => productByKey(provider, key))
    .filter((product): product is ConnectorProduct => product !== undefined)
    // Config order, never click order: the request reads the way the dialog does.
    .sort((a, b) => provider.products.indexOf(a) - provider.products.indexOf(b));

  const blocked: ConsentBlock[] = [];
  const alreadyGranted: ConnectorProduct[] = [];
  const wanted: { product: ConnectorProduct; missing: string[] }[] = [];

  for (const product of selected) {
    if (!productIsEligible(product, rollout)) {
      blocked.push({
        productKey: product.key,
        productName: product.name,
        reason:
          "Turns on automatically when ready for your account — there is nothing to approve yet.",
      });
      continue;
    }
    const missing = requiredScopesFor(provider, product, rollout).filter(
      (scope) => !granted.has(scope),
    );
    if (missing.length === 0) {
      alreadyGranted.push(product);
      continue;
    }
    wanted.push({ product, missing });
  }

  if (wanted.length === 0) {
    return { request: null, blocked, alreadyGranted, empty: true };
  }

  const added = [...new Set(wanted.flatMap(({ missing }) => missing))];
  return {
    request: {
      // Every capability behind every switched-on row. The hub matches the
      // scope set against exactly these keys and refuses anything else.
      capabilityKeys: [
        ...new Set(
          wanted.flatMap(({ product }) => [...product.capabilityKeys]),
        ),
      ],
      scopes: [
        ...new Set([
          ...provider.identityScopes,
          ...(account?.grantedScopes ?? []),
          ...added,
        ]),
      ],
      addedScopes: added,
      products: wanted.map(({ product }) => product),
      targetAccountId: account?.id ?? null,
    },
    blocked,
    alreadyGranted,
    empty: false,
  };
}

export type ConsentOutcomeState = "granted" | "refused" | "already_granted";

export interface ConsentOutcome {
  product: ConnectorProduct;
  state: ConsentOutcomeState;
  /** What to say on the row. One sentence, never a code. */
  message: string;
}

/**
 * Per-row truth AFTER the exchange, read from the account as the server left
 * it — not from what was asked for. A product the provider refused shows its
 * own line and the ones that landed keep theirs, which is the whole point of
 * reading the result back instead of trusting the request.
 */
export function consentOutcomes({
  provider,
  plan,
  account,
  rollout,
}: {
  provider: ConnectorProviderConfig;
  plan: ConsentPlan;
  /** The account as re-read after the exchange. */
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
}): ConsentOutcome[] {
  const granted = new Set(account?.grantedScopes ?? []);
  const requested = plan.request?.products ?? [];
  const outcomes: ConsentOutcome[] = plan.alreadyGranted.map((product) => ({
    product,
    state: "already_granted" as const,
    message: "Already connected — nothing changed.",
  }));
  for (const product of requested) {
    const missing = requiredScopesFor(provider, product, rollout).filter(
      (scope) => !granted.has(scope),
    );
    outcomes.push(
      missing.length === 0
        ? { product, state: "granted", message: product.promise }
        : {
            product,
            state: "refused",
            message: `${provider.name} did not grant this one. Nothing else you approved was affected — try it again from Settings → Connectors.`,
          },
    );
  }
  return outcomes.sort(
    (a, b) =>
      provider.products.indexOf(a.product) -
      provider.products.indexOf(b.product),
  );
}
