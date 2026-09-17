"use client";

// features/connectors/ConnectedAccountHealth.tsx
//
// THE PER-CAPABILITY HEALTH ROWS — the thing none of the fifteen surveyed
// connector products ships (PLAN §1, last row; §5.3). Presentational: it renders
// the derivation in `health.ts` and raises intents. No provider is named here.
//
// What each row states, and why:
//   • the granted permissions in PLAIN WORDS, with the provider's own scope
//     string behind the same info affordance the dialog uses;
//   • the scopes that are MISSING, and a Reconnect that asks for only those;
//   • the rollout state, from the server catalog;
//   • when the account was last confirmed, and the last refusal verbatim.
//
// 🚨 "Last successful call" is ACCOUNT-level and labelled as such. The server
// records one `last_verified_at` and one `last_error` per connection and no
// per-capability call log (verified live 2026-09-17), so a per-product "last
// used" line would be invented. `health.ts` returns null for it and this
// component prints nothing rather than borrowing the account's timestamp.

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  Check,
  ChevronDown,
  Clock,
  Info,
  Loader2,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ConnectorMark } from "./ConnectorMark";
import { getConnector } from "./registry";
import type { ConnectorProviderConfig } from "./provider-config";
import type {
  ConnectorAccount,
  ConnectorProductHealth,
} from "./health";

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
  pending_rollout: { chip: "bg-muted text-muted-foreground", icon: Clock },
};

function relative(iso: string | null): string | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return null;
  const minutes = Math.round((Date.now() - at) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

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
  const [openProductKey, setOpenProductKey] = useState<string | null>(null);
  const connector = getConnector(provider.markConnectorId);
  const lastChecked = relative(account.lastVerifiedAt);
  const live = health.filter((row) => row.state === "connected").length;

  return (
    <TooltipProvider>
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
            {account.lastError ? (
              <p className="mt-1 text-xs text-warning">
                Last refusal recorded on this account: {account.lastError}
              </p>
            ) : null}
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
            const open = openProductKey === row.product.key;
            const busy = busyProductKey === row.product.key;
            return (
              <li
                key={row.product.key}
                className="border-b border-border/50 last:border-b-0"
              >
                <div className="flex items-start gap-2.5 px-3 py-2.5">
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

                    <button
                      type="button"
                      onClick={() =>
                        setOpenProductKey(open ? null : row.product.key)
                      }
                      aria-expanded={open}
                      className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform",
                          open && "rotate-180",
                        )}
                        aria-hidden
                      />
                      {open ? "Hide permissions" : "What it can do"}
                    </button>

                    {open ? (
                      <ul className="mt-1.5 space-y-1.5 rounded-md bg-muted/40 p-2">
                        {row.scopes.map((fact) => (
                          <li key={fact.scope} className="flex items-start gap-1.5">
                            {fact.granted ? (
                              <Check
                                className="mt-0.5 h-3 w-3 shrink-0 text-success"
                                aria-hidden
                              />
                            ) : (
                              <AlertTriangle
                                className="mt-0.5 h-3 w-3 shrink-0 text-warning"
                                aria-hidden
                              />
                            )}
                            <span className="min-w-0">
                              <span className="block text-xs text-foreground">
                                {fact.language}
                              </span>
                              <span className="block break-all font-mono text-[10px] text-muted-foreground">
                                {fact.scope}
                              </span>
                            </span>
                          </li>
                        ))}
                        {row.rollout.map((entry) => (
                          <li
                            key={entry.capabilityKey}
                            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                          >
                            <Info className="h-3 w-3 shrink-0" aria-hidden />
                            {entry.capabilityKey} ·{" "}
                            {entry.phase === "available"
                              ? "generally available"
                              : "still being certified"}
                            {entry.ineligibleReason
                              ? ` · ${entry.ineligibleReason}`
                              : ""}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>

                  {row.missingScopes.length > 0 && row.togglable ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
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
                            <RefreshCw className="mr-1 h-3 w-3" aria-hidden />
                          )}
                          Reconnect
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[18rem]">
                        <p className="text-xs">
                          Asks {provider.name} for only what is missing:{" "}
                          {row.missingScopes.length} permission
                          {row.missingScopes.length === 1 ? "" : "s"}. Everything
                          you already granted, and every file you picked, stays.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </TooltipProvider>
  );
}
