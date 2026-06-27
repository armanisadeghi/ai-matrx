"use client";

// features/war-room/components/room/useRoomUrlSync.ts
//
// Feature e56104e5 — persist the room's VIEW (the staged thread + Stage/Grid
// mode + density) in the URL query string, so a refresh or a shared link
// restores exactly what the user was looking at.
//
// The room's view state is ephemeral by design (roomViewContext — never Redux,
// never the DB; see FEATURE.md invariant 4). The session row already persists
// `active_tile_id` (a slow, debounced server mirror via useActiveThreadRestore).
// This hook adds the FAST, shareable layer on top: a URL param mirror that needs
// no round-trip and travels in a copied link.
//
// Params (all optional, all omitted when at their default so a clean room has a
// clean URL):
//   • thread  — the staged tile id (only when the user has explicitly chosen one)
//   • view    — "grid" (omitted for the default "stage")
//   • density — "spacious" | "compact" (omitted for the default "comfortable")
//
// Mechanics mirror the canonical NoteTabBar URL sync: a one-shot HYDRATE from
// the URL on mount (so a refresh/shared link wins), then a Redux→URL push via
// window.history.replaceState (no Next navigation, no Suspense boundary, no
// scroll jump). `thread` only hydrates once the tile is actually visible — a
// stale/hidden/deleted id can never strand the Stage (resolveStagedId still
// clamps); seeding from the session row (useActiveThreadRestore) is the fallback
// when no `thread` param is present.

import { useEffect, useRef } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrderedGalleryThreadIds } from "@/features/war-room/redux/selectors";
import { useRoomView, type Density, type RoomMode } from "./roomViewContext";

function isMode(v: string | null): v is RoomMode {
  return v === "stage" || v === "grid";
}
function isDensity(v: string | null): v is Density {
  return v === "spacious" || v === "comfortable" || v === "compact";
}

export function useRoomUrlSync(sessionId: string) {
  const visibleIds = useAppSelector(selectOrderedGalleryThreadIds(sessionId));
  const {
    mode,
    setMode,
    density,
    setDensity,
    chosenStageId,
    setChosenStageId,
  } = useRoomView();

  // Hydration is two-phase: the non-thread params (view/density) settle on the
  // first mount; the thread param waits until that tile is visible (tiles load
  // async). Two refs so each fires exactly once.
  const hydratedViewRef = useRef(false);
  const hydratedThreadRef = useRef(false);
  const lastPushedUrlRef = useRef<string | null>(null);

  // ── HYDRATE (URL → view state) ──────────────────────────────────────────
  // View + density: once, on mount. A shared link's mode/density wins over the
  // provider defaults.
  useEffect(() => {
    if (hydratedViewRef.current) return;
    hydratedViewRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const view = params.get("view");
    if (isMode(view) && view !== mode) setMode(view);
    const d = params.get("density");
    if (isDensity(d) && d !== density) setDensity(d);
    // Run once; defaults are read at mount only (deps intentionally omitted).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Thread: once tiles exist, adopt the URL's thread id IF it's a real visible
  // thread and the user hasn't already chosen one this mount.
  useEffect(() => {
    if (hydratedThreadRef.current) return;
    if (visibleIds.length === 0) return; // wait for tiles
    hydratedThreadRef.current = true;
    if (chosenStageId) return; // an explicit choice already happened
    const wanted = new URLSearchParams(window.location.search).get("thread");
    if (wanted && visibleIds.includes(wanted)) setChosenStageId(wanted);
  }, [visibleIds, chosenStageId, setChosenStageId]);

  // ── PUSH (view state → URL) ─────────────────────────────────────────────
  // Only after the view hydrate pass, so we never overwrite the value we just
  // read. Omit each param at its default to keep a fresh room's URL clean.
  useEffect(() => {
    if (!hydratedViewRef.current) return;
    const params = new URLSearchParams(window.location.search);

    if (chosenStageId) params.set("thread", chosenStageId);
    else params.delete("thread");

    if (mode === "grid") params.set("view", "grid");
    else params.delete("view");

    if (density !== "comfortable") params.set("density", density);
    else params.delete("density");

    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
    if (newUrl !== lastPushedUrlRef.current) {
      lastPushedUrlRef.current = newUrl;
      window.history.replaceState(null, "", newUrl);
    }
  }, [chosenStageId, mode, density]);
}
