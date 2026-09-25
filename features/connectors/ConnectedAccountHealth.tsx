"use client";

// features/connectors/ConnectedAccountHealth.tsx
//
// THE PER-CAPABILITY HEALTH ROWS — the thing none of the fifteen surveyed
// connector products ships (PLAN §1, last row; §5.3). Presentational: it renders
// the derivation in `health.ts` and raises intents. No provider is named here.
//
// What each row states, and why:
//   • the granted permissions in PLAIN WORDS, with the provider's own scope
//     string behind the SAME disclosure the consent dialog now uses
//     (`ProductPermissions.tsx` — one component, two mounts);
//   • the rollout state as a SENTENCE; capability keys never render (D6);
//   • this product's last successful call and last refusal, or, while the
//     server records neither, a line saying exactly that (D2);
//   • the scopes that are MISSING, and one action that asks for only those —
//     "Connect" when this account never granted the product, "Reconnect" only
//     when a grant exists and is incomplete (D3);
//   • when the ACCOUNT's credential itself is dead, ONE Reconnect for the whole
//     account instead of the same press repeated on every row, because one
//     approval renews every product it holds (`actionScope`, VERIFY-U-P2-R2 N2:
//     nine rows used to say "Reconnect <account>." beside no control at all);
//   • when the ACCOUNT was last confirmed, and the account-level refusal AS A
//     SENTENCE the adapter translated — never the server's own words, which are
//     written for an operator and carried a vault item name, a connection UUID
//     and a Python exception class onto this card eleven times (VERIFY-U-P2-R3,
//     N9); and it is stated once, not repeated when it is already the account's
//     status sentence.

import {
  AlertTriangle,
  Ban,
  Building2,
  Check,
  Clock,
  Loader2,
  Plug,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ConnectorMark } from "./ConnectorMark";
import { getConnector } from "./registry";
import type { ConnectorProviderConfig } from "./provider-config";
import type {
  ConnectorAccount,
  ConnectorProductHealth,
} from "./health";
import { ProductPermissionsDisclosure, relativeTime } from "./ProductPermissions";
import type { SharedConnectorManagement } from "./shared-account-level";

const STATE_STYLE: Record<
  ConnectorProductHealth["state"],
  { chip: string; icon: typeof Check | null }
> = {
  connected: { chip: "bg-success/15 text-success", icon: Check },
  scope_missing: { chip: "bg-warning/15 text-warning", icon: AlertTriangle },
  account_unusable: {
    chip: "bg-destructive/15 text-destructive",
    icon: AlertTriangle,
  },
  // Blocked with nothing to press — it wears the destructive chip so it is never
  // mistaken for a row that is working (V17-1).
  unavailable: {
    chip: "bg-destructive/15 text-destructive",
    icon: Ban,
  },
  not_connected: { chip: "bg-muted text-muted-foreground", icon: null },
  refused: { chip: "bg-warning/15 text-warning", icon: AlertTriangle },
  pending_rollout: { chip: "bg-muted text-muted-foreground", icon: Clock },
};

/**
 * WHICH PRESS IS RUNNING, and on WHICH account. A bare product key was the
 * defect (VERIFY-U-P2-R2, N6): `ConnectorsSettingsPanel` held one string and
 * gave it to every account, so a press on one account spun the same product's
 * control on all the others while nothing was happening to them. The account id
 * is part of the value, and the card compares it to its OWN account — a caller
 * cannot express "busy everywhere" any more. `productKey: null` is the
 * account-level press.
 */
export interface ConnectorBusyAction {
  accountId: string;
  productKey: string | null;
}

/** One in-flight press, as a key a set can hold. */
export function busyActionKey(action: ConnectorBusyAction): string {
  return `${action.accountId}:${action.productKey ?? ""}`;
}

/** Is THIS press one of the ones running right now? */
export function isBusy(
  running: readonly ConnectorBusyAction[] | null | undefined,
  action: ConnectorBusyAction,
): boolean {
  const key = busyActionKey(action);
  return (running ?? []).some((entry) => busyActionKey(entry) === key);
}

