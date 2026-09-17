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
//   • when the ACCOUNT was last confirmed, and its last refusal verbatim,
//     labelled as account-level because that is what the server records.

import {
  AlertTriangle,
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
  not_connected: { chip: "bg-muted text-muted-foreground", icon: null },
  refused: { chip: "bg-warning/15 text-warning", icon: AlertTriangle },
  pending_rollout: { chip: "bg-muted text-muted-foreground", icon: Clock },
};

export interface ConnectedAccountHealthProps {
  provider: ConnectorProviderConfig;
  account: ConnectorAccount;
  health: readonly ConnectorProductHealth[];
  /** Name of the organization this account belongs to, when it belongs to one. */
  organizationName?: string | null;
  /** Ask the provider for ONLY the missing scopes of one product. */
  onReconnect: (productKey: string) => void;
  /** Remove the account. The caller states the consequence before it runs. */
  onRevoke: () => void;
  busyProductKey?: string | null;
  revoking?: boolean;
  className?: string;
}

export function ConnectedAccountHealth({
  provider,
  account,
  health,
  organizationName,
  onReconnect,
  onRevoke,
  busyProductKey,
  revoking = false,
  className,
}: ConnectedAccountHealthProps) {
  const connector = getConnector(provider.markConnectorId);
  const lastChecked = relativeTime(account.lastVerifiedAt);
  const live = health.filter((row) => row.state === "connected").length;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card",
        className,
      )}
    >
        <div className="flex flex-wrap items-start gap-3 border-b border-border/60 p-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            {connector ? (
              <ConnectorMark connector={connector} className="h-5 w-5" />
            ) : null}
          </span>
          <div className="min-w-0 flex-1">
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
            <p className="mt-0.5 text-xs text-muted-foreground">
              {live} of {health.length} products in use
              {lastChecked ? ` · account last confirmed ${lastChecked}` : ""}
            </p>
            {!account.usable ? (
              <p className="mt-1 text-xs text-destructive">
                {account.statusReason}
                {account.statusRemedy ? ` ${account.statusRemedy}` : ""}
              </p>
            ) : null}
            <p
              className={cn(
                "mt-1 text-xs",
                account.lastError ? "text-warning" : "text-muted-foreground",
              )}
            >
              {account.lastError
                ? `Last refusal recorded on this account: ${account.lastError}`
                : `No refusal recorded on this account.`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRevoke}
            disabled={revoking}
            className="h-11 shrink-0 text-sm text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-8 sm:text-xs"
          >
            {revoking ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
            )}
            Disconnect
          </Button>
        </div>

      <ul>
        {health.map((row) => {
          const style = STATE_STYLE[row.state];
          const StateIcon = style.icon;
          const Icon = row.product.icon;
          const busy = busyProductKey === row.product.key;
          const ActionIcon = row.actionLabel === "Connect" ? Plug : RefreshCw;
          return (
            <li
              key={row.product.key}
              className="border-b border-border/50 last:border-b-0"
            >
              <div className="flex flex-wrap items-start gap-2.5 px-3 py-2.5">
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70"
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
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
                  {row.actionLabel ? (
                    <p className="text-[11px] text-muted-foreground">
                      {row.missingScopes.length > 0 ? (
                        <>
                          {row.actionLabel} asks {provider.name} for only what is
                          missing: {row.missingScopes.length} permission
                          {row.missingScopes.length === 1 ? "" : "s"}. Everything
                          you already granted, and every file you picked, stays.
                        </>
                      ) : (
                        <>
                          {row.actionLabel} asks {provider.name} to renew this
                          account&apos;s permission for {row.product.name}. No
                          new permission is requested, and everything you already
                          granted — every file you picked included — stays.
                        </>
                      )}
                    </p>
                  ) : null}
                </div>

                {row.actionLabel ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReconnect(row.product.key)}
                    disabled={busy}
                    className="h-11 shrink-0 text-sm sm:h-7 sm:text-xs"
                  >
                    {busy ? (
                      <Loader2
                        className="mr-1 h-3 w-3 animate-spin"
                        aria-hidden
                      />
                    ) : (
                      <ActionIcon className="mr-1 h-3 w-3" aria-hidden />
                    )}
                    {row.actionLabel}
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
