"use client";

/**
 * useRunViewPreference — "Page" or "Board" for the workflow run page.
 *
 * The address wins (`?view=board` is a shareable link to the board); without
 * one, the viewer's last choice (per browser, localStorage — a per-viewer
 * convenience, never shared state); without that, "page". Choosing writes
 * both, and the address is updated in place — no navigation, no refetch.
 */

import { useEffect, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";

import {
  currentPathWithSearch,
  replaceAddressWithoutNavigating,
} from "@/lib/url-state/addressWithoutNavigating";

export type RunView = "page" | "board";

const STORAGE_KEY = "matrx:workflow-run-view";
const listeners = new Set<() => void>();

function readStored(): RunView | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "board" || value === "page" ? value : null;
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function writeAddress(view: RunView) {
  const params = new URLSearchParams(window.location.search);
  if (view === "board") {
    params.set("view", "board");
    replaceAddressWithoutNavigating(currentPathWithSearch(params));
    return;
  }
  params.delete("view");
  // The board's camera (`#cam=`) means nothing on the page — drop it.
  const qs = params.toString();
  replaceAddressWithoutNavigating(`${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

export function useRunViewPreference(
  /** False while the page shows no run — the address is left alone. */
  active: boolean,
): [RunView, (view: RunView) => void] {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("view");
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const view: RunView =
    fromUrl === "board" || fromUrl === "page" ? fromUrl : (stored ?? "page");

  // Reflect a remembered board in the address, so what is on screen is a link.
  useEffect(() => {
    if (active && view === "board" && fromUrl !== "board") writeAddress("board");
  }, [active, view, fromUrl]);

  const setView = (next: RunView) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private window / blocked storage: the address still carries it.
    }
    for (const listener of listeners) listener();
    writeAddress(next);
  };

  return [view, setView];
}
