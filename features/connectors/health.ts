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
// 🚨 PER-PRODUCT CALL FACTS ARE REAL NOW, AND STILL NEVER BORROWED. The server
// records, per capability, the last call the provider ANSWERED and the last
// call it REFUSED — with a classified code, a person-facing sentence and the
// HTTP status (aidream `services/google_integrations/call_health.py`, column
// `users.integration_connections.capability_health`). An adapter folds that
// record into `activity`, keyed by product; this file derives from it and
// never from the ACCOUNT's `last_verified_at` / `last_error`, which stay on the
// account line labelled as account-level.
//
// Absent still means ABSENT: a product with no recorded call carries null in
// both fields and the row says "No calls recorded yet" in its own words — never
// a blank, never a borrowed timestamp, never a green line nothing supports
// (law 4: every stand-in announces itself). On 2026-09-17 every one of the
// eleven live Google connections was still at the column's bare default, so
// that sentence is what the screen shows today.
//
// A RECORDED REFUSAL CHANGES WHAT THE ROW MAY CLAIM. "Connected" is never a
// boolean that lies, and a product whose last provider call was refused is not
// connected just because its scopes are all present: when the newest fact for a
// product is a refusal the person must act on (`scope_missing`,
// `grant_expired_or_revoked`, `provider_denied`), the row goes to `refused`,
// states the server's sentence, and offers the ONE Reconnect that asks for only
// what is missing. A refusal that fixes ITSELF (`quota_exhausted`,
// `provider_unavailable`) or that is OURS to repair (`platform_configuration`)
// never offers a button that would not help — it says so instead.

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
  /**
   * What the provider RECORDED for this account, per product key. Supplied by
   * the provider adapter from the server's own call record; absent means the
   * server records nothing for this account, never that nothing happened.
   */
  activity?: ConnectorActivityByProduct;
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
  /**
   * Every scope is present and the account is usable, but the provider's own
   * last word on this product is a refusal the person must act on. The row
   * carries that sentence and the one action that fixes it.
   */
  | "refused"
  /** Behind our rollout gate — it turns on by itself. No toggle. */
  | "pending_rollout";

/**
 * What a provider adapter knows about ONE product's real traffic on ONE
 * account. Every field is optional truth: absent means "the server does not
 * record this", never "it never happened".
 */
export interface ConnectorProductActivity {
  /** ISO timestamp of the last call this product completed. */
  lastSuccessAt?: string | null;
  /** The last refusal for this product, in the provider's own words. */
  lastRefusal?: ConnectorRefusalInput | null;
}

/** What an adapter hands over for one recorded refusal. */
export interface ConnectorRefusalInput {
  /** The provider-classified sentence a person can act on. Never a code. */
  message: string;
  at?: string | null;
  /** The classified reason, when the provider classifies its refusals. */
  code?: ConnectorRefusalCode | null;
  /** The provider's HTTP status, when it recorded one. */
  httpStatus?: number | null;
}

/**
 * THE REFUSAL VOCABULARY — the exact set the recording seam emits
 * (`aidream/aidream/services/google_integrations/call_health.py::RefusalCode`).
 * `__tests__/refusal-codes-are-the-servers-codes.test.ts` re-reads that file and
 * fails when the two disagree, so a server code cannot ship without a
 * disposition here and a code here cannot outlive the server's.
 */
export const CONNECTOR_REFUSAL_CODES = [
  "scope_missing",
  "grant_expired_or_revoked",
  "platform_configuration",
  "provider_denied",
  "resource_unavailable",
  "quota_exhausted",
  "provider_unavailable",
  "call_failed",
] as const;

export type ConnectorRefusalCode = (typeof CONNECTOR_REFUSAL_CODES)[number];

export function isConnectorRefusalCode(
  value: unknown,
): value is ConnectorRefusalCode {
  return (
    typeof value === "string" &&
    (CONNECTOR_REFUSAL_CODES as readonly string[]).includes(value)
  );
}

/**
 * WHAT A REFUSAL MEANS FOR THE PERSON — the one place a code becomes an
 * expectation, so no component branches on a code:
 *
 * - `reconnect`    — only the person can fix it, with one reconnect.
 * - `self_healing` — it clears by itself; nothing about the connection is
 *                    broken, so offering a reconnect would waste their time.
 * - `ours`         — our own configuration; a reconnect cannot help.
 * - `retry`        — the one call failed; the connection is intact.
 */
export type ConnectorRefusalDisposition =
  | "reconnect"
  | "self_healing"
  | "ours"
  | "retry";

const REFUSAL_DISPOSITION: Record<
  ConnectorRefusalCode,
  ConnectorRefusalDisposition
> = {
  scope_missing: "reconnect",
  grant_expired_or_revoked: "reconnect",
  // The server's own sentence for a 401/403 tells the person to reconnect, so
  // the row must carry the button that sentence promises — a sentence saying
  // "reconnect it" beside no control is the dead end this primitive exists to
  // end. Cost if this is wrong: a person presses Reconnect on a denial a
  // reconnect cannot clear, re-approves the same scopes, and the row keeps its
  // refusal — no data moves, and the fact on screen stays true.
  provider_denied: "reconnect",
  platform_configuration: "ours",
  quota_exhausted: "self_healing",
  provider_unavailable: "self_healing",
  resource_unavailable: "retry",
  call_failed: "retry",
};

