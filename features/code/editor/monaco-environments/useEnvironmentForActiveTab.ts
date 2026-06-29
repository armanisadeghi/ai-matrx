"use client";

import { useEffect, useRef, useState } from "react";
import { loader } from "@monaco-editor/react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveTab } from "../../redux/tabsSlice";
import {
  activateEnvironment,
  applyEnvironmentOptions,
  deactivateEnvironment,
  resolveEnvironmentForTab,
} from "./registry";
import type { MonacoEnvironmentDescriptor, MonacoNamespaceLike } from "./types";

/**
 * Activates the appropriate Monaco type-environment for the currently
 * active editor tab. Refcounted — switching between two tabs that share
 * an env (e.g. two `prompt-app:*` tabs) is free; switching from one env
 * to another tears down the previous env's libs once the last tab
 * leaves.
 *
 * The hook also exposes the active env descriptor so the editor status
 * bar can render it.
 *
 * Mount this once at the editor area; do not mount per-tab.
 */
export function useEnvironmentForActiveTab(opts: {
  /** When false, the hook becomes a no-op (used for the user-pref toggle). */
  enabled?: boolean;
} = {}): {
  activeEnvironment: MonacoEnvironmentDescriptor | null;
} {
  const enabled = opts.enabled ?? true;
  const activeTab = useAppSelector(selectActiveTab);
  const [active, setActive] = useState<MonacoEnvironmentDescriptor | null>(
    null,
  );
  const lastActivatedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      // If disabled mid-session, drop the previously activated env.
      if (lastActivatedRef.current) {
        loader.init().then((monaco) => {
          deactivateEnvironment(
            monaco as unknown as MonacoNamespaceLike,
            lastActivatedRef.current!,
          );
          applyEnvironmentOptions(
            monaco as unknown as MonacoNamespaceLike,
            null,
          );
          lastActivatedRef.current = null;
          setActive(null);
        });
      }
      return undefined;
    }

    const env = resolveEnvironmentForTab(activeTab);
    const nextId = env?.id ?? null;
    const prevId = lastActivatedRef.current;

    if (prevId === nextId) {
      // Active env unchanged; nothing to do (libs already mounted, options
      // already applied).
      return undefined;
    }

    let cancelled = false;

    (async () => {
      const monacoModule = await loader.init();
      if (cancelled) return;
      const monaco = monacoModule as unknown as MonacoNamespaceLike;

      if (nextId) {
        await activateEnvironment(monaco, nextId);
      }
      if (cancelled) return;
      applyEnvironmentOptions(monaco, env);
      if (prevId) {
        deactivateEnvironment(monaco, prevId);
      }
      lastActivatedRef.current = nextId;
      setActive(env);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, enabled]);

  // Drop the last activation when the hook unmounts so a remount
  // (e.g. fast-refresh) doesn't double-count.
  useEffect(() => {
    return () => {
      const prev = lastActivatedRef.current;
      if (!prev) return;
      loader.init().then((monaco) => {
        deactivateEnvironment(
          monaco as unknown as MonacoNamespaceLike,
          prev,
        );
        applyEnvironmentOptions(
          monaco as unknown as MonacoNamespaceLike,
          null,
        );
      });
      lastActivatedRef.current = null;
    };
  }, []);

  return { activeEnvironment: active };
}
