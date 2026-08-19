"use client";

// features/masterwork/components/RulebookLaneRoute.tsx
//
// The ONE page scaffold for a Rulebook working-mode route under
// `/masterwork/[id]/<lane>` (Arman's ruling, 2026-08-17: every
// creation/working mode gets a real URL). RouteHeader with a back door to the
// Rulebook, load-by-id, the canonical AccessGate for a failed read, and the
// lane's ONE shared component rendered as the body — the same component the
// detail page's dialog/panel entry renders, so the two entry points can never
// drift apart.
//
// It also carries the Rulebook SURFACE (2026-08-19). Before this, only
// `RulebookDetailPage` mounted `SurfaceRuntimeProvider`, so the very same
// Conductor / Scout launched from `/conduct` or `/interview` passed
// `surfaceName` with NOBODY publishing values — one implementation, two doors,
// full scope through one and an empty scope through the other. Every lane now
// gets the scope, the client tool, and the gate from this one scaffold; a lane
// that adds a route must not hand-roll any of the three.

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  SurfaceRuntimeProvider,
  useSurfaceClientTools,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { MASTERWORK_RULEBOOK_SURFACE_NAME } from "@/features/surfaces/manifests/masterwork-rulebook.manifest";
import { buildRulebookSurfaceScope } from "../agent-context/rulebookSurfaceScope";
import { getRulebook, listMasterworksForRulebook } from "../service";
import type { Masterwork, Rulebook } from "../types";

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
  lane,
  title,
  requireOwner = false,
  ownerMessage,
  body = "scroll",
  children,
}: {
  rulebookId: string;
  /** Lane slug published on the surface scope, e.g. "sources", "conduct". */
  lane: string;
  /** The lane's short header title, e.g. "Sources". */
  title: string;
  /** Owner-only lanes refuse politely, with the door back. */
  requireOwner?: boolean;
  ownerMessage?: string;
  /**
   * "scroll" (default) — a padded, centered, vertically scrolling column.
   * "fill" — a full-height flex column the lane owns entirely (live
   * conversations: the Conductor and the Scout scroll their own transcript).
   * "bare" — the scrolling shell with NO inner container, for a lane whose
   * component already draws its own width and padding. A frame either IS the
   * chrome or has none; wrapping a self-contained page in a second padded
   * column is the box-in-a-box the user can see.
   */
  body?: "scroll" | "fill" | "bare";
  children: (args: RulebookLaneRenderArgs) => ReactNode;
}) {
  const userId = useAppSelector(selectUserId);
  const [rulebook, setRulebook] = useState<Rulebook | null>(null);
  const [masterworks, setMasterworks] = useState<Masterwork[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (isCancelled: () => boolean) => {
      try {
        const [nextRulebook, nextMasterworks] = await Promise.all([
          getRulebook(rulebookId),
          // Masterworks are part of the Rulebook's surface truth on every
          // lane; a failure here must never hide the lane itself.
          listMasterworksForRulebook(rulebookId).catch(
            () => [] as Masterwork[],
          ),
        ]);
        if (isCancelled()) return;
        setRulebook(nextRulebook);
        setMasterworks(nextMasterworks);
        setError(null);
      } catch (err) {
        // NEVER swallow this. The error is what tells AccessGate whether the
        // Expert is denied, signed out, or looking at a real fault.
        if (!isCancelled()) setError(err);
      } finally {
        if (!isCancelled()) setLoading(false);
      }
    },
    [rulebookId],
  );

  const reload = useCallback(() => {
    void load(() => false);
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [load]);

  const canEdit =
    rulebook !== null && userId !== null && rulebook.created_by === userId;

  const buildSurfaceScope = useCallback(() => {
    if (!rulebook) {
      throw new Error("The Rulebook surface is still loading.");
    }
    return buildRulebookSurfaceScope({
      rulebook,
      canEdit,
      masterworks,
      lane,
    });
  }, [canEdit, lane, masterworks, rulebook]);

  // The one client tool every lane can honestly service: refetch this
  // workspace's Rulebook + Masterworks through the canonical loaders.
  useSurfaceClientTools(MASTERWORK_RULEBOOK_SURFACE_NAME, {
    masterwork_refresh_rulebook: async () => {
      const [nextRulebook, nextMasterworks] = await Promise.all([
        getRulebook(rulebookId),
        listMasterworksForRulebook(rulebookId),
      ]);
      if (!nextRulebook) {
        throw new Error(
          "This Rulebook no longer exists, or you no longer have access to it.",
        );
      }
      setRulebook(nextRulebook);
      setMasterworks(nextMasterworks);
      return {
        rulebook_version: nextRulebook.version,
        masterwork_count: nextMasterworks.length,
      };
    },
  });

  const header = (
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
  );

  const shellClass =
    body === "fill"
      ? "flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]"
      : "h-full overflow-y-auto bg-textured pt-[calc(var(--shell-header-h)+1rem)]";

  if (loading) {
    return (
      <>
        {header}
        <div className={shellClass}>
          <div className="flex h-full flex-1 items-center justify-center">
            <LoadingSpinner />
          </div>
        </div>
      </>
    );
  }

  if (!rulebook) {
    // NEVER hand-write "doesn't exist or you don't have access" copy. Under
    // RLS an empty read means four different things (denied · deleted · never
    // existed · signed out); AccessGate resolves the TRUE state and lets a
    // blocked Expert ask the owner for access in one click.
    return (
      <>
        {header}
        <div className={shellClass}>
          <AccessGate
            token="rulebook"
            id={rulebookId}
            error={error}
            onRetry={reload}
            fallbackHref="/masterwork/all"
            fallbackLabel="Back to Masterwork Studio"
          />
        </div>
      </>
    );
  }

  // Not an access story: the Expert CAN read this Rulebook, and this lane is
  // deliberately owner-only because the rules must come from the Expert.
  if (requireOwner && !canEdit) {
    return (
      <>
        {header}
        <div className={shellClass}>
          <div className="flex h-full flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-sm text-muted-foreground">
              {ownerMessage ??
                "Only the Rulebook's owner can work here — the rules have to come from the Expert themself."}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={`/masterwork/${rulebookId}`}>Open the Rulebook</Link>
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <SurfaceRuntimeProvider
      surfaceName={MASTERWORK_RULEBOOK_SURFACE_NAME}
      getScope={buildSurfaceScope}
      isEditable={canEdit}
    >
      {header}
      <div className={shellClass}>
        {body === "fill" ? (
          <div className="mx-auto flex h-full w-full min-h-0 max-w-3xl flex-1 flex-col overflow-hidden">
            {children({ rulebook, canEdit, setRulebook, reload })}
          </div>
        ) : body === "bare" ? (
          children({ rulebook, canEdit, setRulebook, reload })
        ) : (
          <div className="mx-auto max-w-3xl space-y-4 px-4 pb-8 sm:px-6">
            {children({ rulebook, canEdit, setRulebook, reload })}
          </div>
        )}
      </div>
    </SurfaceRuntimeProvider>
  );
}