export function refusalDisposition(
  code: ConnectorRefusalCode | null,
): ConnectorRefusalDisposition | null {
  return code ? REFUSAL_DISPOSITION[code] : null;
}

/** Per-product activity keyed by `ConnectorProduct.key`. */
export type ConnectorActivityByProduct = Readonly<
  Record<string, ConnectorProductActivity>
>;

export interface ConnectorRefusalFact {
  /** The provider's own sentence. Never a code. */
  message: string;
  /** When it happened, when the server records that too. */
  at: string | null;
  /**
   * The provider's classified reason. A technical detail: it is shown inside
   * the permission disclosure beside the provider's own scope strings, never on
   * the row itself, where the person reads the sentence (D6).
   */
  code: ConnectorRefusalCode | null;
  /** The provider's HTTP status, when it recorded one. */
  httpStatus: number | null;
  /** What this refusal means for the person. Null when the code is unknown. */
  disposition: ConnectorRefusalDisposition | null;
}

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
   * server records no call for it — never the account's timestamp wearing a
   * product's label. Rendered as "No calls recorded yet", never blank.
   */
  lastSuccessAt: string | null;
  /**
   * The last refusal for THIS product, in the provider's own words. Null
   * whenever the server records no refusal for it — the account-level refusal
   * stays on the account line and is never re-labelled per product.
   */
  lastRefusal: ConnectorRefusalFact | null;
  /**
   * One extra sentence about what the provider last did to this product, for
   * the states where the row is NOT broken and must not offer a button: a
   * quota or an outage that clears by itself, or a call that simply failed.
   * Null when there is nothing honest to add.
   */
  activityNote: string | null;
  /** True when the person may switch this row on in the consent dialog. */
  togglable: boolean;
  /**
   * The verb for the one action that changes this row, or null when there is
   * nothing to press. "Reconnect" tells a person something they HAD has broken,
   * so it is used only when a grant exists; a product never granted on this
   * account says "Connect".
   */
  actionLabel: ConnectorProductAction | null;
}

/** The verb on a product row's action. Never both, never neither by accident. */
export type ConnectorProductAction = "Connect" | "Reconnect";

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
  activity,
}: {
  provider: ConnectorProviderConfig;
  product: ConnectorProduct;
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
  /** Per-product traffic the adapter knows about. Absent = not recorded. */
  activity?: ConnectorActivityByProduct;
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

  // The adapter may hand activity in directly (the pure call sites and the
  // tests) or leave it on the account it read it from. One resolution, so no
  // component has to remember to pass it through.
  const recorded = (activity ?? account?.activity)?.[product.key];
  const lastSuccessAt = recorded?.lastSuccessAt ?? null;
  const lastRefusal: ConnectorRefusalFact | null = recorded?.lastRefusal
    ? {
        message: recorded.lastRefusal.message,
        at: recorded.lastRefusal.at ?? null,
        code: recorded.lastRefusal.code ?? null,
        httpStatus: recorded.lastRefusal.httpStatus ?? null,
        disposition: refusalDisposition(recorded.lastRefusal.code ?? null),
      }
    : null;

  /**
   * Is the refusal the provider's LAST word on this product? A refusal older
   * than the last success has already been overtaken by a call that worked, so
   * it stays visible in the disclosure and changes nothing about the row.
   *
   * Cost if this reading is wrong: a person who repaired the grant elsewhere
   * sees "Not working" until the next call for that product runs. The record is
   * the only evidence there is, and showing "Connected" over a refusal nothing
   * has answered is the lie this file exists to prevent.
   */
  const refusalStands = Boolean(
    lastRefusal &&
      (!lastSuccessAt ||
        Date.parse(lastRefusal.at ?? "") > Date.parse(lastSuccessAt)),
  );
  const standingRefusal = refusalStands ? lastRefusal : null;
  const refusalNeedsReconnect =
    standingRefusal?.disposition === "reconnect";
  const activityNote =
    standingRefusal &&
    (standingRefusal.disposition === "self_healing" ||
      standingRefusal.disposition === "retry" ||
      standingRefusal.disposition === null)
      ? standingRefusal.message
      : null;

  /**
   * Everything common to every state, so a new state can never forget one of
   * them — and so the ONE place that decides "Connect" vs "Reconnect" is here.
   */
  const row = (
    part: Pick<
      ConnectorProductHealth,
      "state" | "label" | "reason" | "remedy" | "togglable"
    >,
  ): ConnectorProductHealth => ({
    product,
    ...part,
    scopes,
    missingScopes,
    rollout: rows,
    lastSuccessAt,
    lastRefusal,
    activityNote,
    // D3: the verb is the truth about this account, not about the button.
    // Nothing to ask for, or nothing the person may ask for → no action at all.
    // A standing refusal only the person can clear earns a Reconnect even when
    // every scope is present: the grant itself is what has to be renewed.
    actionLabel: !part.togglable
      ? null
      : missingScopes.length > 0
        ? held
          ? "Reconnect"
          : "Connect"
        : refusalNeedsReconnect
          ? "Reconnect"
          : null,
  });

  const pending = rows.find((r) => r.phase === "pending" && !r.eligible);
  if (pending && !held) {
    return row({
      state: "pending_rollout",
      label: "Almost ready",
      // PLAN §2: the exact line for a row still behind our gate.
      reason: "Turns on automatically when ready for your account.",
      remedy: null,
      togglable: false,
    });
  }

  const blockedByServer = rows.find((r) => !r.eligible);

  if (!account || missingScopes.length === required.length) {
    return row({
      state: "not_connected",
      label: "Not connected",
      reason: product.promise,
      remedy: blockedByServer?.ineligibleReason ?? null,
      togglable: eligible,
    });
  }

  if (!account.usable) {
    return row({
      state: "account_unusable",
      label: "Needs reconnecting",
      reason: account.statusReason,
      remedy:
        account.statusRemedy ??
        `Reconnect ${account.label} to use ${product.name} again.`,
      togglable: eligible,
    });
  }

  if (missingScopes.length > 0) {
    return row({
      state: "scope_missing",
      label: "Partly connected",
      reason: `${account.label} is connected but has not granted ${missingScopes
        .map((scope) => scopeLanguage(provider, scope).toLowerCase())
        .join(", ")}.`,
      remedy: `Reconnect and approve just that — nothing you already granted is asked for again.`,
      togglable: eligible,
    });
  }

  // The provider's own last word outranks a green badge: a product whose newest
  // recorded fact is a refusal the person must act on, or one that is ours to
  // repair, is not "Connected" (D2 + "connected is never a boolean that lies").
  if (
    standingRefusal &&
    (standingRefusal.disposition === "reconnect" ||
      standingRefusal.disposition === "ours")
  ) {
    return row({
      state: "refused",
      label: "Not working",
      // The server's sentence, verbatim: it was written for this person.
      reason: standingRefusal.message,
      remedy:
        standingRefusal.disposition === "reconnect"
          ? `Reconnect ${account.label} and approve ${product.name} — nothing you already granted is asked for again.`
          : null,
      togglable: eligible,
    });
  }

  if (blockedByServer) {
    return row({
      state: "pending_rollout",
      label: "Paused",
      reason:
        blockedByServer.ineligibleReason ??
        `${product.name} is paused for your account while we finish certifying it.`,
      remedy: null,
      togglable: false,
    });
  }

  return row({
    state: "connected",
    label: "Connected",
    reason: product.promise,
    remedy: null,
    togglable: eligible,
  });
}

