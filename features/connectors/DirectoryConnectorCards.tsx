"use client";

/**
 * DirectoryConnectorCards — the first-party Google connectors on the
 * Integrations directory (/user-settings/integrations).
 *
 * The MCP catalog grid on that page shows MCP-backed connectors; these cards
 * are the directory presence for the connectors registry's Google entries,
 * which have no MCP server. Status comes from the same Google connection
 * inventory the chat strip uses, through the shared scope mapping in
 * `google-status.ts` — including the "reconnect" state, where a connection
 * holds the scope but its grant went stale.
 *
 * Connect actions stay honest about where each grant actually happens:
 * Docs/Sheets and Gmail open the floating Google connect window (whose OAuth
 * request carries exactly those scopes); Search Console's OAuth lives on
 * /marketing/connections/google, so its card is a door there, never a
 * wrong-scope popup.
 */

import Link from "next/link";
import { Check, ExternalLink, Lock, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { cn } from "@/lib/utils";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { useSurfaceScopeContribution } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { ConnectorMark } from "./ConnectorMark";
import { connectorsFor } from "./registry";
import {
  googleConnectionFor,
  googleStaleConnectionFor,
  isGoogleConnectorId,
  type GoogleConnectorId,
} from "./google-status";

const CONNECT_REASON: Record<GoogleConnectorId, string | null> = {
  "google-workspace": "so an agent can work with docs and sheets you choose",
  gmail: "so an agent can draft email you review before it sends",
  "google-search-console": null, // connects on /marketing/connections/google
};

export function DirectoryConnectorCards({ className }: { className?: string }) {
  const inventory = useGoogleConnectionInventory();
  const openGoogleConnect = useOpenGoogleConnectWindow();

  const connectors = connectorsFor("directory").filter((connector) =>
    isGoogleConnectorId(connector.id),
  );
  const rows = inventory.data?.connections ?? [];

  useSurfaceScopeContribution(
    "matrx-user/settings",
    "google-directory-cards",
    () =>
      inventory.isLoading || inventory.isError
        ? {}
        : {
            google_connections: connectors.map((connector) => {
              const id = connector.id as GoogleConnectorId;
              const connection = googleConnectionFor(id, rows);
              const stale = connection
                ? undefined
                : googleStaleConnectionFor(id, rows);
              return {
                id,
                name: connector.name,
                description: connector.blurb,
                status: connection
                  ? "connected"
                  : stale
                    ? "reconnect"
                    : "not_connected",
                account_email:
                  connection?.account_email ?? stale?.account_email ?? null,
              };
            }),
          },
  );
  if (connectors.length === 0) return null;

  // While the inventory loads, every card would flash "Not Connected" at a
  // user who has already connected — same rule as ChatConnectorStrip: wait.
  if (inventory.isLoading) {
    return (
      <div className={cn("rounded-lg border border-border p-4", className)}>
        <SuspenseLoader
          centered={false}
          size="sm"
          message="Loading Google integrations…"
        />
      </div>
    );
  }

  if (inventory.isError) {
    return (
      <div
        className={cn(
          "rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive",
          className,
        )}
        role="alert"
      >
        Google integration status could not be loaded. Refresh the page to try
        again.
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3",
        className,
      )}
    >
      {connectors.map((connector) => {
        const id = connector.id as GoogleConnectorId;
        const connection = googleConnectionFor(id, rows);
        const stale = connection
          ? undefined
          : googleStaleConnectionFor(id, rows);
        const connected = connection !== undefined;
        const reason = CONNECT_REASON[id];
        const accountEmail =
          connection?.account_email ?? stale?.account_email ?? null;

        const connectHref =
          reason === null ? marketingRoutes.connectionsGoogle() : null;
        const connectLabel = stale ? "Reconnect" : "Connect";
        const ConnectIcon = stale ? RefreshCw : Lock;

        return (
          <Card
            key={connector.id}
            className={cn(
              "transition-all duration-150",
              connected && "ring-1 ring-success/30 bg-success/[0.02]",
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <ConnectorMark connector={connector} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-foreground truncate">
                    {connector.name}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {accountEmail ?? "Google"}
                  </p>
                </div>
                <div className="shrink-0">
                  {connected ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1 bg-success/15 text-success border-success/20"
                    >
                      <Check className="h-3 w-3" />
                      Connected
                    </Badge>
                  ) : stale ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1 bg-warning/15 text-warning border-warning/20"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reconnect
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 bg-muted text-muted-foreground border-border"
                    >
                      Not Connected
                    </Badge>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                {connector.blurb}
              </p>

              <div className="flex items-center gap-2 mt-3">
                {connected ? (
                  connector.manageHref ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
                      asChild
                    >
                      <Link href={connector.manageHref}>
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Manage
                      </Link>
                    </Button>
                  ) : null
                ) : connectHref ? (
                  <Button
                    size="sm"
                    className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
                    asChild
                  >
                    <Link href={connectHref}>
                      <ConnectIcon className="h-3 w-3 mr-1" />
                      {connectLabel}
                    </Link>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-11 flex-1 text-sm sm:h-7 sm:text-xs"
                    onClick={() =>
                      openGoogleConnect({ reason: reason ?? undefined })
                    }
                  >
                    <ConnectIcon className="h-3 w-3 mr-1" />
                    {connectLabel}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
