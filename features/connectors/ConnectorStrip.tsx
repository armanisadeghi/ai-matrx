"use client";

// features/connectors/ConnectorStrip.tsx
//
// The one-line reminder that sits UNDER the agent input: "these are the tools
// you could connect". It is presentational and props-driven — it renders status
// it is GIVEN and raises `onConnect(providerId)`. It never talks to Google,
// Notion, Supabase, or an OAuth window; the host owns that.
//
// Design rules it must keep:
//  - One line. It sits under a chat input and must never compete with it.
//  - Color means connected. An unconnected mark is monochrome and muted.
//  - It stops nagging: once everything is connected it collapses to a single
//    near-invisible door (or disappears entirely with `hideWhenAllConnected`).

import Link from "next/link";
import { Check } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { announceComingSoon } from "@/lib/coming-soon/announce";
import { cn } from "@/lib/utils";
import { connectorsFor } from "./registry";
import type {
  ConnectorDefinition,
  ConnectorId,
  ConnectorStatus,
  ConnectorStatusSource,
} from "./types";

export interface ConnectorStripProps extends ConnectorStatusSource {
  /** The connect intent. The strip raises it; the host opens the panel/OAuth. */
  onConnect: (providerId: ConnectorId) => void;
  /** Defaults to the catalogue's `strip` connectors. Pass to scope a surface. */
  connectors?: ConnectorDefinition[];
  /** `compact` drops the names and renders marks only. */
  variant?: "default" | "compact";
  /** Return nothing at all once every connector is connected. */
  hideWhenAllConnected?: boolean;
  /** Where the collapsed "all connected" summary goes. */
  directoryHref?: string;
  className?: string;
}

function statusOf(
  connector: ConnectorDefinition,
  { connectedIds, resolveStatus }: ConnectorStatusSource,
  connectedSet: Set<ConnectorId>,
): ConnectorStatus {
  if (resolveStatus) return resolveStatus(connector);
  if (connector.comingSoonId) return "unavailable";
  return connectedSet.has(connector.id) ? "connected" : "not_connected";
}

const CHIP_BASE =
  // `before:` expands the touch target on mobile without adding a pixel of height.
  "group relative inline-flex h-6 shrink-0 items-center rounded-full border text-[11px] font-medium leading-none transition-colors " +
  "before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] sm:before:hidden " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-0";

export function ConnectorStrip({
  onConnect,
  connectors,
  variant = "default",
  hideWhenAllConnected = false,
  directoryHref = "/user-settings/integrations",
  className,
  connectedIds,
  resolveStatus,
}: ConnectorStripProps) {
  const catalogue = connectors ?? connectorsFor("strip");
  const connectedSet = new Set<ConnectorId>(connectedIds ?? []);
  const rows = catalogue.map((connector) => ({
    connector,
    status: statusOf(connector, { connectedIds, resolveStatus }, connectedSet),
  }));

  const outstanding = rows.filter((row) => row.status !== "connected");
  const connectedCount = rows.length - outstanding.length;
  const compact = variant === "compact";

  if (rows.length === 0) return null;

  // Everything connected — never nag. Collapse to one muted door, or nothing.
  if (outstanding.length === 0) {
    if (hideWhenAllConnected) return null;
    return (
      <div className={cn("flex h-6 items-center", className)}>
        <Link
          href={directoryHref}
          className="inline-flex items-center gap-1.5 rounded-full px-1 text-[11px] leading-none text-muted-foreground/60 transition-colors hover:text-foreground"
        >
          <Check className="h-3 w-3 text-success/80" aria-hidden />
          <span>
            {connectedCount} {connectedCount === 1 ? "tool" : "tools"} connected
          </span>
        </Link>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={250}>
      <div
        className={cn(
          "flex h-6 w-full items-center gap-1.5 overflow-x-auto scrollbar-hide",
          className,
        )}
      >
        {rows.map(({ connector, status }) => {
          const Logo = connector.logo;
          const connected = status === "connected";
          const unavailable = status === "unavailable";

          const mark = (
            <Logo
              colored={connected}
              className={cn(
                "h-3.5 w-3.5",
                connected
                  ? undefined
                  : "text-muted-foreground/70 transition-colors group-hover:text-foreground",
              )}
            />
          );

          const body = compact ? (
            mark
          ) : (
            <>
              {mark}
              <span className="max-w-[10rem] truncate">{connector.name}</span>
              {connected && (
                <Check className="h-2.5 w-2.5 text-success/80" aria-hidden />
              )}
              {unavailable && (
                <span className="text-[10px] font-normal text-muted-foreground/60">
                  soon
                </span>
              )}
            </>
          );

          const chipClass = cn(
            CHIP_BASE,
            compact ? "w-6 justify-center px-0" : "gap-1.5 pl-1.5 pr-2",
            connected
              ? "border-border/50 bg-card/50 text-foreground/80 hover:border-border hover:bg-accent"
              : "border-border/60 bg-card/60 text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
            unavailable && "border-dashed opacity-70 hover:opacity-100",
          );

          const label = connected
            ? `${connector.name} — connected. ${connector.blurb}`
            : unavailable
              ? `${connector.name} — coming soon. ${connector.blurb}`
              : `Connect ${connector.name} — ${connector.blurb}`;

          // Connected + a management surface: the chip is a real door.
          const chip =
            connected && connector.manageHref ? (
              <Link
                href={connector.manageHref}
                className={chipClass}
                aria-label={label}
              >
                {body}
              </Link>
            ) : (
              <button
                type="button"
                className={chipClass}
                aria-label={label}
                onClick={() => {
                  if (connector.comingSoonId) {
                    void announceComingSoon(connector.comingSoonId);
                    return;
                  }
                  if (connected) return;
                  onConnect(connector.id);
                }}
                disabled={connected && !connector.manageHref}
              >
                {body}
              </button>
            );

          return (
            <Tooltip key={connector.id}>
              <TooltipTrigger asChild>{chip}</TooltipTrigger>
              <TooltipContent side="top" className="max-w-[15rem]">
                <span className="font-medium">{connector.name}</span>
                <span className="ml-1 text-muted-foreground">
                  {connector.blurb}
                </span>
                {connected && (
                  <span className="ml-1 text-success">· connected</span>
                )}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
