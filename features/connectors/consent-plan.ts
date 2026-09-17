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
// A GRANT THAT NEEDS RENEWING IS DERIVED HERE, NEVER PASSED IN. A product whose
// scopes are all present can still be broken: when the provider's own last word
// on it is a refusal only a fresh grant can clear, the request asks for exactly
// what the account already holds, which is what mints that grant. That reading
// comes from the account's recorded health (`grantNeedsRenewal`), so every
// consent surface gets it whether or not its author thought about it — the
// dialog and Settings → Reconnect planned differently for one account until
// 2026-09-17, and the dialog told the person everything was already connected
// while the provider window never opened.
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
  productHealth,
  productIsEligible,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
  type ConnectorProductHealth,
} from "./health";
import { requiredScopesFor } from "./health";

export interface ConsentRequest {
  /** Catalog keys the hub validates the scope set against. */
  capabilityKeys: string[];
  /** Everything the request asks for: identity + existing grants + new scopes. */
  scopes: string[];
  /** Only what this request ADDS — what the person is approving. */
  addedScopes: string[];
  /** The rows this request turns on, in config order. */
  products: ConnectorProduct[];
  /**
   * The subset of `products` whose grant is being RENEWED rather than widened:
   * every scope is already held and the provider's own last word was a refusal
   * only a fresh grant can clear. Copy branches on this, so no surface has to
   * re-derive "is this a renewal?" from scope arithmetic and get it wrong.
   */
  renewals: ConnectorProduct[];
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
  const wanted: {
    product: ConnectorProduct;
    missing: string[];
    renewal: boolean;
  }[] = [];

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
    // ONE derivation for this row, so "what is missing", "is this a renewal"
    // and "why can this not be asked for" cannot disagree with the health row
    // the person is looking at.
    const row: ConnectorProductHealth = productHealth({
      provider,
      product,
      account,
      rollout,
    });
    const missing = row.missingScopes;
    const renewal = missing.length === 0 && row.actionLabel === "Reconnect";
    if (missing.length === 0 && !renewal) {
      // A refusal that is OURS to repair leaves the row broken with nothing to
      // approve. Calling that "already granted" is what produced the one
      // sentence the owner named — "everything you switched on is already
      // connected" under a row reading Not working (VERIFY-U-P2-R2, N1). It is
      // BLOCKED, with the server's own sentence, and no press pretends to fix it.
      if (row.state === "refused") {
        blocked.push({
          productKey: product.key,
          productName: product.name,
          reason: `${row.reason} This one is ours to repair — approving it again would not help, and we are on it.`,
        });
        continue;
      }
      alreadyGranted.push(product);
      continue;
    }
    wanted.push({ product, missing, renewal });
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
      renewals: wanted
        .filter(({ renewal }) => renewal)
        .map(({ product }) => product),
      targetAccountId: account?.id ?? null,
    },
    blocked,
    alreadyGranted,
    empty: false,
  };
}

/**
 * THE ONE ANSWER A PRESS GETS WHEN IT WOULD ASK THE PROVIDER FOR NOTHING (D8).
 * Every consent surface uses this — inline, in a toast, and as the settings
 * row's failure line — so two surfaces cannot answer the same account
 * differently.
 *
 * ORDER MATTERS. A blocked row is named FIRST, because "everything you switched
 * on is already connected" is false the moment one of them is refused for a
 * reason a reconnect cannot clear or is still behind our rollout gate — that
 * sentence was being printed directly under a row reading "Not working"
 * (VERIFY-U-P2-R2, N1). Only when nothing is blocked may the plan-empty
 * sentence speak, and it still distinguishes "nothing switched on" from
 * "everything switched on is already connected".
 */
export function emptyPlanAnswer(
  plan: ConsentPlan,
  selectedCount: number,
): string {
  if (plan.blocked.length > 0) {
    const named = plan.blocked
      .map((block) => `${block.productName} — ${block.reason}`)
      .join(" ");
    return `There is nothing to approve for what you switched on. ${named}`;
  }
  return selectedCount === 0
    ? "Nothing is switched on yet, so there is nothing to connect. Switch on what you want and press this again."
    : "Everything you switched on is already connected — there is nothing to approve.";
}

export type ConsentOutcomeState =
  /** The provider granted it and the exchange landed. */
  | "granted"
  /** The exchange landed and this one was not granted. */
  | "refused"
  /** Nothing was asked for it: it was already granted. */
  | "already_granted"
  /**
   * The exchange itself did not complete, so NOTHING about this row was
   * confirmed — never "granted" by scope arithmetic (VERIFY-U-P2-R3, N10).
   */
  | "not_completed";

export interface ConsentOutcome {
  product: ConnectorProduct;
  state: ConsentOutcomeState;
  /** What to say on the row. One sentence, never a code. */
  message: string;
}

/**
 * WHAT THE EXCHANGE ITSELF DID. Required, because per-row truth cannot be read
 * off the account alone (N10): a RENEWAL asks for scopes the account already
 * holds, so scope presence says "granted" whether the exchange landed or threw.
 */
export interface ConsentExchangeResult {
  /** True only when the provider exchange returned without throwing. */
  completed: boolean;
}

/**
 * Per-row truth AFTER the exchange: what the exchange did, and then the account
 * as the server left it — not what was asked for. A product the provider refused
 * shows its own line and the ones that landed keep theirs, which is the whole
 * point of reading the result back instead of trusting the request.
 *
 * 🚨 A FAILED EXCHANGE GRANTS NOTHING (VERIFY-U-P2-R3, N10). Outcomes were
 * derived from scope presence alone, so a nine-product renewal whose exchange
 * failed reported 9 of 9 "granted" — the green "Ready to use" list with a first
 * action per product, directly beside the red failure notice, while Settings →
 * Connectors still read "Needs reconnecting" for the same nine rows.
 */
export function consentOutcomes({
  provider,
  plan,
  account,
  rollout,
  exchange,
}: {
  provider: ConnectorProviderConfig;
  plan: ConsentPlan;
  /** The account as re-read after the exchange. */
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
  /** What the exchange did. A caller cannot forget it. */
  exchange: ConsentExchangeResult;
}): ConsentOutcome[] {
  const granted = new Set(account?.grantedScopes ?? []);
  const requested = plan.request?.products ?? [];
  const outcomes: ConsentOutcome[] = plan.alreadyGranted.map((product) => ({
    product,
    state: "already_granted" as const,
    message: "Already connected — nothing changed.",
  }));
  for (const product of requested) {
    if (!exchange.completed) {
      outcomes.push({
        product,
        state: "not_completed",
        message:
          "This was not connected — the approval did not finish. Nothing here is confirmed; this account's health rows say what it can do right now.",
      });
      continue;
    }
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
