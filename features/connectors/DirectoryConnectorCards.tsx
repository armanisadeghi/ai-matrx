"use client";

/**
 * DirectoryConnectorCards — the first-party Google connectors on the
 * Integrations directory (/user-settings/integrations).
 *
 * The MCP catalog grid on that page shows MCP-backed connectors; these cards
 * are the directory presence for the connectors registry's Google entries,
 * which have no MCP server. Status comes from the same Google connection
 * inventory the chat strip uses, through the shared scope mapping in
 * `google-status.ts`.
 *
 * Connect actions stay honest about where each grant actually happens:
 * Docs/Sheets and Gmail open the floating Google connect window (whose OAuth
 * request carries exactly those scopes); Search Console's OAuth lives on
 * /marketing/connections/google, so its card is a door there, never a
 * wrong-scope popup.
 */

import Link from "next/link";
import { Check, ExternalLink, Lock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { connectorsFor } from "./registry";
import {
  googleConnectionFor,
  isGoogleConnectorId,
  type GoogleConnectorId,
} from "./google-status";

const CONNECT_REASON: Record<GoogleConnectorId, string | null> = {
  "google-workspace": "so an agent can work with docs and sheets you choose",
  gmail: "so an agent can draft email you review before it sends",
  "google-search-console": null, // connects on /marketing/connections/google
};

const SEARCH_CONSOLE_CONNECT_HREF = "/marketing/connections/google";

export function DirectoryConnectorCards({ className }: { className?: string }) {
  const inventory = useGoogleConnectionInventory();
  const openGoogleConnect = useOpenGoogleConnectWindow();

  const connectors = connectorsFor("directory").filter((connector) =>
    isGoogleConnectorId(connector.id),
  );
  if (connectors.length === 0) return null;

  const rows = inventory.data?.connections ?? [];

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
        const connected = connection !== undefined;
        const Logo = connector.logo;
        const reason = CONNECT_REASON[id];

        return (
          <Card
            key={connector.id}
            className={cn(
              "transition-all duration-150",
              connected && "ring-1 ring-green-500/30 bg-green-500/[0.02]",
            )}
          >
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="shrink-0 mt-0.5 w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
                  <Logo colored={connected} className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-sm text-foreground truncate">
                    {connector.name}
                  </h3>
                  <p className="text-xs text-muted-foreground truncate">
                    {connected
                      ? (connection.account_email ?? "Connected")
                      : "Google"}
                  </p>
                </div>
                <div className="shrink-0">
                  {connected ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 gap-1 bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/20"
                    >
                      <Check className="h-3 w-3" />
                      Connected
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
                      className="h-7 text-xs flex-1"
                      asChild
                    >
                      <Link href={connector.manageHref}>
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Manage
                      </Link>
                    </Button>
                  ) : null
                ) : reason !== null ? (
                  <Button
                    size="sm"
                    className="h-7 text-xs flex-1"
                    onClick={() => openGoogleConnect({ reason })}
                  >
                    <Lock className="h-3 w-3 mr-1" />
                    Connect
                  </Button>
                ) : (
                  <Button size="sm" className="h-7 text-xs flex-1" asChild>
                    <Link href={SEARCH_CONSOLE_CONNECT_HREF}>
                      <Lock className="h-3 w-3 mr-1" />
                      Connect
                    </Link>
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
