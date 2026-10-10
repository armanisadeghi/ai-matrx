"use client";

/**
 * The ONE connect control on the Accounts tab: a menu listing every network with where it stands
 * (Connect / Connected / Coming soon), plus "Manage connections" for the full hub.
 * Per-row connection state lives in the table's Connection column; this only starts a connection.
 * Nothing here claims a network is unavailable before its configuration has loaded.
 */

import { Link2 } from "lucide-react";

import { Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectResolvedBaseUrl } from "@/lib/redux/slices/apiConfigSlice";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { toast } from "@/lib/toast";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { socialAuthorizeUrl } from "@/features/social-connections/customer-service";
import { startTikTokAuthorization } from "@/features/tiktok-connections/service";

import { CONNECT_MENU_STATUS, type PlatformConnection } from "../connection-state";
import { useConnectionStates } from "../useConnectionStates";
import { PlatformMark, platformLabel } from "./PlatformMark";

/** The networks a brand can connect, in the order the menu lists them. */
const CONNECT_NETWORKS = ["facebook", "instagram", "threads", "linkedin", "pinterest", "x", "youtube", "tiktok"] as const;

/** Starts (or reconnects) one network's connection: the same door for the menu and a table row's Connect. */
export function useStartConnection(organizationId: string, brandSeg: string, onManage: () => void) {
  const userId = useAppSelector(selectUserId);
  const backendOrigin = useAppSelector(selectResolvedBaseUrl);
  const openGoogleConnect = useOpenGoogleConnectWindow();
  const returnUrl = `/marketing/${brandSeg}/socials/accounts`;

  return async function start(c: PlatformConnection) {
    if (c.state === "connected") {
      onManage();
      return;
    }
    try {
      if (c.hubProvider) {
        window.location.assign(
          socialAuthorizeUrl(c.hubProvider, organizationId, undefined, undefined, c.connectionId ?? undefined, returnUrl),
        );
      } else if (c.platform === "youtube") {
        openGoogleConnect({ reason: "to read your YouTube channel" });
      } else if (c.platform === "x") {
        const query = new URLSearchParams({
          organization_id: organizationId,
          backend_origin: backendOrigin ?? "",
          return_url: returnUrl,
        });
        window.location.assign(new URL(`/api/social-oauth/x/start?${query}`, window.location.origin).href);
      } else if (c.platform === "tiktok") {
        if (!userId) throw new Error("Sign in again to connect TikTok.");
        const started = await startTikTokAuthorization(userId, organizationId);
        window.location.assign(started.authorization_url);
      } else {
        onManage();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Couldn't start the ${platformLabel(c.platform)} connection`);
    }
  };
}

export function ConnectAccountMenu({
  organizationId,
  start,
  onManage,
}: {
  organizationId: string;
  start: (c: PlatformConnection) => Promise<void>;
  /** Opens the full connection hub (accounts, permissions, disconnect). */
  onManage: () => void;
}) {
  const connections = useConnectionStates(organizationId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" icon={<Link2 />}>
          Connect an account
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-64">
        {connections.data ? (
          CONNECT_NETWORKS.map((platform) => {
            const c = connections.of(platform);
            if (!c) return null;
            return (
              <DropdownMenuItem
                key={platform}
                disabled={!c.canConnect && c.state !== "connected"}
                onSelect={() => void start(c)}
                className="flex items-center gap-2"
              >
                <PlatformMark platform={platform} size={18} />
                <span className="flex-1">{platformLabel(platform)}</span>
                <span className="text-xs text-muted-foreground">{CONNECT_MENU_STATUS[c.state]}</span>
              </DropdownMenuItem>
            );
          })
        ) : connections.isError ? (
          <div className="px-2 py-1.5 text-sm text-destructive">Couldn&apos;t check your connections</div>
        ) : (
          <div className="w-64 p-1.5">
            <RegionSkeleton shape="rows" count={4} aria-label="Checking your connections" />
          </div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onManage}>Manage connections</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
