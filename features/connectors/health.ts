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
// A DEAD CREDENTIAL IS A RENEWAL OF EVERYTHING THE ACCOUNT HOLDS. `usable` is
// false when the provider will not authorize anything for this account any more
// (revoked, no credential on file, `needs_attention`). Every product it still
// holds the scopes for is then broken, and the ONE repair is a fresh grant — so
// the verb here is "Reconnect" and its SCOPE is the account, not the product
// (`actionScope`). Until 2026-09-17 the verb came from `missingScopes` and the
// recorded refusal alone, so nine rows said "Reconnect probe@example.com."
// beside no control at all and the consent dialog answered "everything you
// switched on is already connected" (VERIFY-U-P2-R2, N2).
//
// A REFUSAL STANDS UNTIL SOMETHING ANSWERS THE CALL IT REFUSED — and when a
// product covers several provider capabilities, only the adapter can tell:
// `activity.refusalStands` is its answer, and this file honours it rather than
// comparing the product's newest refusal with the product's newest success. A
// `docs` refusal followed five minutes later by a `drive_files` success rendered
// "Connected" with no control and "Reconnect it and approve Docs." two lines
// below it (VERIFY-U-P2-R3, N11). A timestamp that does not parse is not a
// timestamp, on either half (N14).
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
  /**
   * Account-level: the last refusal recorded on this account, AS A SENTENCE an
   * adapter already translated. Never the provider's or the server's own text.
   *
   * 🚨 There used to be a `lastError` here carrying `users.integration_connections
   * .last_error` verbatim, which is aidream's operator text — a vault item name,
   * a connection UUID and a Python exception class reached the screen through it
   * (VERIFY-U-P2-R3, N9). The field is gone so no adapter can do that again: the
   * translation happens where the provider is known, and this carries the result.
   */
  lastRefusalSentence: string | null;
  /**
   * A TRANSIENT outage while the server checked what this account can reach —
   * never a broken credential. `usable` stays true and no product on the
   * account gets flagged for it: the grant is fine, the server just could not
   * confirm which products answer yet, and the sentence says to try again.
   * Null when nothing of the kind is recorded. This is deliberately separate
   * from `lastRefusalSentence`: a discovery outage is not a refusal on any one
   * capability, it is the server unable to check several of them at once.
   */
  discoveryOutageSentence?: string | null;
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
  /**
   * ISO timestamp of the last CONSENT that (re-)granted this product's scopes.
   * A grant is not a call (N12): a product with a grant and no success has
   * never been used, only approved, and the row says exactly that rather than
   * wearing the grant as a "last successful use" it never had.
   */
  lastGrantAt?: string | null;
  /** The last refusal for this product, in the provider's own words. */
  lastRefusal?: ConnectorRefusalInput | null;
  /**
   * Does that refusal still STAND — has nothing since answered the call it
   * refused? The adapter states it because only the adapter has the facts: one
   * product row may cover several provider capabilities (Workspace files covers
   * `drive_files`, `docs` and `sheets`), and comparing the product's newest
   * refusal against the product's newest success loses a live refusal behind a
   * sibling capability's success (VERIFY-U-P2-R3, N11). Absent = derive it from
   * the two timestamps, which is correct for a one-capability product.
   */
  refusalStands?: boolean;
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
  /**
   * The credential is fine and the product is fine — THIS item (a GA4
   * property, a Search Console site, a Tag Manager container) was never
   * shared with the connected Google account. A reconnect re-approves the
   * same scopes and lands in the same place, so this is never `reconnect`:
   * the one fix is someone who already has access sharing the item, or the
   * person choosing an item this account can already see.
   */
  "resource_permission_denied",
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
 * - `reconnect`      — only the person can fix it, with one reconnect.
 * - `self_healing`   — it clears by itself; nothing about the connection is
 *                      broken, so offering a reconnect would waste their time.
 * - `ours`           — our own configuration; a reconnect cannot help.
 * - `retry`          — the one call failed; the connection is intact.
 * - `share_required` — the credential and the scopes are both fine; a
 *                      DIFFERENT Google identity — this item's owner — must
 *                      share it before this account can read it. Reconnecting
 *                      re-approves the same scopes and lands in the exact same
 *                      refusal, so a Reconnect button here is the dead control
 *                      this vocabulary exists to end (law 4): the row states
 *                      the server's own sentence, which already names what to
 *                      ask for, and offers no button that would change nothing.
 */