/**
 * THE ROLLOUT STATE IN PLAIN WORDS (PLAN §5.3, D6). A capability key
 * (`drive_files`, `youtube_analytics`) is a machine address; the person sees
 * the product name and a sentence, and the keys never render. Null means the
 * catalog has nothing worth saying about this row.
 */
export function rolloutSentence(row: ConnectorProductHealth): string | null {
  if (row.rollout.length === 0) return null;
  const blocked = row.rollout.find((entry) => !entry.eligible);
  if (blocked) {
    return (
      blocked.ineligibleReason ??
      "Turns on automatically when ready for your account."
    );
  }
  if (row.rollout.every((entry) => entry.phase === "available")) {
    return `${row.product.name} is generally available on your account.`;
  }
  return `${row.product.name} is available to your account while we finish certifying it for everyone.`;
}

/**
 * WHICH ACCOUNT A CONSENT SURFACE SHOULD OPEN ON (D7). Never "the first row the
 * inventory happened to return": that is how a dialog opens on an account that
 * holds nothing and tells a person Docs is not connected while Docs is
 * connected on the account beside it. The order is: the account the calling
 * surface is already using, then the usable account holding the MOST live
 * products, ties broken by config order of the inventory.
 */
export function preferredAccountId({
  provider,
  accounts,
  rollout,
  preferAccountId,
}: {
  provider: ConnectorProviderConfig;
  accounts: readonly ConnectorAccount[];
  rollout: readonly ConnectorCapabilityRollout[];
  /** The account the surface is using, when it knows. Wins outright. */
  preferAccountId?: string | null;
}): string | null {
  if (
    preferAccountId &&
    accounts.some((account) => account.id === preferAccountId)
  ) {
    return preferAccountId;
  }
  const usable = accounts.filter((account) => account.usable);
  const pool = usable.length > 0 ? usable : accounts;
  let best: { id: string; live: number } | null = null;
  for (const account of pool) {
    const live = accountHealth({ provider, account, rollout }).filter(
      (row) => row.state === "connected",
    ).length;
    if (!best || live > best.live) best = { id: account.id, live };
  }
  return best?.id ?? null;
}

/** Every product's health on one account, in config order. */
export function accountHealth({
  provider,
  account,
  rollout,
  activity,
}: {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
  activity?: ConnectorActivityByProduct;
}): ConnectorProductHealth[] {
  return provider.products.map((product) =>
    productHealth({ provider, product, account, rollout, activity }),
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
