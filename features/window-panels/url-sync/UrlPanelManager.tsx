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
import { resolveCanonicalTypeKey } from "./panelKeyAliases";
import { initUrlHydration } from "./initUrlHydration";
import { LAZY_WINDOW_MOUNT_DEADLINE_MS } from "../constants/lazyWindowMount";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { toastErrorAlreadyCaptured } from "@/lib/toast";

type UrlSyncEntries = ReturnType<typeof selectUrlSyncEntries>;

/**
 * 🚨 THE ADDRESS IS NEVER DESTROYED BY A CLOCK (V-28 NEW-5, 2026-09-20).
 *
 * A `?panels=` token whose window has not registered yet is NOT evidence that
 * the token is wrong — every window arrives through a lazy chunk, and on a
 * cold dev compile that chunk can take tens of seconds. This manager therefore
 * waits on the REAL signal (the window's own `urlSyncSlice` entry, which
 * arrives whenever it arrives) and keeps the token in the address the whole
 * time. This deadline decides ONE thing and only one: when to stop waiting
 * SILENTLY and tell the person on screen that the window has not opened. The
 * token stays in the URL either way, so a shared link is still a good link and
 * a reload still has something to reload.
 *
 * Before this, a 5000 ms timer expiring caused the token to be dropped from
 * `?panels=` with no notice at all: the measured result was a deep link that
 * opened nothing in four of eight fresh loads and erased itself from the
 * address bar every time.
 */
const REGISTRATION_NOTICE_DEADLINE_MS = LAZY_WINDOW_MOUNT_DEADLINE_MS;

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
 * Re-attaches the raw `?panels=` tokens whose windows have not registered a
 * urlSync entry (yet, or ever). Serialization can only speak for windows that
 * exist; without this, a window that is still compiling — or one this build
 * genuinely cannot open — silently loses its address on the next URL write.
 *
 * A token is skipped when its type key is already represented by a live entry,
 * so a late registration replaces the placeholder instead of duplicating it.
 * The comparison is CANONICAL (`resolveCanonicalTypeKey`): a legacy alias such
 * as `files` is represented by the `cloud_files` token its own window
 * published, so the address carries the canonical token once and never both
 * (V-29 NEW-1).
 */
export function withUnresolvedTokens(
  managedParam: string,
  unresolvedTokens: readonly string[],
): string {
  if (unresolvedTokens.length === 0) return managedParam;

  const managedTokens = managedParam.split(",").filter(Boolean);
  const represented = new Set(
    managedTokens.map((token) => resolveCanonicalTypeKey(token.split(":")[0])),
  );
  const kept = unresolvedTokens.filter(
    (token) =>
      Boolean(token) &&
      !represented.has(resolveCanonicalTypeKey(token.split(":")[0])),
  );

  return [...managedTokens, ...kept].join(",");
}

/**
 * The honest notice for a link naming a window that did not open. It names the
 * keys, says the link is intact, and gives the two things a person can
 * actually do. Exported so the wording is testable without a DOM.
 */
export function unopenedWindowNotice(typeKeys: readonly string[]): string {
  const keys = typeKeys.join(", ");
  return (
    `This link names a window this build could not open: ${keys}. ` +
    `The link is unchanged in your address bar — reload to try again, or report it if it keeps failing.`
  );
}

/**
 * The loud recovery layer for a `?panels=` token whose window never showed up.
 * It screams in the console, files a structured diagnostic the admin Error
 * Inspector (and, at red tier, `public.system_error`) can read, and — the part
 * that matters to a person — puts an honest sentence on screen instead of
 * quietly rewriting their address bar.
 */
