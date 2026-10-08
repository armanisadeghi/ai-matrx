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
// This file never builds a queue of exchanges. Most requests carry identity,
// existing scopes and the selected addition. YouTube is the exception: Google
// rejected its combination with drive.file on a real account, so it receives
// a focused, separate canonical connection for the same Google identity.
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
import { GOOGLE_SCOPE, hasGoogleGrantedScope } from "@/lib/googleScopes";
import {
  productHealth,
  productIsEligible,
  type ConnectorAccount,
  type ConnectorCapabilityRollout,
  type ConnectorProductHealth,
  type ConnectorRefusalDisposition,
} from "./health";
import { requiredScopesFor } from "./health";

/**
 * THE PERSON-FACING CONSEQUENCE FOR A BLOCKED REFUSED ROW (missing.length === 0,
 * not a renewal) — keyed on DISPOSITION, never assumed. `health.ts`'s
 * `standingRefusal.message` is already the server's sentence; this is only
 * what WE add on top of it, and it must never borrow another disposition's
 * actor.
 *
 * THE BUG THIS CLASS-FIXES (Cursor Bugbot round 13, PR 228, comment
 * 4041550778): a single hard-coded "This one is ours to repair — approving it
 * again would not help, and we are on it." was appended to EVERY blocked
 * refused row, so a `share_required` refusal (a DIFFERENT Google identity
 * must share the item — nothing here is ours to fix) got the same "we are on
 * it" claim as a genuine `platform_configuration` mistake.
 *
 * `reconnect`, `self_healing` and `retry` never reach this function: a
 * `reconnect` disposition with no missing scope is a RENEWAL (handled above,
 * never blocked), and `self_healing`/`retry` never produce `state: "refused"`
 * in `health.ts`'s census. They are still named here, explicitly, so a future
 * change to that census fails a real assertion instead of silently reusing
 * this copy — and so a disposition this switch has never seen fails
 * TYPE-CHECK via the exhaustive `default`, never a silent fallthrough.
 */
function blockedRefusalReason(
  serverSentence: string,
  disposition: ConnectorRefusalDisposition | null,
): string {
  switch (disposition) {
    case "ours":
      return `${serverSentence} This one is ours to repair — approving it again would not help, and we are on it.`;
    case "share_required":
      // The server's own sentence already names who must act — a different
      // Google identity sharing the item — so it speaks for itself; adding an
      // ownership claim here would contradict it.
      return serverSentence;
    case "reconnect":
    case "self_healing":
    case "retry":
    case null:
      return serverSentence;
    default: {
      const exhaustive: never = disposition;
      return exhaustive;
    }
  }
}

