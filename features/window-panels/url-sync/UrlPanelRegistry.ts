import type { AppDispatch } from "@/lib/redux/store";

/**
 * A hydrator receives the app's own dispatch, THUNKS INCLUDED. It used to be
 * typed as a bare `Dispatch<UnknownAction>`, which quietly said "a hydrator may
 * only dispatch plain actions" — and that is how the `detail` hydrator came to
 * dispatch `openOverlay` itself and bypass the singleton-replacement
 * announcement every other opener goes through (VERIFY-U-P1-R2, D8). A hydrator
 * restores a panel the same way the app opens it: through the one primitive.
 */
export type PanelHydrateCallback = (
  dispatch: AppDispatch,
  instanceId: string,
  args: Record<string, string>,
) => void | "refused";

/**
 * A hydrator that returns `"refused"` declined the link on purpose (e.g. a
 * brand-scoped panel on another brand's page). The manager then drops that
 * token from the address instead of preserving it as a window still to come.
 */

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