export type ConnectorRefusalDisposition =
  | "reconnect"
  | "self_healing"
  | "ours"
  | "retry"
  | "share_required";

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
  // Neither `reconnect` (the credential and scopes are already fine — a fresh
  // approval asks Google for nothing new) nor `retry` (the refusal will not
  // clear on its own; it is Google's PERMISSION_DENIED on this exact item,
  // every time, until someone else shares it).
  resource_permission_denied: "share_required",
  quota_exhausted: "self_healing",
  provider_unavailable: "self_healing",
  resource_unavailable: "retry",
  call_failed: "retry",
};

/**
 * 🚨 NULL MEANS "WE CANNOT SAY", AND IT IS A REAL ANSWER (VERIFY-U-P2-R4, V13-4).
 * This took the client's own union and did `REFUSAL_DISPOSITION[code]`, so a code
 * the deployed server has and this build does not returned **`undefined`** while
 * every reader below tested `=== null` — the branch for "unknown, not fine" could
 * never fire. It now takes any string and answers null for anything it does not
 * know, which is what the readers act on.
 */
export function refusalDisposition(
  code: string | null | undefined,
): ConnectorRefusalDisposition | null {
  if (!isConnectorRefusalCode(code)) return null;
  return REFUSAL_DISPOSITION[code];
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
   * When this product's grant was last (re-)approved. NEVER a substitute for
   * `lastSuccessAt`: a grant is not a call, so a row with a grant and no
   * success says "connected, no calls yet" — never "last successful use".
   */
  lastGrantAt: string | null;
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
  /**
   * Whether that one action repairs this PRODUCT or the whole ACCOUNT. Null
   * exactly when `actionLabel` is null. A surface renders one control per
   * account for the account-scoped rows, and never a per-row press that a
   * dead credential would make nine copies of.
   */
  actionScope: ConnectorActionScope | null;
}

/** The verb on a product row's action. Never both, never neither by accident. */
export type ConnectorProductAction = "Connect" | "Reconnect";

/**
 * WHAT ONE PRESS REPAIRS. `product` is the ordinary case: the request asks for
 * this product's scopes on this account. `account` is a dead credential — the
 * provider will authorize nothing at all, so one approval renews every product
 * the account already holds and a surface offers ONE control for the account
 * rather than the same press once per row (the chair's ruling, 2026-09-17).
 */
export type ConnectorActionScope = "product" | "account";

/**
 * A timestamp, or null when the string is not one. Used on BOTH halves of the
 * recorded activity: `NaN` comparisons are silently false, so an unreadable
 * success timestamp used to make every refusal stop standing (N14).
 */
