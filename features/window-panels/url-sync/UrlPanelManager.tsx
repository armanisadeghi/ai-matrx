"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  selectUrlSyncEntries,
  setHydrated,
  selectIsUrlHydrated,
} from "@/lib/redux/slices/urlSyncSlice";
import { getHydrator } from "./UrlPanelRegistry";
import { initUrlHydration } from "./initUrlHydration";

type UrlSyncEntries = ReturnType<typeof selectUrlSyncEntries>;

/**
 * How long the Redux -> URL writer waits for a URL-hydrated window to register
 * itself in `urlSyncSlice` before canonicalizing `?panels=`. Long enough for a
 * lazily-chunked overlay to load on a cold cache; bounded so a key that never
 * registers cannot freeze URL sync for the session.
 */
const OBSERVE_GRACE_MS = 5000;

interface UrlPanelManagerProps {
  /**
   * Restricts hydration and synchronization to audited panel types. Other
   * `?panels=` tokens are preserved verbatim until their hydrators are safe to
   * enable globally.
   */
  managedTypeKeys?: readonly string[];
}

export function serializeParams(
  entries: UrlSyncEntries,
  managedTypeKeys?: readonly string[],
): string {
  const managedKeys = managedTypeKeys ? new Set(managedTypeKeys) : null;

  return Object.values(entries)
    .filter((entry) => !managedKeys || managedKeys.has(entry.typeKey))
    .map((entry) => {
      let str = `${entry.typeKey}:${entry.instanceId}`;
      if (entry.args && Object.keys(entry.args).length > 0) {
        const argsStr = Object.entries(entry.args)
          .map(([k, v]) => `${k}-${v}`)
          .join("_");
        str += `:${argsStr}`;
      }
      return str;
    })
    .join(",");
}

export function mergeManagedPanelParams(
  currentParam: string,
  nextManagedParam: string,
  managedTypeKeys?: readonly string[],
): string {
  if (!managedTypeKeys) return nextManagedParam;

  const managedKeys = new Set(managedTypeKeys);
  const unmanagedTokens = currentParam
    .split(",")
    .filter(Boolean)
    .filter((token) => !managedKeys.has(token.split(":")[0]));
  const nextManagedTokens = nextManagedParam.split(",").filter(Boolean);

  return [...unmanagedTokens, ...nextManagedTokens].join(",");
}

export function parseParams(paramString: string | null) {
  if (!paramString) return [];
  return paramString.split(",").map((part) => {
    const [typeKey, instanceId, argsStr] = part.split(":");
    let args: Record<string, string> | undefined;
    if (argsStr) {
      const parsedArgs: Record<string, string> = {};
      argsStr.split("_").forEach((pair) => {
        const [k, v] = pair.split("-");
        if (k && v) parsedArgs[k] = v;
      });
      args = parsedArgs;
    }
    return { typeKey, instanceId, args };
  });
}

/**
 * UrlPanelHydrator
 *
 * Sits near the application root (must be wrapped in Suspense).
 * 1. Post-hydration, reads ?panels= from URL and dispatches registered open/restore actions.
 * 2. Monitors `urlSyncSlice` for active panels, and updates ?panels= to ensure persistence links work.
 */
/**
 * UrlPanelManager — URL deep-link sync only.
 * Local workspace persistence is owned by WindowPersistenceManager.
 * This component handles ?panels= URL parameter sync for shareable deep links.
 * Mount inside a <Suspense> boundary if you need URL-based panel restoration.
 */