export interface ConnectedAccountHealthProps {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount;
  health: readonly ConnectorProductHealth[];
  /** Name of the organization this account belongs to, when it belongs to one. */
  organizationName?: string | null;
  /** Ask the provider for ONLY the missing scopes of one product. */
  onReconnect: (productKey: string) => void;
  /**
   * Renew the whole account in one approval — every product it holds. Offered
   * only when the credential itself is dead, where a per-product press would be
   * nine windows for one repair.
   */
  onReconnectAccount: () => void;
  /** Remove the account. The caller states the consequence before it runs. */
  onRevoke: () => void;
  /**
   * EVERY press running right now, anywhere in the panel. A set, not one slot:
   * with one provider window open on account one, a press on account two used to
   * move the single marker and then clear it in its own `finally`, so account
   * one's control stopped spinning while its window was still open
   * (VERIFY-U-P2-R3, N17).
   */
  busy?: readonly ConnectorBusyAction[] | null;
  revoking?: boolean;
  /**
   * 🚨 WHETHER THIS PERSON MAY TOUCH THE CREDENTIAL — the runtime answer of
   * `connectors / shared_account.member_default_level`, resolved by
   * `shared-account-level.ts`. Before it, every member of an organization was
   * offered Disconnect on the organization's shared account. REQUIRED, and
   * never defaulted here: a default in this component would be the code
   * fallback the knob system exists to end.
   */
  management: SharedConnectorManagement;
  className?: string;
  anchorId?: string;
}

