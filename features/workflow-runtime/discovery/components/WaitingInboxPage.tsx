"use client";

/**
 * The `(core)` body behind `/workflows/waiting` — the "waiting on you" inbox.
 *
 * Route conformance: chrome in `RouteHeader`, body `h-full overflow-hidden`
 * with ONE inner scroll area, content flowing behind the glass header.
 */

import { Inbox, ListOrdered } from "lucide-react";

import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { TapTargetButton } from "@/components/icons/TapTargetButton";

import { WaitingInbox } from "./WaitingInbox";

export function WaitingInboxPage() {
  return (
    <>
      <RouteHeader
        left={
          <div className="flex min-w-0 items-center">
            <ChevronLeftTapButton href="/workflows/all" ariaLabel="Back to workflows" />
            <Inbox className="ml-1 h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="ml-1.5 min-w-0 truncate text-sm font-medium text-foreground">
              Waiting on you
            </span>
          </div>
        }
        right={
          <TapTargetButton
            href="/workflows/runs"
            ariaLabel="All runs"
            icon={<ListOrdered className="h-4 w-4" />}
          />
        }
      />
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
          <div className="mx-auto max-w-3xl">
            <WaitingInbox />
          </div>
        </div>
      </div>
    </>
  );
}
