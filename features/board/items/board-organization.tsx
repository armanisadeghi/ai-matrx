"use client";

/**
 * The organization a saved board belongs to, for the tiles on it.
 *
 * A saved board names its own organization (`projects.boards.organization_id`).
 * Opening a board, or bringing a tile back after a reload, is not creating
 * something — it never asks the person "which organization is this for"; it
 * files under the board's own. Only a tile that makes something NEW still goes
 * through the organization gate. Null = no saved board (a demo, a guest board).
 */

import { createContext, useContext } from "react";

const BoardOrganizationContext = createContext<string | null>(null);

export const BoardOrganizationProvider = BoardOrganizationContext.Provider;

export function useBoardOrganizationId(): string | null {
  return useContext(BoardOrganizationContext);
}
