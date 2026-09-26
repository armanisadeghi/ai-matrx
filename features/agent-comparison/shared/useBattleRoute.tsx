"use client";

/**
 * useBattleRoute — every battle has a URL, and the URL and the screen agree.
 *
 *   /agents/battle/<mode>            a new, unsaved battle (or the one in progress)
 *   /agents/battle/<mode>/<battleId> that saved battle, reopened from the database
 *
 * Two directions, one owner:
 *   - URL → screen: arriving on a battle URL whose battle is not on screen loads
 *     it through the mode's own load thunk (every mode rebuilds its columns its
 *     own way; this hook never touches mode state).
 *   - screen → URL: when the battle on screen gains an id (first Submit all,
 *     Save, or a load) the URL is replaced to name it; when the battle is
 *     cleared the URL returns to the mode's base path.
 *
 * A battle saved under a different mode is sent to that mode's URL instead of
 * failing. A battle that cannot be opened says why, on the page.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";
import AppLink from "@/components/navigation/AppLink";
import { useAppDispatch, useAppStore } from "@/lib/redux/hooks";
import { getComparisonSetMode } from "../service/comparisonSetsService";
import { setMountedBattleMode } from "../redux/battleSlice";
import {
  battleModeBasePath,
  battleUrl,
  isBattleModeId,
  type BattleModeId,
} from "./battleRoutes";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface UseBattleRouteArgs {
  mode: BattleModeId;
  /** The battle id in the URL, if any. */
  urlSetId: string | null;
  /** The battle id on screen (the mode slice's activeSetId). */
  activeSetId: string | null;
  /** The mode's own loader. Must leave the loaded battle as the active set. */
  load: (setId: string) => Promise<void>;
}

export type BattleRouteStatus =
  | { kind: "ready" }
  | { kind: "loading"; setId: string }
  | { kind: "error"; setId: string; message: string };

export function useBattleRoute({
  mode,
  urlSetId,
  activeSetId,
  load,
}: UseBattleRouteArgs): BattleRouteStatus {
  const router = useRouter();
  useMountBattleMode(mode);
  const [status, setStatus] = useState<BattleRouteStatus>(() =>
    urlSetId && urlSetId !== activeSetId
      ? { kind: "loading", setId: urlSetId }
      : { kind: "ready" },
  );
  // Held for the whole load: the mode's loader clears the active battle before
  // it rebuilds it, and the screen → URL direction must not chase that.
  const loadingFor = useRef<string | null>(null);
  const activeRef = useRef(activeSetId);
  const loadRef = useRef(load);
  const urlRef = useRef(urlSetId);
  useEffect(() => {
    activeRef.current = activeSetId;
    loadRef.current = load;
    urlRef.current = urlSetId;
  });

  // URL → screen.
  useEffect(() => {
    if (!urlSetId || urlSetId === activeRef.current) {
      if (loadingFor.current === null) setStatus({ kind: "ready" });
      return;
    }
    if (loadingFor.current === urlSetId) return;
    loadingFor.current = urlSetId;
    setStatus({ kind: "loading", setId: urlSetId });
    // Not tied to effect cleanup: a dev double-mount must not orphan the load
    // it started. A result is simply ignored once the URL names another battle.
    const stillWanted = () => urlRef.current === urlSetId;
    void (async () => {
      try {
        const saved = await getComparisonSetMode(urlSetId);
        if (!saved.found) {
          throw new Error(
            "it does not exist, it was deleted, or it has not been shared with you.",
          );
        }
        if (saved.mode && saved.mode !== mode && isBattleModeId(saved.mode)) {
          router.replace(battleUrl(saved.mode, urlSetId) ?? battleModeBasePath(mode));
          return;
        }
        await loadRef.current(urlSetId);
        if (stillWanted()) setStatus({ kind: "ready" });
      } catch (err) {
        if (stillWanted()) {
          setStatus({
            kind: "error",
            setId: urlSetId,
            message: describeLoadError(err),
          });
        }
      } finally {
        if (loadingFor.current === urlSetId) loadingFor.current = null;
      }
    })();
  }, [urlSetId, mode, router]);

  // Screen → URL.
  useEffect(() => {
    if (loadingFor.current !== null || status.kind !== "ready") return;
    if (activeSetId && activeSetId !== urlSetId) {
      const target = battleUrl(mode, activeSetId);
      if (target) router.replace(target);
      return;
    }
    if (!activeSetId && urlSetId) {
      router.replace(battleModeBasePath(mode));
    }
  }, [activeSetId, urlSetId, mode, router, status.kind]);

  return status;
}

/**
 * Declare which battle mode is on screen, so the shared surfaces read this
 * mode's columns and saved battle. Cleared on unmount unless another battle
 * page already took over.
 */
export function useMountBattleMode(mode: BattleModeId): void {
  const dispatch = useAppDispatch();
  const store = useAppStore();
  useEffect(() => {
    dispatch(setMountedBattleMode(mode));
    return () => {
      if (store.getState().agentComparison.mountedMode === mode) {
        dispatch(setMountedBattleMode(null));
      }
    };
  }, [dispatch, store, mode]);
}

function describeLoadError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return "The saved battle could not be read.";
}

/**
 * The page's honest state while a battle URL is being opened, or why it could
 * not be. Renders nothing once the battle is on screen.
 */
export function BattleRouteNotice({
  status,
  mode,
}: {
  status: BattleRouteStatus;
  mode: BattleModeId;
}) {
  if (status.kind === "ready") return null;
  if (status.kind === "loading") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40 text-sm text-muted-foreground shrink-0"
      >
        <Loader2 className="w-4 h-4 animate-spin" />
        Opening the saved battle and its conversations…
      </div>
    );
  }
  return (
    <div
      role="alert"
      className="flex items-center gap-3 px-3 py-2 border-b border-destructive/40 bg-destructive/10 text-sm shrink-0"
    >
      <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
      <span className="min-w-0 flex-1">
        This battle could not be opened: {status.message}
      </span>
      <ErrorAlchemyMenu operation="Open this battle" />
      <AppLink
        href={battleModeBasePath(mode)}
        className="shrink-0 text-primary hover:underline"
      >
        Start a new battle
      </AppLink>
    </div>
  );
}
