"use client";

/**
 * THE DETAIL PRIMITIVE'S SOURCE-HEALTH PRODUCER — the host half of PLAN §4's
 * fixed "Google health strip" section and of §5.3's rule: *"A refusal anywhere
 * (expired grant, revoked in Google, quota) writes the row and shows on every
 * dependent record's health strip with the same Reconnect."*
 *
 * WHY THIS FILE EXISTS. `lib/detail` has carried the strip since its first
 * commit and NO record could render it, because the one producer of
 * registrations in app code (`resolveItemDetailType`) never set `health`. Four
 * verification rounds could not answer "does a synced record tell the truth from
 * a live `capability_health` row?" (VERIFY-U-P1-R4). This is that producer, and
 * it lives HERE — in the host's registration source — because `lib/detail` is a
 * package waiting for a `mv` and may never import `features/**`.
 *
 * IT IS NOT A SECOND READER OF `capability_health`. The connectors feature owns
 * that column: `googleAccount` folds the server's per-capability record into
 * per-product activity (`googleActivityByProduct`) and `productHealth` derives
 * the row every connector surface shows. This file calls exactly those and
 * translates ONE product row into the strip's shape — so a record and the
 * connectors screen can never disagree about the same grant.
 *
 * WHAT MAKES A RECORD SYNCED IS THE ROW, NOT A HARD-CODED TYPE LIST. A row that
 * names an external provider (`provider` / `source_provider` / `sync_provider`)
 * and carries an external identity is a mirror of something we do not own. The
 * product behind it is whatever the row says (`provider_product` /
 * `capability_key`), and otherwise the mapping below, so the next synced table
 * inherits the strip without a code change here.
 */

import {
  GOOGLE_PROVIDER,
  googleAccount,
  admissionLanguage,
} from "@/features/connectors/google-adapter";
import {
  preferredAccountId,
  productHealth,
  refusalDisposition,
  type ConnectorCapabilityRollout,
  type ConnectorProductHealth,
} from "@/features/connectors/health";
import {
  listGoogleCapabilities,
  listGoogleConnectionInventory,
} from "@/features/marketing/google/service";
import type {
  DetailHealthContext,
  DetailRow,
  DetailSourceHealth,
} from "@/lib/detail/types";

/** Columns a row names its provider in. */
const PROVIDER_COLUMNS = ["provider", "source_provider", "sync_provider"] as const;
/** Columns a row names the provider product / capability in. */
const PRODUCT_COLUMNS = ["provider_product", "capability_key", "product_key"] as const;
/** Columns that prove the row is a mirror of something we do not own. */
const EXTERNAL_ID_COLUMNS = ["external_id", "external_message_id", "provider_id"] as const;
/**
 * The column a synced row names the connected account it refreshes through.
 *
 * 🚨 IT IS THE LIVE COLUMN NAME, READ HERE ONCE (lane F-51, escalated from U-W2).
 * This list used to read `refreshed_via_account` / `connection_id` / `account_id`
 * — three spellings NO table in `types/database.types.ts` carries. Both synced
 * tables the platform actually has spell it `synced_via_connection_id`
 * (`workbench.google_document`, `communication.calendar_event`), so the producer
 * found nothing, fell back to ranking the accounts, and every registration paid
 * a projection to rename its own column into a name invented here. The producer
 * reads what the tables say; the next synced table inherits the strip by naming
 * its connection the same way `platform.create_entity_table` already does.
 */
const ACCOUNT_COLUMNS = ["synced_via_connection_id"] as const;
/** Columns holding when we last refreshed the row from the source. */
const REFRESHED_COLUMNS = ["last_refreshed_at", "synced_at", "external_modified_at"] as const;
/** Columns holding where the record lives at the provider. */
const SOURCE_URL_COLUMNS = ["web_url", "external_url", "source_url"] as const;

/**
 * Item-presentation type tokens whose spelling differs from the connectors'
 * resource-type names. ONLY the aliases live here; every resource type a product
 * declares attachable arrives from the config below, so the next attachable type
 * cannot be forgotten by the strip.
 */
