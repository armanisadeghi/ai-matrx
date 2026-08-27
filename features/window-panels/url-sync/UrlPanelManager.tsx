"use client";

import { useEffect, useRef } from "react";
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

  // 1. HYDRATION (URL -> Redux)
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    initUrlHydration();

    const panelsParam = searchParams.get("panels");
    if (panelsParam) {
      const managedKeys = managedTypeKeys ? new Set(managedTypeKeys) : null;
      const panels = parseParams(panelsParam).filter(
        (panel) => !managedKeys || managedKeys.has(panel.typeKey),
      );
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

  // 2. SYNCHRONIZATION (Redux -> URL)
  useEffect(() => {
    if (!isHydrated) return;

    if (!hasObservedInitialEntries.current) {
      const observedTypeKeys = new Set(
        Object.values(entries).map((entry) => entry.typeKey),
      );
      const allInitialEntriesObserved = Array.from(
        pendingInitialTypeKeys.current,
      ).every((typeKey) => observedTypeKeys.has(typeKey));

      if (!allInitialEntriesObserved) return;
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
  }, [entries, isHydrated, managedTypeKeys, pathname, router, searchParams]);

  return null;
}