export function UrlPanelManager({ managedTypeKeys }: UrlPanelManagerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();

  const entries = useAppSelector(selectUrlSyncEntries);
  const isHydrated = useAppSelector(selectIsUrlHydrated);

  const initialLoadDone = useRef(false);
  const pendingInitialTypeKeys = useRef<Set<string>>(new Set());
  const hasObservedInitialEntries = useRef(false);
  // Deadlock breaker for the "wait for the restored window to register"
  // guard below. A hydrated overlay does NOT always register a urlSync entry
  // under the key that opened it — legacy alias keys (`files` opens
  // `cloudFilesWindow`, whose registry key is `cloud_files`) and overlays that
  // are not WindowPanels never will. Without a bound, one such token froze
  // URL sync for the whole page session: every OTHER window's open/close
  // stopped reaching the URL, silently. This flips the wait off after a grace
  // period and says which keys never showed up.
  const [waitExpired, setWaitExpired] = useState(false);

  // 1. HYDRATION (URL -> Redux)
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    initUrlHydration();

    const panelsParam = searchParams.get("panels");
    if (panelsParam) {
      const managedKeys = managedTypeKeys ? new Set(managedTypeKeys) : null;
      const allPanels = parseParams(panelsParam);
      const panels = allPanels.filter(
        (panel) => !managedKeys || managedKeys.has(panel.typeKey),
      );
      // Nothing fails silently: a token this manager does not own is dropped
      // on the floor (the link does nothing), so it has to say so. Unowned
      // tokens are still preserved verbatim in the URL by the sync effect.
      if (managedKeys) {
        for (const panel of allPanels) {
          if (panel.typeKey && !managedKeys.has(panel.typeKey)) {
            console.warn(
              `[UrlPanelManager] Ignoring ?panels= token "${panel.typeKey}": this manager is allowlisted to [${Array.from(managedKeys).join(", ")}]. ` +
                `The link will not open anything. Mount an unallowlisted UrlPanelManager (app/DeferredSingletonCore.tsx) or add the key to managedTypeKeys.`,
            );
          }
        }
      }
      panels.forEach((panel) => {
        const hydrator = getHydrator(panel.typeKey);
        if (hydrator) {
          pendingInitialTypeKeys.current.add(panel.typeKey);
          hydrator(dispatch, panel.instanceId, panel.args || {});
        } else {
          console.warn(
            `[UrlPanelManager] No hydrator registered for panel type: ${panel.typeKey}`,
          );
        }
      });
    }

    hasObservedInitialEntries.current =
      pendingInitialTypeKeys.current.size === 0;

    // Mark hydration complete so subsequent URL writes can begin
    dispatch(setHydrated());
  }, [searchParams, dispatch, managedTypeKeys]);

  // Grace timer for the registration wait above.
  useEffect(() => {
    if (!isHydrated || hasObservedInitialEntries.current) return undefined;
    const timer = setTimeout(() => setWaitExpired(true), OBSERVE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [isHydrated]);

  // 2. SYNCHRONIZATION (Redux -> URL)
  useEffect(() => {
    if (!isHydrated) return;

    if (!hasObservedInitialEntries.current) {
      const observedTypeKeys = new Set(
        Object.values(entries).map((entry) => entry.typeKey),
      );
      const unobserved = Array.from(pendingInitialTypeKeys.current).filter(
        (typeKey) => !observedTypeKeys.has(typeKey),
      );

      if (unobserved.length > 0) {
        if (!waitExpired) return;
        console.warn(
          `[UrlPanelManager] ?panels= token(s) [${unobserved.join(", ")}] hydrated but never registered a urlSync entry within ${OBSERVE_GRACE_MS}ms. ` +
            `Proceeding with URL sync so other windows are not frozen. Give the overlay a matching registry \`urlSync.key\`, or drop the hydrator.`,
        );
      }
      hasObservedInitialEntries.current = true;
    }

    const currentParam = searchParams.get("panels") || "";
    const nextManagedParam = serializeParams(entries, managedTypeKeys);
    const nextParam = mergeManagedPanelParams(
      currentParam,
      nextManagedParam,
      managedTypeKeys,
    );

    // Only update if actually changed, to avoid infinite replace loops
    if (currentParam !== nextParam) {
      const params = new URLSearchParams(searchParams.toString());

      if (nextParam) {
        params.set("panels", nextParam);
      } else {
        params.delete("panels");
      }

      const qs = params.toString();
      // scroll: false keeps position stable
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [
    entries,
    isHydrated,
    managedTypeKeys,
    pathname,
    router,
    searchParams,
    waitExpired,
  ]);

  return null;
}
