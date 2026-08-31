import type { Dispatch, UnknownAction } from "@reduxjs/toolkit";

export type PanelHydrateCallback = (
  dispatch: Dispatch<UnknownAction>,
  instanceId: string,
  args: Record<string, string>,
) => void;

interface Registry {
  [typeKey: string]: PanelHydrateCallback;
}

const hydrationRegistry: Registry = {};

/**
 * registerPanelHydrator
 *
 * Used to declare how to restore a panel from the URL.
 * Should be called outside of the React lifecycle (e.g. module level)
 *
 * @param typeKey The unique identifier for the panel type (e.g. "agent", "notes")
 * @param hydrator The function that dispatches the proper Redux actions to open the panel
 */
export function registerPanelHydrator(
  typeKey: string,
  hydrator: PanelHydrateCallback,
) {
  hydrationRegistry[typeKey] = hydrator;
}

export function getHydrator(typeKey: string): PanelHydrateCallback | undefined {
  return hydrationRegistry[typeKey];
}