const PRODUCT_BY_ITEM_TYPE_ALIAS: Readonly<Record<string, string>> = {
  linked_document: "workspace_files",
  linked_spreadsheet: "workspace_files",
  calendar_event: "calendar",
  contact: "contacts",
  email: "gmail",
  gsc_property: "search_console",
  ga4_property: "analytics",
};

/**
 * The product a record type belongs to when its own row does not say. DERIVED
 * from the connectors' own product config — every `attachableResourceTypes`
 * entry of every product maps to that product's key — plus the aliases above.
 *
 * 🚨 IT WAS A HAND-TYPED RECORD (Bugbot round 18 on frontend PR 228; landed in
 * `ec7ce701`, LOST when the chair reverted that commit for its package half, and
 * re-landed here as V17-5). F-38 made a picked Slides deck a first-class resource
 * type (`google_presentation`) under `workspace_files`, and the strip resolved it
 * to NO product — silently, with a console warning nobody reads and the record's
 * own honest-gap sentence ("we cannot tell which connection refreshes it") where
 * the answer was trivially `workspace_files`. The census showed three more
 * declared types in the same state (`search_console_property`,
 * `analytics_property`, `youtube_channel`).
 * `features/item-presentation/__tests__/every-attachable-type-has-a-product.test.ts`
 * walks the config, so a list nobody remembers to extend is no longer possible.
 */
const PRODUCT_BY_ITEM_TYPE: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(
    GOOGLE_PROVIDER.products.flatMap((product) =>
      product.attachableResourceTypes.map(
        (type) => [type, product.key] as const,
      ),
    ),
  ),
  ...PRODUCT_BY_ITEM_TYPE_ALIAS,
});

