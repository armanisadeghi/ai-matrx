"use client";

/**
 * AssistStrip — the ONE-LINE per-page mount for assists (the original
 * vision: chips that react to THIS page). Renders the current user's
 * pending assists addressed to a surface as a wrapping chip row; renders
 * nothing when there are none.
 *
 *   <AssistStrip surfaceName="matrx-user/shapes" />
 *
 * Every page-building agent asks: which assists does this page need?
 * A deterministic producer beside the feature emits them (see
 * features/assists/FEATURE.md producer rules); this strip shows them where
 * the user is standing. The same rows appear in the global AssistsDock —
 * one ledger, one slice; deciding in either place clears both.
 */

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { cn } from "@/lib/utils";
import type { RootState } from "@/lib/redux/store";
import {
  fetchMyAssists,
  selectAssistsForSurface,
  selectAssistsLoaded,
} from "../redux/assistsSlice";
import { AssistChip } from "./AssistChip";
import type { Assist } from "../types";

export function AssistStrip({
  surfaceName,
  filter,
  className,
}: {
  /** `<client>/<surface>` — matches the rows' surface_name. */
  surfaceName: string;
  /** Optional narrowing (e.g. only this record's assists). */
  filter?: (assist: Assist) => boolean;
  className?: string;
}) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const loaded = useAppSelector(selectAssistsLoaded);
  const surfaceAssists = useAppSelector((state: RootState) =>
    selectAssistsForSurface(state, surfaceName),
  );

  // Hydrate the shared slice even if the (deferred) global dock hasn't yet.
  useEffect(() => {
    if (userId && !loaded) void dispatch(fetchMyAssists({ userId }));
  }, [dispatch, userId, loaded]);

  const assists = filter ? surfaceAssists.filter(filter) : surfaceAssists;
  if (assists.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {assists.map((assist) => (
        <AssistChip key={assist.id} assist={assist} />
      ))}
    </div>
  );
}
