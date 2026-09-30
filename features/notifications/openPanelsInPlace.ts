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
 * is dispatched and the caller falls back to navigating — half a link opened
 * in place is a link that silently lost its other half.
 */
import type { AppDispatch } from "@/lib/redux/store";
import { getHydrator } from "@/features/window-panels/url-sync/UrlPanelRegistry";
import { parseParams } from "@/features/window-panels/url-sync/UrlPanelManager";
import { initUrlHydration } from "@/features/window-panels/url-sync/initUrlHydration";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

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

/**
 * Nothing fails silently: a notice named a window this build cannot open in
 * place. Console + the app's capture channel, then the caller navigates.
 */
export function announceInPlaceFallback(
  link: string,
  missingKeys: readonly string[],
  eventKey: string,
): void {
  const keys = missingKeys.join(", ") || "(none)";
  const message =
    `[Inbox] Notice "${eventKey}" links ${link}: no window hydrator is registered for ?panels= key(s) [${keys}], ` +
    `so it cannot open in place — navigating to the link instead. Register a hydrator in ` +
    `features/window-panels/url-sync/initUrlHydration.ts (and a registry urlSync.key) for that window.`;
  console.error(message);
  try {
    captureError({
      source: "url-panel-unopened",
      operation: "unknown",
      relation: `?panels=${keys}`,
      message,
      userMessage:
        "This notice's window can't open over your page yet, so it opened its page instead.",
      code: "notice-no-hydrator",
      raw: { link, missingKeys, eventKey },
    });
  } catch {
    // Capture never breaks the click.
  }
}
