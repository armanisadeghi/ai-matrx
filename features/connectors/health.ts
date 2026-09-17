// features/connectors/health.ts
//
// THE PER-CAPABILITY HEALTH ROW — pure derivation, no provider named.
//
// PLAN §5.3: "Per connected account, per product: granted scopes in plain
// words, last successful call, last refusal (what and why), rollout state, and
// the records that depend on it. … 'Connected' is never a boolean that lies."
//
// The champion failure this exists to beat (PLAN §1, last row): every one of
// the fifteen connector products surveyed says "connected" and returns nothing,
// and the only remedy offered is Resync. So a row here never says connected on
// the strength of a status column: it says connected when the account holds a
// live credential AND holds every scope the product needs AND the server says
// the capability is available to this account. Any other combination gets its
// own sentence and the one action that fixes it.
//
// 🚨 WHAT THE SERVER DOES NOT YET RECORD, and is therefore NOT shown as if it
// did: there is no per-capability call log. `users.integration_connections`
// carries ONE `last_verified_at` and ONE `last_error` for the whole account
// (verified live 2026-09-17: metadata keys are `granted_scopes`, `discovery`,
// `discovery_errors`, `discovery_warning_count`, `oauth_client_id` — no
// per-capability timestamps). So "last checked" and "last refusal" are reported
// at ACCOUNT level, labelled as such, and `lastSuccessAt` on a product row is
// null until the server records one. Inventing a per-product timestamp from the
// account's would be exactly the lie this file exists to prevent.

import type {
  ConnectorProduct,
  ConnectorProviderConfig,
} from "./provider-config";
import { productGrantScopes, scopeLanguage } from "./provider-config";

/** One connected provider account, as any provider's adapter reports it. */
export interface ConnectorAccount {
  id: string;
  /** What the person calls this account — an email, or a display name. */
  label: string;
  ownerKind: "person" | "organization";
  /** Set only for an organization-owned account. */
  organizationId: string | null;
  /** The provider identity behind it; two rows may share one. */
  providerSubject: string;
  grantedScopes: readonly string[];
  /** True only when the account can authorize a provider call right now. */
  usable: boolean;
  /** Short badge word for the account as a whole. */
  statusLabel: string;
  /** Exactly what is wrong with the account, or why it is fine. */
  statusReason: string;
  /** The one action that fixes the account, when there is one. */
  statusRemedy: string | null;
  /** Account-level: when the provider last confirmed this credential. */
  lastVerifiedAt: string | null;
  /** Account-level: the last refusal the server recorded, verbatim. */
  lastError: string | null;
}

/** What the SERVER says about one capability for this caller, right now. */
export interface ConnectorCapabilityRollout {
  capabilityKey: string;
  /** `available` = live for everyone; `pending` = still behind our gate. */
  phase: "available" | "pending";
  /** True when this caller may use it today. */
  eligible: boolean;
  /** The server's own scope list for this capability. */
  requiredScopes: readonly string[];
  /** The server's sentence for why not, when it refused. */
  ineligibleReason: string | null;
}

export type ConnectorProductState =
  /** Every scope granted, capability live: it works. */
  | "connected"
  /** Live and wanted, but the grant is missing a scope. One reconnect fixes it. */
  | "scope_missing"
  /** Scopes granted, but the account itself cannot authorize anything. */
  | "account_unusable"
  /** Never switched on. */
  | "not_connected"
  /** Behind our rollout gate — it turns on by itself. No toggle. */
  | "pending_rollout";

export interface ConnectorScopeFact {
  scope: string;
  /** Plain words for what this scope lets us do. */
  language: string;
  granted: boolean;
}

export interface ConnectorProductHealth {
  product: ConnectorProduct;
  state: ConnectorProductState;
  /** Badge word. Never "Connected" unless the state really is. */
  label: string;
  /** One sentence of truth about this product on this account. */
  reason: string;
  /** The one action that changes the state, or null. */
  remedy: string | null;
  /** Every scope the product needs, granted or not, in plain words. */
  scopes: ConnectorScopeFact[];
  /** Exactly the scopes a reconnect must add — never the whole bundle. */
  missingScopes: string[];
  /** Server rollout rows behind this product. */
  rollout: ConnectorCapabilityRollout[];
  /**
   * When the provider last succeeded for THIS product. Null whenever the
   * server records no per-capability call — never the account's timestamp
   * wearing a product's label.
   */
  lastSuccessAt: string | null;
  /** True when the person may switch this row on in the consent dialog. */
  togglable: boolean;
}

function rolloutFor(
  product: ConnectorProduct,
  rollout: readonly ConnectorCapabilityRollout[],
): ConnectorCapabilityRollout[] {
  return product.capabilityKeys
    .map((key) => rollout.find((row) => row.capabilityKey === key))
    .filter((row): row is ConnectorCapabilityRollout => row !== undefined);
}

/**
 * The scopes a product needs: the provider config's bundle, widened by
 * whatever the SERVER says the capability requires. The server is the authority
 * on its own capability, and a client bundle that has drifted must not make a
 * row look complete.
 */
export function requiredScopesFor(
  provider: ConnectorProviderConfig,
  product: ConnectorProduct,
  rollout: readonly ConnectorCapabilityRollout[],
): string[] {
  const identity = new Set<string>(provider.identityScopes);
  const out = new Set<string>(productGrantScopes(provider, product));
  for (const row of rolloutFor(product, rollout)) {
    for (const scope of row.requiredScopes) {
      if (!identity.has(scope)) out.add(scope);
    }
  }
  return [...out];
}

