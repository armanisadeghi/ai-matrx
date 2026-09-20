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
 * How long a `?panels=` token the URL arrived with may go unclaimed before the
 * manager says so. It does NOT gate URL writes and it never drops the token —
 * see THE ADDRESS IS NEVER ERASED below. Long enough for a lazily-chunked
 * overlay to load on a cold cache.
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

/**
 * 🚨 THE ADDRESS IS NEVER ERASED.
 *
 * `serializeParams` can only describe windows that are OPEN RIGHT NOW: a token
 * whose window has not registered yet — or cannot, because its hydrator opened
 * nothing — is simply absent from `entries`, so writing that serialization back
 * to the bar DELETES it. That is what a person sees as "it loads the link, then
 * clears it": the one copy of the address they had is gone from history, from
 * the bar, and from anything they were about to paste, and a refresh can no
 * longer even retry it.
 *
 * So a token the URL arrived with is carried verbatim until the key it names
 * actually registers. From that moment the live entries govern it — closing the
 * window must still drop it — which is why the caller stops passing a token
 * once its `typeKey` has been observed.
 *
 * Matching is by `typeKey`, never by the whole `typeKey:instanceId`: a window
 * legitimately registers under an identity the link did not carry (the vault
 * link names an ITEM, the vault window registers its singleton id), and
 * demanding an exact match would preserve those forever.
 */
export function withUnclaimedTokens(
  nextParam: string,
  unclaimedTokens: readonly string[],
): string {
  if (unclaimedTokens.length === 0) return nextParam;

  const nextTokens = nextParam.split(",").filter(Boolean);
  const claimedTypeKeys = new Set(
    nextTokens.map((token) => token.split(":")[0]),
  );
  const preserved = unclaimedTokens.filter(
    (token) => !claimedTypeKeys.has(token.split(":")[0]),
  );

  return [...preserved, ...nextTokens].join(",");
}

export function parseParams(paramString: string | null) {
  if (!paramString) return [];
  return paramString.split(",").map((part) => {
    const [typeKey, instanceId, argsStr] = part.split(":");
    let args: Record<string, string> | undefined;
    if (argsStr) {
      const parsedArgs: Record<string, string> = {};
      argsStr.split("_").forEach((pair) => {
        // 🚨 Split on the FIRST hyphen only. `pair.split("-")` threw away
        // everything after the second segment, so an arg value containing a
        // hyphen — a uuid, a date, an escaped list (NEW-15) — arrived truncated
        // and the panel restored wrong. Existing args (`v-fc`, `as-window`) are
        // unaffected: they hold no hyphen.
        const at = pair.indexOf("-");
        if (at <= 0 || at === pair.length - 1) return;
        parsedArgs[pair.slice(0, at)] = pair.slice(at + 1);
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
  /**
   * The tokens this manager handed to a hydrator on load, verbatim, keyed by
   * `typeKey` — the ones whose windows have not registered yet. They are
   * carried through every URL write until they do (`withUnclaimedTokens`), and
   * dropped from here the moment they are claimed, after which the live
   * entries own them.
   */
  const unclaimedTokens = useRef<Map<string, string[]>>(new Map());
  const [unclaimedRevision, setUnclaimedRevision] = useState(0);

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
      const rawTokens = panelsParam.split(",").filter(Boolean);
      panels.forEach((panel) => {
        const hydrator = getHydrator(panel.typeKey);
        if (hydrator) {
          // Every token under this key, not just the first: a link may name
          // two records (`detail:file.B,detail:file.C`).
          const raw = rawTokens.filter(
            (token) => token.split(":")[0] === panel.typeKey,
          );
          if (raw.length > 0) unclaimedTokens.current.set(panel.typeKey, raw);
          hydrator(dispatch, panel.instanceId, panel.args || {});
        } else {
          console.warn(
            `[UrlPanelManager] No hydrator registered for panel type: ${panel.typeKey}`,
          );
        }
      });
    }

    // Mark hydration complete so subsequent URL writes can begin
    dispatch(setHydrated());
  }, [searchParams, dispatch, managedTypeKeys]);

  // Nothing fails silently. A token that is still unclaimed after the grace
  // period restored NOTHING a person can see — the hydrator ran and either
  // opened the wrong thing or opened nothing at all. The address stays in the
  // bar (it is the only copy the person has), but the defect gets named.
  useEffect(() => {
    if (!isHydrated) return undefined;
    const timer = setTimeout(() => {
      const stillUnclaimed = Array.from(unclaimedTokens.current.keys());
      if (stillUnclaimed.length === 0) return;
      console.error(
        `[UrlPanelManager] ?panels= token(s) [${stillUnclaimed.join(", ")}] hydrated but no window registered under that key within ${OBSERVE_GRACE_MS}ms — ` +
          "the link restored nothing. The token is kept in the URL so the address is not lost. " +
          "Make the hydrator in url-sync/initUrlHydration.ts OPEN the window (not just seed its state), " +
          "and give that window a matching registry `urlSync.key`.",
      );
    }, OBSERVE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [isHydrated]);

  // 2. SYNCHRONIZATION (Redux -> URL)
  useEffect(() => {
    if (!isHydrated) return;

    // A key that has registered is claimed: from here the live entries own it,
    // so closing that window still clears its token.
    if (unclaimedTokens.current.size > 0) {
      let claimedAny = false;
      for (const entry of Object.values(entries)) {
        if (unclaimedTokens.current.delete(entry.typeKey)) claimedAny = true;
      }
      // Re-run this effect once more after a claim, so the preserved token is
      // replaced by the window's own — `entries` may not change again.
      if (claimedAny) setUnclaimedRevision((n) => n + 1);
    }

    const currentParam = searchParams.get("panels") || "";
    const nextManagedParam = serializeParams(entries, managedTypeKeys);
    const nextParam = withUnclaimedTokens(
      mergeManagedPanelParams(currentParam, nextManagedParam, managedTypeKeys),
      Array.from(unclaimedTokens.current.values()).flat(),
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
    unclaimedRevision,
  ]);

  return null;
}
