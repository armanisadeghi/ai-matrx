"use client";

// features/masterwork/components/RulebookLaneRoute.tsx
//
// The ONE page scaffold for a Rulebook working-mode route under
// `/masterwork/[id]/<lane>` (Arman's ruling, 2026-08-17: every
// creation/working mode gets a real URL). Follows the
// `/masterwork/[id]/interview` precedent exactly: RouteHeader with a back
// door to the Rulebook, load-by-id, honest missing/denied states, and the
// lane's ONE shared component rendered as the body — the same component the
// detail page's dialog/panel entry renders, so the two entry points can
// never drift apart.

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { getRulebook } from "../service";
import type { Rulebook } from "../types";

export interface RulebookLaneRenderArgs {
  rulebook: Rulebook;
  canEdit: boolean;
  /** Adopt a fresh Rulebook row (a CAS write returned one). */
  setRulebook: (rulebook: Rulebook) => void;
  /** Refetch the Rulebook (drafts landed server-side). */
  reload: () => void;
}

export function RulebookLaneRoute({
  rulebookId,
  title,
  requireOwner = false,
  ownerMessage,
  children,
}: {
  rulebookId: string;
  /** The lane's short header title, e.g. "Sources". */
  title: string;
  /** Owner-only lanes refuse politely, with the door back. */
  requireOwner?: boolean;
  ownerMessage?: string;
  children: (args: RulebookLaneRenderArgs) => ReactNode;
}) {
  const userId = useAppSelector(selectUserId);
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    void getRulebook(rulebookId)
      .then((r) => {
        if (r) setRulebook(r);
      })
      .catch(() => undefined);
  }, [rulebookId]);

  useEffect(() => {
    let cancelled = false;
    void getRulebook(rulebookId)
      .then((r) => {
        if (!cancelled) setRulebook(r);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [rulebookId]);

  const canEdit =
    rulebook !== null && userId !== null && rulebook.created_by === userId;

  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href={`/masterwork/${rulebookId}`}
              ariaLabel="Back to the Rulebook"
            />
            <h1 className="ml-2 truncate text-sm font-medium text-foreground">
              {title}
              {rulebook ? (
                <span className="ml-2 font-normal text-muted-foreground">
                  {rulebook.name}
                </span>
              ) : null}
            </h1>
          </>
        }
      />
      <div className="h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : !rulebook ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              This Rulebook doesn&apos;t exist, or you don&apos;t have access to
              it.
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/masterwork/all">Back to Masterwork Studio</Link>
            </Button>
          </div>
        ) : requireOwner && !canEdit ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              {ownerMessage ??
                "Only the Rulebook's owner can work here — the rules have to come from the Expert themself."}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/masterwork/${rulebookId}`}>Open the Rulebook</Link>
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8 sm:px-6">
            {children({ rulebook, canEdit, setRulebook, reload })}
          </div>
        )}
      </div>
    </>
  );
}
