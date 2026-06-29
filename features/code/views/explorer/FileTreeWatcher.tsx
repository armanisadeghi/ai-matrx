"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import type { FilesystemWatchEvent } from "../../types";

/**
 * Per-directory invalidation channel for the file tree.
 *
 * The root <FileTree> subscribes to `filesystem.watch?(rootPath)` and bumps
 * a version counter for every changed parent directory. Each <FileTreeNode>
 * reads its own path's version via `useDirectoryVersion(path)` and refetches
 * its children when the version changes.
 *
 * Adapters that don't expose `watch` (Mock) simply never bump anything; the
 * tree still works via explicit refresh actions.
 */

interface InvalidationCtx {
  /** Returns the current version of the given directory. */
  getVersion: (path: string) => number;
  /** Subscribe to invalidations for a directory; returns an unsubscribe. */
  subscribe: (path: string, listener: () => void) => () => void;
  /** Force-bump the version of a directory (used after explicit refreshes). */
  invalidate: (path: string) => void;
}

const Ctx = createContext<InvalidationCtx | null>(null);

export const FileTreeWatcherProvider: React.FC<{
  rootPath: string;
  children: React.ReactNode;
}> = ({ rootPath, children }) => {
  const { filesystem } = useCodeWorkspace();
  const versionsRef = useRef<Map<string, number>>(new Map());
  const listenersRef = useRef<Map<string, Set<() => void>>>(new Map());
  // Bumped on every observed event so contexts that capture `getVersion`
  // re-render. The actual per-path versions live in the ref above so they
  // survive across renders cheaply.
  const [, setTick] = useState(0);

  const invalidate = useCallback((path: string) => {
    const versions = versionsRef.current;
    versions.set(path, (versions.get(path) ?? 0) + 1);
    const listeners = listenersRef.current.get(path);
    if (listeners) {
      for (const listener of listeners) listener();
    }
    setTick((t) => t + 1);
  }, []);

  const getVersion = useCallback((path: string) => {
    return versionsRef.current.get(path) ?? 0;
  }, []);

  const subscribe = useCallback((path: string, listener: () => void) => {
    let set = listenersRef.current.get(path);
    if (!set) {
      set = new Set();
      listenersRef.current.set(path, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) listenersRef.current.delete(path);
    };
  }, []);

  // ── live watcher ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!filesystem.watch) return undefined;
    const handler = (ev: FilesystemWatchEvent) => {
      // Invalidate the parent directory of the affected path so the
      // matching <FileTreeNode> reloads its children. For renames we
      // also invalidate the source's parent so the old entry disappears.
      const targetParent = parentOf(ev.path);
      if (targetParent) invalidate(targetParent);
      const fromParent = ev.fromPath ? parentOf(ev.fromPath) : null;
      if (fromParent && fromParent !== targetParent) invalidate(fromParent);
    };
    const dispose = filesystem.watch(rootPath, handler);
    return () => {
      try {
        dispose();
      } catch {
        /* noop */
      }
    };
  }, [filesystem, rootPath, invalidate]);

  const value = useMemo<InvalidationCtx>(
    () => ({ getVersion, subscribe, invalidate }),
    [getVersion, subscribe, invalidate],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

/** Subscribe to a directory's version. Components re-render when it bumps. */
export function useDirectoryVersion(path: string): number {
  const ctx = useContext(Ctx);
  const [version, setVersion] = useState(() => ctx?.getVersion(path) ?? 0);
  useEffect(() => {
    if (!ctx) return undefined;
    setVersion(ctx.getVersion(path));
    return ctx.subscribe(path, () => {
      setVersion(ctx.getVersion(path));
    });
  }, [ctx, path]);
  return version;
}

/** Manual invalidation hook — used by mutation actions (create, rename, …). */
export function useInvalidateDirectory() {
  const ctx = useContext(Ctx);
  return useCallback(
    (path: string) => {
      ctx?.invalidate(path);
    },
    [ctx],
  );
}

function parentOf(path: string): string | null {
  if (!path) return null;
  const idx = path.lastIndexOf("/");
  if (idx <= 0) return "/";
  return path.slice(0, idx);
}
