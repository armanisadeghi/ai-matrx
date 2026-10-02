/**
 * features/notifications/openPanelsInPlace.ts — open a link's `?panels=`
 * windows on the CURRENT page, through the same hydrators a first page load
 * uses.
 *
 * Loaded lazily by `InboxPanel` on the click that needs it: the hydrator table
 * (`initUrlHydration`) imports every window family's restore thunks, which
 * have no business in the header bell's boot bundle.
 *
 * All or nothing: if ANY token names a key with no registered hydrator, nothing
 * is dispatched and the caller opens the link in a new tab — half a link opened
 * in place is a link that silently lost its other half.
 */
import type { AppDispatch } from "@/lib/redux/store";
import { getHydrator } from "@/features/window-panels/url-sync/UrlPanelRegistry";
import { parseParams } from "@/features/window-panels/url-sync/UrlPanelManager";
import { initUrlHydration } from "@/features/window-panels/url-sync/initUrlHydration";

let hydratorsRegistered = false;

function ensureHydratorsRegistered(): void {
  // `UrlPanelManager` registers them on mount, but it lives in the deferred
  // singleton core and may not have mounted yet on a fast click. Registration
  // is idempotent (a keyed table), so doing it here is always safe.
  if (hydratorsRegistered) return;
  hydratorsRegistered = true;
  initUrlHydration();
}

export type OpenInPlaceResult =
  { opened: true; keys: string[] } | { opened: false; missingKeys: string[] };

export function openPanelsInPlace(
  dispatch: AppDispatch,
  panelsParam: string,
): OpenInPlaceResult {
  ensureHydratorsRegistered();
  const panels = parseParams(panelsParam).filter((panel) => panel.typeKey);
  const missingKeys = panels
    .filter((panel) => !getHydrator(panel.typeKey))
    .map((panel) => panel.typeKey);
  if (panels.length === 0 || missingKeys.length > 0) {
    return { opened: false, missingKeys };
  }
  for (const panel of panels) {
    const hydrator = getHydrator(panel.typeKey);
    hydrator?.(dispatch, panel.instanceId ?? "", panel.args ?? {});
  }
  return { opened: true, keys: panels.map((panel) => panel.typeKey) };
}
