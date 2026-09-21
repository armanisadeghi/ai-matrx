"use client";

/**
 * StaffHeader — the one row `/staff` puts in the app shell header, through
 * `<PageHeader>`.
 *
 * It says the surface ("Your staff", the frozen product word) and, beside it,
 * WHO is answering — and only when we actually know. Three sources, most
 * authoritative first: the live Redux name for the resolved Holder (which the
 * chat room's own agent fetch fills in), the name the door returned, and the
 * SSR seed the page painted from the mandate's system-rung default. If all
 * three are empty the name slot is EMPTY: `door.py` is explicit that an
 * absent name is honest and a hardcoded "Chief of Staff" would be a lie when
 * an organization has rebound the role.
 *
 * The row's height is fixed so the name arriving after hydration moves
 * nothing.
 */

import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { useResolvedStaffHolder } from "../staff-holder-store";

export interface StaffHeaderProps {
  /** The Holder the page resolved at SSR, for first paint. */
  seedAgentId: string | null;
  /** That Holder's name at SSR, or null when it could not be read. */
  seedAgentName: string | null;
}

export function StaffHeader({ seedAgentId, seedAgentName }: StaffHeaderProps) {
  const resolved = useResolvedStaffHolder();
  const agentId = resolved?.agentId ?? seedAgentId;
  const liveName = useAppSelector((state) =>
    agentId ? selectAgentName(state, agentId) : undefined,
  );
  const holderName =
    liveName?.trim() || resolved?.agentName?.trim() || seedAgentName?.trim() || "";

  return (
    <div className="flex h-8 w-full min-w-0 items-center gap-2">
      <span className="shrink-0 text-sm font-medium text-foreground">
        Your staff
      </span>
      {holderName ? (
        <>
          <span aria-hidden className="shrink-0 text-muted-foreground/50">
            /
          </span>
          <span className="min-w-0 truncate text-sm text-muted-foreground">
            {holderName}
          </span>
        </>
      ) : null}
    </div>
  );
}