function stringColumn(row: DetailRow, columns: readonly string[]): string | null {
  for (const column of columns) {
    const value = row[column];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/** The provider this row mirrors, when it mirrors one we have a config for. */
export function syncedProviderOf(row: DetailRow): string | null {
  const named = stringColumn(row, PROVIDER_COLUMNS)?.toLowerCase() ?? null;
  if (!named) return null;
  if (named !== GOOGLE_PROVIDER.id && !named.startsWith(`${GOOGLE_PROVIDER.id}_`)) return null;
  return stringColumn(row, EXTERNAL_ID_COLUMNS) ? GOOGLE_PROVIDER.id : null;
}

/** The connector product this record's freshness depends on, or null. */
export function productKeyFor(type: string, row: DetailRow): string | null {
  return stringColumn(row, PRODUCT_COLUMNS) ?? PRODUCT_BY_ITEM_TYPE[type] ?? null;
}

/**
 * The health producer for a record TYPE. Answers `null` for any row that is not
 * a mirror of a provider we know — which is every platform-owned record, so the
 * strip stays absent there rather than becoming an empty box.
 */
export function sourceHealthProducerFor(
  type: string,
): (row: DetailRow, ctx: DetailHealthContext) => Promise<DetailSourceHealth | null> {
  return async (row, ctx) => {
    if (!syncedProviderOf(row)) return null;
    const productKey = productKeyFor(type, row);
    const product = GOOGLE_PROVIDER.products.find((p) => p.key === productKey) ?? null;
    if (!product) {
      // The row says it is synced and we cannot say which capability keeps it
      // fresh. That is a gap in the registration, not a healthy record, and the
      // person is told the truth in their own words while the console names the
      // remedy for whoever added the type.
      console.warn(
        `[detail] The record type "${type}" carries a provider column but no connector product ` +
          "is mapped for it, so its health strip cannot name the grant it depends on. Remedy: add " +
          "the type to the product's `attachableResourceTypes` in " +
          "features/connectors/provider-config.ts (the map here is derived from it), add it to " +
          "PRODUCT_BY_ITEM_TYPE_ALIAS in features/item-presentation/sourceHealth.ts when its " +
          "spelling differs, or give the row a `provider_product` column.",
      );
      return {
        source: GOOGLE_PROVIDER.name,
        grant: "unknown",
        grantDetail:
          "This record is kept in step with " +
          `${GOOGLE_PROVIDER.name}, but we cannot tell which connection refreshes it, so we cannot ` +
          "say whether that connection is still working.",
        lastRefreshedAt: stringColumn(row, REFRESHED_COLUMNS),
        openAtSourceHref: stringColumn(row, SOURCE_URL_COLUMNS),
      };
    }

    const [inventory, capabilities] = await Promise.all([
      listGoogleConnectionInventory(ctx.signal),
      listGoogleCapabilities(ctx.signal),
    ]);
    if (ctx.signal.aborted) return null;

    const accounts = (inventory?.connections ?? []).map(googleAccount);
    const rollout: ConnectorCapabilityRollout[] = (capabilities ?? []).map((cap) => ({
      capabilityKey: cap.key,
      phase: cap.rollout_phase === "available" ? "available" : "pending",
      eligible: cap.eligible,
      requiredScopes: cap.required_scopes.map((scope) => scope.scope),
      ineligibleReason: cap.eligible ? null : admissionLanguage(cap.admission_error),
    }));
    const wantedAccountId = stringColumn(row, ACCOUNT_COLUMNS);
    const accountId = preferredAccountId({
      provider: GOOGLE_PROVIDER,
      accounts,
      rollout,
      preferAccountId: wantedAccountId,
      // When the row does not name its connection, the account that HOLDS this
      // record's product answers for it — never the account holding the most
      // products, which is how a record claimed its product was not connected
      // while the account beside it served it (lane F-51).
      forProductKey: product.key,
    });
    const account = accounts.find((a) => a.id === accountId) ?? null;

    const health = productHealth({
      provider: GOOGLE_PROVIDER,
      product,
      account,
      rollout,
    });

    return {
      source: `${GOOGLE_PROVIDER.name} ${product.name}`,
      lastRefreshedAt: stringColumn(row, REFRESHED_COLUMNS) ?? health.lastSuccessAt,
      grant: grantStateFor(health),
      grantDetail: [health.reason, health.activityNote].filter(Boolean).join(" "),
      openAtSourceHref: stringColumn(row, SOURCE_URL_COLUMNS),
      // 🚨 §5.3 — the SAME Reconnect the connector rows show, and ONLY when a
      // reconnect is really the repair: a quota or a provider outage clears
      // itself and a platform-configuration fault is ours, so offering the
      // button there would be a control that does nothing (law 4). `undefined`
      // lets the primitive fill in the host's reconnect action.
      onReconnect: reconnectWouldHelp(health) ? undefined : null,
    };
  };
}

/** The strip's grant word for a connector product row. */
function grantStateFor(health: ConnectorProductHealth): DetailSourceHealth["grant"] {
  switch (health.state) {
    case "connected":
      return "ok";
    case "scope_missing":
    case "not_connected":
      return "missing";
    case "account_unusable":
      return "revoked";
    // Blocked by the provider or by our own configuration: the strip states the
    // reason and `reconnectWouldHelp` gives it no press, because none exists
    // (V17-1). `blocked` is the primitive's word for exactly this reading
    // (lib/detail/types.ts, chair 2026-09-18) — "revoked" would tell the
    // person to reconnect something a reconnect cannot repair, and `unknown`
    // (this case's word before `blocked` existed) reads as "we cannot tell"
    // rather than "nothing you do here will help"; `reconnectFor` refuses this
    // grant a press structurally regardless of what any producer supplies.
    case "unavailable":
      return "blocked";
    case "refused": {
      const code = health.lastRefusal?.code ?? null;
      if (code === "grant_expired_or_revoked") return "expired";
      if (code === "scope_missing") return "missing";
      return "unknown";
    }
    case "pending_rollout":
    default:
      return "unknown";
  }
}

/** Whether a fresh grant is what fixes this row — the connectors' own answer. */
function reconnectWouldHelp(health: ConnectorProductHealth): boolean {
  if (health.actionLabel === null) return false;
  const code = health.lastRefusal?.code ?? null;
  if (health.state === "refused" && code) {
    return refusalDisposition(code) === "reconnect";
  }
  return true;
}