/** Is every capability behind this product live for this caller? */
export function productIsEligible(
  product: ConnectorProduct,
  rollout: readonly ConnectorCapabilityRollout[],
): boolean {
  const rows = rolloutFor(product, rollout);
  // No catalog answer yet is not the same as "not allowed" — the dialog keeps
  // the row unavailable rather than guessing, and says the catalog is loading.
  if (rows.length !== product.capabilityKeys.length) return false;
  return rows.every((row) => row.eligible);
}

/**
 * One product's health on one account. `account: null` means "nobody has
 * connected this provider yet" — the row still reports rollout truth, because
 * a product behind the gate must not offer a toggle even on an empty screen.
 */
export function productHealth({
  provider,
  product,
  account,
  rollout,
}: {
  provider: ConnectorProviderConfig;
  product: ConnectorProduct;
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
}): ConnectorProductHealth {
  const required = requiredScopesFor(provider, product, rollout);
  const granted = new Set(account?.grantedScopes ?? []);
  const missingScopes = required.filter((scope) => !granted.has(scope));
  const rows = rolloutFor(product, rollout);
  const eligible = productIsEligible(product, rollout);
  const held = required.length > 0 && missingScopes.length < required.length;

  const scopes: ConnectorScopeFact[] = required.map((scope) => ({
    scope,
    language: scopeLanguage(provider, scope),
    granted: granted.has(scope),
  }));

  const pending = rows.find((row) => row.phase === "pending" && !row.eligible);
  if (pending && !held) {
    return {
      product,
      state: "pending_rollout",
      label: "Almost ready",
      // PLAN §2: the exact line for a row still behind our gate.
      reason: "Turns on automatically when ready for your account.",
      remedy: null,
      scopes,
      missingScopes,
      rollout: rows,
      lastSuccessAt: null,
      togglable: false,
    };
  }

  const blockedByServer = rows.find((row) => !row.eligible);

  if (!account || missingScopes.length === required.length) {
    return {
      product,
      state: "not_connected",
      label: "Not connected",
      reason: product.promise,
      remedy: blockedByServer?.ineligibleReason ?? null,
      scopes,
      missingScopes,
      rollout: rows,
      lastSuccessAt: null,
      togglable: eligible,
    };
  }

  if (!account.usable) {
    return {
      product,
      state: "account_unusable",
      label: "Needs reconnecting",
      reason: account.statusReason,
      remedy:
        account.statusRemedy ??
        `Reconnect ${account.label} to use ${product.name} again.`,
      scopes,
      missingScopes,
      rollout: rows,
      lastSuccessAt: null,
      togglable: eligible,
    };
  }

  if (missingScopes.length > 0) {
    return {
      product,
      state: "scope_missing",
      label: "Partly connected",
      reason: `${account.label} is connected but has not granted ${missingScopes
        .map((scope) => scopeLanguage(provider, scope).toLowerCase())
        .join(", ")}.`,
      remedy: `Reconnect and approve just that — nothing you already granted is asked for again.`,
      scopes,
      missingScopes,
      rollout: rows,
      lastSuccessAt: null,
      togglable: eligible,
    };
  }

  if (blockedByServer) {
    return {
      product,
      state: "pending_rollout",
      label: "Paused",
      reason:
        blockedByServer.ineligibleReason ??
        `${product.name} is paused for your account while we finish certifying it.`,
      remedy: null,
      scopes,
      missingScopes,
      rollout: rows,
      lastSuccessAt: null,
      togglable: false,
    };
  }

  return {
    product,
    state: "connected",
    label: "Connected",
    reason: product.promise,
    remedy: null,
    scopes,
    missingScopes,
    rollout: rows,
    // Deliberately null: see the header. No per-capability call is recorded yet.
    lastSuccessAt: null,
    togglable: eligible,
  };
}

/** Every product's health on one account, in config order. */
export function accountHealth({
  provider,
  account,
  rollout,
}: {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
}): ConnectorProductHealth[] {
  return provider.products.map((product) =>
    productHealth({ provider, product, account, rollout }),
  );
}

/**
 * The sentence a Revoke control must state BEFORE it runs — what actually
 * stops, named (`common-docs/policies/destructive-and-expensive-actions.md`).
 * A generic "Are you sure?" fails that policy.
 */
export function revokeConsequence(
  provider: ConnectorProviderConfig,
  account: ConnectorAccount,
  health: readonly ConnectorProductHealth[],
  attachedResourceCount: number,
): string {
  const live = health.filter((row) => row.state === "connected");
  const parts = live.map((row) => row.product.stopsOnRevoke);
  const head = `Disconnecting ${account.label} removes its ${provider.name} access from AI Matrx`;
  if (parts.length === 0) {
    return `${head}. Nothing is using it right now, so nothing stops working.`;
  }
  const resources =
    attachedResourceCount > 0
      ? ` The ${attachedResourceCount} item${
          attachedResourceCount === 1 ? "" : "s"
        } you picked with this account stop resolving until you connect it again.`
      : "";
  return `${head}, which stops ${parts.join("; ")}.${resources}`;
}

/** Is this provider connected at all? Drives the prompt card's own visibility. */
export function anyProductConnected(
  health: readonly ConnectorProductHealth[],
): boolean {
  return health.some((row) => row.state === "connected");
}