function announceUnopenedWindows(
  candidateKeys: readonly string[],
  alreadyAnnounced: Set<string>,
  reason: "no-hydrator" | "never-registered",
): void {
  const typeKeys = candidateKeys.filter((key) => !alreadyAnnounced.has(key));
  if (typeKeys.length === 0) return;
  typeKeys.forEach((key) => alreadyAnnounced.add(key));

  const keys = typeKeys.join(", ");
  const why =
    reason === "no-hydrator"
      ? `no hydrator is registered for ${typeKeys.length > 1 ? "them" : "it"}`
      : `hydrated, but no window registered a urlSync entry within ${REGISTRATION_NOTICE_DEADLINE_MS}ms`;
  const message =
    `[UrlPanelManager] ?panels= token(s) [${keys}]: ${why}. The token is KEPT in the URL. ` +
    `Give the overlay a matching registry \`urlSync.key\` and a hydrator in initUrlHydration.ts, or stop publishing the link.`;

  console.error(message);

  try {
    captureError({
      source: "url-panel-unopened",
      operation: "unknown",
      relation: `?panels=${keys}`,
      message,
      userMessage: unopenedWindowNotice(typeKeys),
      code: reason,
      raw: { typeKeys, reason, deadlineMs: REGISTRATION_NOTICE_DEADLINE_MS },
    });
  } catch {
    // Capture never breaks the caller.
  }

  try {
    toastErrorAlreadyCaptured(unopenedWindowNotice(typeKeys), {
      duration: 12000,
    });
  } catch {
    // A missing toaster must not take the page with it.
  }
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
  // CANONICAL typeKey -> { the VERBATIM token that opened it, and the key the
  // person actually pasted }. An entry sits here from hydration until the
  // window it opened registers its own urlSync entry — which may be seconds
  // later on a lazy chunk, or never (an overlay that is not a WindowPanel at
  // all). While it sits here the raw token is written straight back into
  // `?panels=`, so the address the person pasted survives the wait and
  // survives the failure.
  //
  // 🚨 The map is keyed CANONICALLY (V-29 NEW-1). A legacy alias key — `files`,
  // whose hydrator opens `cloudFilesWindow`, which registers as `cloud_files` —
  // is settled the moment that canonical key registers. Keyed raw, it never
  // could be: the manager duplicated the token in the address and then told the
  // person in a red-tier incident that a window on their screen had not opened.
  // `tokenKey` is kept so the sentence a person reads names what THEY pasted.
  const unresolvedTokens = useRef<
    Map<string, { token: string; tokenKey: string }>
  >(new Map());
  const announcedKeys = useRef<Set<string>>(new Set());
  // Fires once, long after any legitimate lazy mount, and does exactly one
  // thing: turn a silent wait into a visible, honest notice.
  const [noticeDue, setNoticeDue] = useState(false);

  // 1. HYDRATION (URL -> Redux)
  useEffect(() => {
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    initUrlHydration();

    const panelsParam = searchParams.get("panels");
    if (panelsParam) {
      const managedKeys = managedTypeKeys ? new Set(managedTypeKeys) : null;
      const rawTokens = panelsParam.split(",");
      const allPanels = parseParams(panelsParam);
      const rawTokenFor = new Map<string, string>();
      allPanels.forEach((panel, index) => {
        if (panel.typeKey) rawTokenFor.set(panel.typeKey, rawTokens[index]);
      });
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
      const noHydrator: string[] = [];
      panels.forEach((panel) => {
        const hydrator = getHydrator(panel.typeKey);
        const pending = {
          token: rawTokenFor.get(panel.typeKey) ?? panel.typeKey,
          tokenKey: panel.typeKey,
        };
        // An alias is judged by the key its window will publish; every other
        // key is its own canonical key.
        const canonicalKey = resolveCanonicalTypeKey(panel.typeKey);
        if (hydrator) {
          unresolvedTokens.current.set(canonicalKey, pending);
          hydrator(dispatch, panel.instanceId, panel.args || {});
        } else {
          // Law 4: the link named a window this build has no way to open. Keep
          // the address, say so out loud — never strip it on the next write.
          unresolvedTokens.current.set(canonicalKey, pending);
          noHydrator.push(panel.typeKey);
          console.warn(
            `[UrlPanelManager] No hydrator registered for panel type: ${panel.typeKey}`,
          );
        }
      });

      if (noHydrator.length > 0) {
        announceUnopenedWindows(noHydrator, announcedKeys.current, "no-hydrator");
      }
    }

    // Mark hydration complete so subsequent URL writes can begin
    dispatch(setHydrated());
  }, [searchParams, dispatch, managedTypeKeys]);

  // The notice deadline. Never gates a URL write — the token is preserved
  // whether this has fired or not; it only decides when a still-unopened
  // window stops being a silent wait.
  useEffect(() => {
    if (!isHydrated || unresolvedTokens.current.size === 0) return undefined;
    const timer = setTimeout(
      () => setNoticeDue(true),
      REGISTRATION_NOTICE_DEADLINE_MS,
    );
    return () => clearTimeout(timer);
  }, [isHydrated]);

  // 2. SYNCHRONIZATION (Redux -> URL)
  useEffect(() => {
    if (!isHydrated) return;

    // The SIGNAL, not a clock: a key leaves the unresolved set the moment its
    // window registers, however long that took.
    const observedTypeKeys = new Set(
      Object.values(entries).map((entry) =>
        resolveCanonicalTypeKey(entry.typeKey),
      ),
    );
    for (const typeKey of Array.from(unresolvedTokens.current.keys())) {
      if (observedTypeKeys.has(typeKey)) unresolvedTokens.current.delete(typeKey);
    }
    // The person is told about the key THEY pasted, never the canonical key
    // they have never seen.
    const unresolved = Array.from(unresolvedTokens.current.values()).map(
      (pending) => pending.tokenKey,
    );

    if (noticeDue && unresolved.length > 0) {
      announceUnopenedWindows(
        unresolved,
        announcedKeys.current,
        "never-registered",
      );
    }

    const currentParam = searchParams.get("panels") || "";
    // Windows that exist speak for themselves; windows that have not
    // registered keep their verbatim token. Nothing is ever dropped because a
    // timer ran out.
    const nextManagedParam = withUnresolvedTokens(
      serializeParams(entries, managedTypeKeys),
      Array.from(unresolvedTokens.current.values()).map(
        (pending) => pending.token,
      ),
    );
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
    noticeDue,
  ]);

  return null;
}