function parsableTimestamp(value: string | null): string | null {
  if (!value) return null;
  return Number.isNaN(Date.parse(value)) ? null : value;
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
  // A timestamp that does not parse is not a timestamp (N14): a success nobody
  // can date must not silence a refusal, whatever an adapter handed over.
  const lastSuccessAt = parsableTimestamp(recorded?.lastSuccessAt ?? null);
  const lastGrantAt = parsableTimestamp(recorded?.lastGrantAt ?? null);
  const lastRefusal: ConnectorRefusalFact | null = recorded?.lastRefusal
    ? {
        message: recorded.lastRefusal.message,
        at: parsableTimestamp(recorded.lastRefusal.at ?? null),
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
      (recorded?.refusalStands ??
        (!lastSuccessAt ||
          !lastRefusal.at ||
          Date.parse(lastRefusal.at) > Date.parse(lastSuccessAt))),
  );
  const standingRefusal = refusalStands ? lastRefusal : null;
  const refusalNeedsReconnect =
    standingRefusal?.disposition === "reconnect";
  /**
   * The provider will authorize nothing for this account, and this product's
   * grant is part of what died with the credential. One fresh approval renews
   * it — and every other product this account holds, which is why the scope of
   * the action is the ACCOUNT (N2).
   */
  const credentialIsDead = Boolean(account && !account.usable && held);
  /**
   * The extra line for a refusal that leaves the row WORKING — a quota or an
   * outage that clears by itself, or one call that failed. `disposition === null`
   * used to live here too, which is how an unrecognised code became a note under
   * a green "Connected" badge (V13-4). It is not a note any more: it is a
   * refusal we cannot classify, and it owns the row below.
   */
  const activityNote =
    standingRefusal &&
    (standingRefusal.disposition === "self_healing" ||
      standingRefusal.disposition === "retry")
      ? standingRefusal.message
      : null;

  /**
   * THE ONE ACTION, DECIDED ONCE — verb and scope together, because they answer
   * the same question: what would one press ask the provider for?
   *   • a scope is missing → this product's own Connect (never granted) or
   *     Reconnect (partly granted);
   *   • nothing missing, but the provider's last word is a refusal only a fresh
   *     grant can clear → renew this product;
   *   • the credential itself is dead → renew the ACCOUNT, which is every
   *     product it holds, in one approval.
   */
  const action: {
    label: ConnectorProductAction;
    scope: ConnectorActionScope;
  } | null =
    missingScopes.length > 0
      ? {
          label: held ? "Reconnect" : "Connect",
          scope: credentialIsDead ? "account" : "product",
        }
      : credentialIsDead
        ? { label: "Reconnect", scope: "account" }
        : refusalNeedsReconnect
          ? { label: "Reconnect", scope: "product" }
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
    lastGrantAt,
    lastRefusal,
    activityNote,
    // D3: the verb is the truth about this account, not about the button.
    // Nothing to ask for, or nothing the person may ask for → no action at all.
    actionLabel: part.togglable ? (action?.label ?? null) : null,
    actionScope: part.togglable ? (action?.scope ?? null) : null,
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
  // recorded fact is a refusal the person must act on, one that is ours to
  // repair, or one only another Google identity can clear by sharing the item,
  // is not "Connected" (D2 + "connected is never a boolean that lies"). Every
  // disposition that is not self-healing lands here — census it by name so a
  // new disposition can never fall through to "Connected" by omission.
  if (
    standingRefusal &&
    (standingRefusal.disposition === "reconnect" ||
      standingRefusal.disposition === "ours" ||
      standingRefusal.disposition === "share_required" ||
      // 🚨 A CODE WE CANNOT CLASSIFY IS NOT A GREEN BADGE (V13-4). The deployed
      // server may classify a refusal with a code this build has never heard of
      // — the two halves ship independently — and the honest reading of "the
      // provider refused and we cannot say what it means" is the provider's own
      // sentence with no press, never "Connected".
      standingRefusal.disposition === null)
  ) {
    return row({
      state: "refused",
      label: "Not working",
      // The server's sentence, verbatim: it was written for this person, and
      // for `share_required` it already names exactly what to ask for — a
      // second, client-written remedy would only repeat it.
      reason: standingRefusal.message,
      remedy:
        standingRefusal.disposition === "reconnect"
          ? `Reconnect ${account.label} and approve ${product.name} — nothing you already granted is asked for again.`
          : standingRefusal.disposition === null
            ? // Generic on purpose: promising that a reconnect, a wait or a
              // share would clear it would be a guess about a refusal we have
              // not classified.
              `Try ${product.name} again in a few minutes. If it keeps refusing, tell us and we will look at it — we have what the provider sent.`
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
 * DOES THIS PRODUCT'S GRANT NEED RENEWING, with no scope missing? Exactly the
 * `refused` rows whose disposition is `reconnect`: the account holds every
 * scope, the provider's own last word is a refusal, and only a fresh grant can
 * clear it. Derived from the account's recorded health, never from a caller's
 * hint — `buildConsentPlan` reads it for every consent surface, so a dialog and
 * a settings row cannot answer the same account differently (the 2026-09-17
 * divergence: the dialog planned without it and told the person everything was
 * already connected while the provider window never opened).
 *
 * A refusal that is OURS to repair (`platform_configuration`) or that clears by
 * itself is deliberately NOT a renewal: re-approving the same scopes would not
 * help, and offering it would be the dead control this primitive exists to end.
 *
 * A DEAD CREDENTIAL IS ALSO A RENEWAL, of every product the account holds: the
 * grant is intact and the thing that authorizes it is gone, so `actionLabel`
 * says Reconnect and this answers true without the caller knowing why (N2).
 */
export function grantNeedsRenewal({
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
  activity?: ConnectorActivityByProduct;
}): boolean {
  if (!account) return false;
  const row = productHealth({ provider, product, account, rollout, activity });
  return row.missingScopes.length === 0 && row.actionLabel === "Reconnect";
}

/**
 * EVERY PRODUCT ONE ACCOUNT-LEVEL PRESS MUST CARRY. Exactly the rows whose
 * action is scoped to the account — a dead credential, where one approval renews
 * the whole account and asking per product would be nine windows for one repair.
 * The consent surfaces build their plan from this, so the "one Reconnect on the
 * account" a person presses is the same request the dialog's default press makes
 * (VERIFY-U-P2-R2, N2).
 */
export function accountRenewalProductKeys({
  provider,
  account,
  rollout,
  activity,
}: {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount | null;
  rollout: readonly ConnectorCapabilityRollout[];
  activity?: ConnectorActivityByProduct;
}): string[] {
  return accountHealth({ provider, account, rollout, activity })
    .filter((row) => row.actionLabel !== null && row.actionScope === "account")
    .map((row) => row.product.key);
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