export interface ConsentRequest {
  /** YouTube needs its own focused grant when another Google product is connected. */
  connectionPurpose: "google_products" | "youtube_isolated";
  /** Catalog keys the hub validates the scope set against. */
  capabilityKeys: string[];
  /** Everything asked for: cumulative on a normal connection, focused for YouTube. */
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
  /** Re-display the provider's consent screen even when every scope is held. */
  forceConsent?: boolean;
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

export type PermissionsReviewPlan =
  | { request: ConsentRequest; refusal: null }
  | { request: null; refusal: string };

/**
 * Re-open Google consent for one healthy shared connection without changing
 * what it may do. The stored scope strings are copied literally; the server
 * remains the atomic guard if Google returns a wider or narrower grant.
 */
export function buildPermissionsReviewPlan({
  provider,
  account,
  rollout,
}: {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount;
  rollout: readonly ConnectorCapabilityRollout[];
}): PermissionsReviewPlan {
  const refuse = (refusal: string): PermissionsReviewPlan => ({
    request: null,
    refusal,
  });
  if (provider.id !== "google" || !account.usable || account.blocked) {
    return refuse("Reconnect this account before reviewing its permissions.");
  }
  if (account.ownerKind === "organization" && !account.organizationId) {
    return refuse("This shared connection has no organization owner to approve changes.");
  }
  const isolatedByPurpose =
    account.connectionPurpose === "google_ads_isolated" ||
    account.connectionPurpose === "youtube_isolated";
  const isolatedByScope = account.grantedScopes.some(
    (scope) =>
      scope === GOOGLE_SCOPE.googleAds ||
      scope === GOOGLE_SCOPE.youtubeReadonly ||
      scope === GOOGLE_SCOPE.youtubeAnalyticsReadonly,
  );
  if (isolatedByPurpose || isolatedByScope) {
    return refuse(
      "Review this dedicated Ads or YouTube connection from its own Google settings.",
    );
  }

  const identityScopes = new Set([
    ...provider.identityScopes,
    GOOGLE_SCOPE.userinfoEmail,
    GOOGLE_SCOPE.userinfoProfile,
  ]);

  const products = provider.products.filter((product) => {
    const grants = requiredScopesFor(provider, product, rollout);
    return (
      grants.length > 0 &&
      grants.every((scope) => account.grantedScopes.includes(scope))
    );
  });
  const representedScopes = new Set(
    products.flatMap((product) => requiredScopesFor(provider, product, rollout)),
  );
  const unrepresented = account.grantedScopes.filter(
    (scope) => !identityScopes.has(scope) && !representedScopes.has(scope),
  );
  if (unrepresented.length > 0) {
    return refuse(
      "This connection includes a Google permission that is not listed here. Review it in your Google Account.",
    );
  }
  const ineligible = products.filter(
    (product) => !productIsEligible(product, rollout),
  );
  if (ineligible.length > 0) {
    return refuse(
      `${ineligible.map((product) => product.name).join(", ")} cannot be reviewed for this account right now. Try again when available.`,
    );
  }
  const capabilityKeys = [
    ...new Set(products.flatMap((product) => product.capabilityKeys)),
  ];
  if (capabilityKeys.length === 0 || account.grantedScopes.length === 0) {
    return refuse("This connection has no product permissions to review.");
  }

  return {
    request: {
      connectionPurpose: "google_products",
      capabilityKeys,
      scopes: [...account.grantedScopes],
      addedScopes: [],
      products,
      renewals: products,
      targetAccountId: account.id,
      forceConsent: true,
    },
    refusal: null,
  };
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
  const selected = selectedProductKeys
    .map((key) => productByKey(provider, key))
    .filter((product): product is ConnectorProduct => product !== undefined)
    // Config order, never click order: the request reads the way the dialog does.
    .sort(
      (a, b) => provider.products.indexOf(a) - provider.products.indexOf(b),
    );

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
    // 🚨 A BLOCKED ACCOUNT HAS NOTHING TO ASK FOR, AND IS NOT "ALREADY GRANTED"
    // (V17-1). The provider, or our own app configuration, refuses everything:
    // the row falls out here with its own sentence so the press answers honestly
    // instead of reporting the product as connected.
    if (row.state === "unavailable") {
      blocked.push({
        productKey: product.key,
        productName: product.name,
        reason: [row.reason, row.remedy].filter(Boolean).join(" "),
      });
      continue;
    }
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
          reason: blockedRefusalReason(
            row.reason,
            row.lastRefusal?.disposition ?? null,
          ),
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

  // Google rejected a real Drive-file + YouTube authorization. A reconnect of
  // an existing broad account cannot cure that by dropping its old scopes:
  // that would replace the credential backing the person's picked files.
  // Use a separate canonical connection for YouTube, even for the same Google
  // identity. Never silently discard another product selected in this press.
  //
  // A RENEWAL IS NOT A NEW GRANT. When YouTube's scopes are all already held
  // (a dead credential) YouTube is not moved to a new connection — that would
  // leave the dead one dead — but beside other products it is still its own
  // labelled step. Only a YouTube row that ADDS scopes gets the isolated request.
  const youtubeEntry = wanted.find(({ product }) => product.key === "youtube");
  const youtubeAdds = youtubeEntry !== undefined && !youtubeEntry.renewal;
  // YouTube beside other products is NEVER one combined press — new grant or
  // renewal (a renewal sends the same scope set Google rejected in dc39b03173).
  const isolatedProduct = youtubeEntry?.product;
  if (youtubeEntry !== undefined && isolatedProduct !== undefined && wanted.length > 1) {
    const others = wanted.filter(({ product }) => product.key !== "youtube");
    const separately = `Connect ${isolatedProduct.name} separately from the other selected Google products. Your existing connections are unchanged.`;
    if (youtubeEntry.renewal || others.some(({ renewal }) => renewal)) {
      // Something here is a dead grant that only a reconnect can clear: never
      // leave the person with nothing to press. Step one renews/adds the
      // others; YouTube is its own labeled step after it.
      const rest = buildConsentPlan({
        provider,
        selectedProductKeys: others.map(({ product }) => product.key),
        account,
        rollout,
      });
      return {
        ...rest,
        blocked: [
          ...rest.blocked,
          {
            productKey: isolatedProduct.key,
            productName: isolatedProduct.name,
            reason: `Step 2 of 2 — ${separately} Press again once this step has finished and ${isolatedProduct.name} is all that is left.`,
          },
        ],
      };
    }
    return {
      request: null,
      blocked: wanted.map(({ product }) => ({
        productKey: product.key,
        productName: product.name,
        reason: separately,
      })),
      alreadyGranted,
      empty: true,
    };
  }

  const addedSet = new Set(wanted.flatMap(({ missing }) => missing));
  // Reduce only new redundant read requirements. Existing literal grants below
  // stay cumulative, and a read-only choice can never add management access.
  if (addedSet.has(GOOGLE_SCOPE.calendarEventsWrite)) {
    addedSet.delete(GOOGLE_SCOPE.calendarEventsReadonly);
  }
  if (addedSet.has(GOOGLE_SCOPE.webmasters)) {
    addedSet.delete(GOOGLE_SCOPE.webmastersReadonly);
  }
  if (addedSet.has(GOOGLE_SCOPE.gmailModify)) {
    addedSet.delete(GOOGLE_SCOPE.gmailReadonly);
  }
  if (addedSet.has(GOOGLE_SCOPE.contactsWrite)) {
    addedSet.delete(GOOGLE_SCOPE.contactsReadonly);
  }
  if (addedSet.has(GOOGLE_SCOPE.tasksWrite)) {
    addedSet.delete(GOOGLE_SCOPE.tasksReadonly);
  }
  const added = [...addedSet];
  const isolatedYouTube = youtubeAdds;
  return {
    request: {
      connectionPurpose: isolatedYouTube
        ? "youtube_isolated"
        : "google_products",
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
          ...(isolatedYouTube
            ? wanted.flatMap(({ product }) => product.scopes)
            : [...(account?.grantedScopes ?? []), ...added]),
        ]),
      ],
      addedScopes: added,
      products: wanted.map(({ product }) => product),
      renewals: wanted
        .filter(({ renewal }) => renewal)
        .map(({ product }) => product),
      targetAccountId: isolatedYouTube ? null : (account?.id ?? null),
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
  const grantedScopes = account?.grantedScopes ?? [];
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
      (scope) => !hasGoogleGrantedScope(grantedScopes, scope),
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