export function ConnectedAccountHealth({
  provider,
  account,
  health,
  organizationName,
  onReconnect,
  onReconnectAccount,
  onRevoke,
  busy = [],
  revoking = false,
  management,
  className,
  anchorId,
}: ConnectedAccountHealthProps) {
  const connector = getConnector(provider.markConnectorId);
  const lastChecked = relativeTime(account.lastVerifiedAt);
  const live = health.filter((row) => row.state === "connected").length;
  /** Rows one account-level approval repairs — see `actionScope` in health.ts. */
  const accountScoped = health.filter(
    (row) => row.actionLabel !== null && row.actionScope === "account",
  );
  const accountBusy = isBusy(busy, { accountId: account.id, productKey: null });

  return (
    <div
      id={anchorId}
      className={cn(
        "scroll-mt-20 overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
        <div className="flex flex-wrap items-start gap-2 border-b border-border/60 p-2.5 sm:gap-3 sm:p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            {connector ? (
              <ConnectorMark connector={connector} className="h-5 w-5" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1 basis-[calc(100%-3.25rem)] sm:basis-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-semibold text-foreground">
                {account.label}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                {account.ownerKind === "organization" ? (
                  <>
                    <Building2 className="h-2.5 w-2.5" aria-hidden />
                    for {organizationName ?? "your organization"}
                  </>
                ) : (
                  <>
                    <User className="h-2.5 w-2.5" aria-hidden />
                    Personal
                  </>
                )}
              </span>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-1.5 text-[10px] font-medium",
                  account.usable
                    ? "bg-success/15 text-success"
                    : "bg-destructive/15 text-destructive",
                )}
              >
                {account.statusLabel}
              </span>
            </div>
            {/* 🚨 A BLOCKED ACCOUNT NEVER COUNTS PRODUCTS "IN USE" (V17-1). The
                card printed "9 of 9 products in use" one line above its own
                sentence saying no Google account could be used, because the
                status word could not express "blocked". Nothing here is in use,
                and the line says what is true instead of arithmetic that reads
                like health. */}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {account.blocked
                ? `None of these ${health.length} products can be used right now`
                : `${live} of ${health.length} products in use`}
              {lastChecked ? ` · account last confirmed ${lastChecked}` : ""}
            </p>
            {!account.usable ? (
              <p className="mt-1 text-xs text-destructive">
                {account.statusReason}
                {account.statusRemedy ? ` ${account.statusRemedy}` : ""}
              </p>
            ) : null}
            {/* A discovery outage is NOT a broken credential (N15): the account
                stays usable, no product is flagged, and there is no Reconnect
                here — the server's own sentence already says to try again. */}
            {account.usable && account.discoveryOutageSentence ? (
              <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Clock className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                {account.discoveryOutageSentence}
              </p>
            ) : null}
            {/* THE ONE REPAIR FOR A DEAD CREDENTIAL, beside the sentence that
                asks for it. It states what one approval covers before it is
                pressed (destructive-and-expensive-actions.md: an expensive
                click names its consequence), and it is the only Reconnect on
                this card — the rows it covers show no press of their own. */}
            {management.allowed && accountScoped.length > 0 ? (
              <div className="mt-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReconnectAccount}
                  disabled={accountBusy}
                  className="h-11 text-sm sm:h-7 sm:text-xs"
                >
                  {accountBusy ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
                  )}
                  Reconnect
                </Button>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  One approval renews {provider.name}&apos;s permission for the{" "}
                  {accountScoped.length} product
                  {accountScoped.length === 1 ? "" : "s"} this account already
                  has. No new permission is requested, and everything you picked
                  stays.
                </p>
              </div>
            ) : null}
            {/* 🚨 ABSENT OR HONEST, never dead (law 4). When the organization's
                member level does not reach "admin" — or has not answered yet —
                Reconnect and Disconnect are not rendered at all, and this line
                says why instead of leaving a card whose controls silently
                vanished. */}
            {management.allowed ? null : (
              <p className="mt-1.5 text-xs text-muted-foreground">
                {management.sentence}
              </p>
            )}
            {/* The account-level refusal, in the words the adapter translated it
                into — and only when it adds something the status sentence above
                has not already said, so one fact is stated once. */}
            {account.lastRefusalSentence &&
            account.lastRefusalSentence !== account.statusReason ? (
              <p className="mt-1 text-xs text-warning">
                Last refusal recorded on this account:{" "}
                {account.lastRefusalSentence}
              </p>
            ) : account.lastRefusalSentence ? null : (
              <p className="mt-1 text-xs text-muted-foreground">
                No refusal recorded on this account.
              </p>
            )}
          </div>
          {management.allowed ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onRevoke}
            disabled={revoking}
            className="ml-auto h-11 shrink-0 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive sm:ml-0 sm:h-8 sm:text-xs"
          >
            {revoking ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
            )}
            Disconnect
          </Button>
          ) : null}
        </div>

      <ul>
        {health.map((row) => {
          const style = STATE_STYLE[row.state];
          const StateIcon = style.icon;
          const Icon = row.product.icon;
          const rowBusy = isBusy(busy, {
            accountId: account.id,
            productKey: row.product.key,
          });
          // A dead credential is repaired once, on the account above: repeating
          // the same press on every row would be nine windows for one repair.
          // Re-authorizing one product re-authorizes the shared CREDENTIAL, so
          // it is the same permission as the account-level repair below it.
          const productAction =
            management.allowed && row.actionScope === "product"
              ? row.actionLabel
              : null;
          const ActionIcon = productAction === "Connect" ? Plug : RefreshCw;
          return (
            <li
              key={row.product.key}
              className="border-b border-border/50 last:border-b-0"
            >
              <div className="flex flex-wrap items-start gap-2 px-2.5 py-2.5 sm:gap-2.5 sm:px-3">
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70"
                  aria-hidden
                />
                <div className="min-w-0 flex-1 basis-[calc(100%-1.5rem)] sm:basis-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      {row.product.name}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 rounded-full px-1.5 text-[10px] font-medium",
                        style.chip,
                      )}
                    >
                      {StateIcon ? (
                        <StateIcon className="h-2.5 w-2.5" aria-hidden />
                      ) : null}
                      {row.label}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                    {row.reason}
                  </p>
                  {row.remedy ? (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.remedy}
                    </p>
                  ) : null}
                  {/* A refusal that clears by itself gets its sentence and NO
                      button — pressing something that cannot help is worse than
                      waiting, and the row must not pretend to be broken. */}
                  {row.activityNote ? (
                    <p className="mt-0.5 text-xs text-warning">
                      {row.activityNote}
                    </p>
                  ) : null}

                  <ProductPermissionsDisclosure
                    providerName={provider.name}
                    health={row}
                  />

                  {/* The action's promise is VISIBLE text, not a tooltip: on a
                      phone a hover-only explanation is no explanation. */}
                  {productAction ? (
                    <p className="text-[11px] text-muted-foreground">
                      {row.missingScopes.length > 0 ? (
                        <>
                          {productAction} asks {provider.name} for only what is
                          missing: {row.missingScopes.length} permission
                          {row.missingScopes.length === 1 ? "" : "s"}. Everything
                          you already granted, and every file you picked, stays.
                        </>
                      ) : (
                        <>
                          {productAction} asks {provider.name} to renew this
                          account&apos;s permission for {row.product.name}. No
                          new permission is requested, and everything you already
                          granted — every file you picked included — stays.
                        </>
                      )}
                    </p>
                  ) : null}
                </div>

                {productAction ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReconnect(row.product.key)}
                    disabled={rowBusy}
                    className="ml-6 h-11 shrink-0 text-sm sm:ml-0 sm:h-7 sm:text-xs"
                  >
                    {rowBusy ? (
                      <Loader2
                        className="mr-1 h-3 w-3 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <ActionIcon className="mr-1 h-3 w-3" aria-hidden />
                    )}
                    {productAction}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
