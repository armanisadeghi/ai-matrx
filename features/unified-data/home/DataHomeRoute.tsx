"use client";

// features/unified-data/home/DataHomeRoute.tsx — LANE DATA-HOME-3A
//
// WHICH DATA HOME /data-v2 SHOWS: the knob `custom.data_home_shell` (platform default off = the old
// hub), or `?home=new` / `?home=old` for one visit, so old and new can be opened side by side
// (Arman, 2026-10-01: no redirects until validated; copy mode; one flip later). Until the knob
// answers (and the server did not hand one down), the old page is shown — it is what everybody sees today, and a knob that never answers
// must not leave a blank page.
//
// THE HEADER'S PRESSES LIVE HERE, ABOVE BOTH HOMES (lane DATA-PAGE-DEFECTS, safety net T01/L02):
// the old home's New table is on screen ~2 s before the knob answers and the new home replaces it.
// A press counted in the old page's own state died with it, so the first press never opened the
// name box. Owned here, a press reaches whichever home is showing.

import { useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";

import { DataHomeShellPage } from "./DataHomeShellPage";
import { DATA_HOME_PREVIEW_PARAM, DATA_HOME_SHELL_KNOB, resolveDataHomeShell } from "./dataHomeKnobs";

/** How many times the header's New table / Start from an example was pressed, and the press. */
export interface DataHomeMaking {
  asked: { create: number; examples: number };
  ask: (what: "create" | "examples") => void;
}

export function DataHomeRoute({
  old,
  serverKnob,
}: {
  old: (making: DataHomeMaking) => ReactNode;
  /** The knob as the SERVER resolved it for this person (page.tsx); the first paint uses it, no swap. */
  serverKnob?: unknown;
}) {
  const userId = useAppSelector(selectUserId);
  const browserKnob = useEffectiveKnob(null, userId, DATA_HOME_SHELL_KNOB);
  // The browser's own answer wins once it lands (it also knows this device's rung); until then the
  // server's answer draws the right home from the first byte.
  const knob = browserKnob !== undefined ? browserKnob : serverKnob;
  const preview = useSearchParams().get(DATA_HOME_PREVIEW_PARAM);
  const [asked, setAsked] = useState({ create: 0, examples: 0 });
  const making: DataHomeMaking = {
    asked,
    ask: (what) => setAsked((n) => ({ ...n, [what]: n[what] + 1 })),
  };
  return resolveDataHomeShell(knob, preview) ? <DataHomeShellPage making={making} /> : <>{old(making)}</>;
}
