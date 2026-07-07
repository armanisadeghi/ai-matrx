// features/education/engage/data/useCurrentPlayer.ts
//
// The current user as a game "player": stable userId + a human display name.
// Reads the hydrated auth/profile slices (no refetch) — the same identity every
// game surface (queue seed, presence, results, league) keys off.

"use client";

import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import {
  selectUserFullName,
  selectUserName,
} from "@/lib/redux/selectors/userSelectors";

export interface CurrentPlayer {
  userId: string | null;
  displayName: string;
}

export function useCurrentPlayer(): CurrentPlayer {
  const userId = useAppSelector(selectUserId);
  const fullName = useAppSelector(selectUserFullName);
  const name = useAppSelector(selectUserName);
  const displayName = (fullName || name || "Player").trim();
  return { userId, displayName };
}
