"use client";

// features/unified-data/home/DataHomeRoute.tsx — LANE DATA-HOME-3A
//
// WHICH DATA HOME /data-v2 SHOWS: the knob `custom.data_home_shell` (platform default off = the old
// hub), or `?home=new` / `?home=old` for one visit, so old and new can be opened side by side
// (Arman, 2026-10-01: no redirects until validated; copy mode; one flip later). Until the knob
// answers, the old page is shown — it is what everybody sees today, and a knob that never answers
// must not leave a blank page.

import type { ReactNode } from "react";
import { useSearchParams } from "next/navigation";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useEffectiveKnob } from "@/lib/scoped-config/effectiveKnobs.client";

import { DataHomeShellPage } from "./DataHomeShellPage";
import { DATA_HOME_PREVIEW_PARAM, DATA_HOME_SHELL_KNOB, resolveDataHomeShell } from "./dataHomeKnobs";

export function DataHomeRoute({ old }: { old: ReactNode }) {
  const userId = useAppSelector(selectUserId);
  const knob = useEffectiveKnob(null, userId, DATA_HOME_SHELL_KNOB);
  const preview = useSearchParams().get(DATA_HOME_PREVIEW_PARAM);
  return resolveDataHomeShell(knob, preview) ? <DataHomeShellPage /> : <>{old}</>;
}
