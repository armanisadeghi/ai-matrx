"use client";

import React, { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { useOpenFile } from "../../hooks/useOpenFile";
import type { FilesystemNode } from "../../types";
import { FileIcon } from "../../styles/file-icon";
import { selectActiveTab } from "../../redux/tabsSlice";
import { selectExplorerRootOverride } from "../../redux/codeWorkspaceSlice";
import { FileTreeNode } from "./FileTreeNode";
import { useFileTreeExpansion } from "./useFileTreeExpansion";
import { extractErrorMessage } from "@/utils/errors";
import {
  FileTreeWatcherProvider,
  useDirectoryVersion,
} from "./FileTreeWatcher";

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_MAX_RESULTS = 200;

interface FileTreeProps {
  refreshKey?: number;
}

export const FileTree: React.FC<FileTreeProps> = ({ refreshKey = 0 }) => {
  const { filesystem } = useCodeWorkspace();
  const override = useAppSelector(selectExplorerRootOverride);
  const rootPath = override ?? filesystem.rootPath;

  return (
    <FileTreeWatcherProvider rootPath={rootPath}>
      <FileTreeBody rootPath={rootPath} refreshKey={refreshKey} />
    </FileTreeWatcherProvider>
  );
};

const FileTreeBody: React.FC<{ rootPath: string; refreshKey: number }> = ({
  rootPath,
  refreshKey,
}) => {
  const { filesystem } = useCodeWorkspace();
  const openFile = useOpenFile();
  const activeTab = useAppSelector(selectActiveTab);

  const { isExpanded, toggle } = useFileTreeExpansion([rootPath]);
  const [roots, setRoots] = useState<FilesystemNode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The root directory has its own watch version — when the parent of any
  // top-level entry changes (e.g. a new file was created at the root) we
  // refetch the root listing.
  const rootVersion = useDirectoryVersion(rootPath);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    filesystem
      .listChildren(rootPath)
      .then((list) => {
        if (!cancelled) setRoots(list);
      })
      .catch((err) => {
        if (!cancelled)
          setError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [filesystem, rootPath, refreshKey, rootVersion]);

  const handleOpen = (path: string) => {
    openFile(path).catch((err) => {
      setError(extractErrorMessage(err));
    });
  };

  // ── File-name search ────────────────────────────────────────────────────
  // Inline filter sitting above the tree. Empty query → render the normal
  // recursive tree. Non-empty → call `filesystem.searchPaths()` and render
  // a flat list of matching paths. Adapters without `searchPaths` get a
  // client-side substring filter over the currently-loaded root entries
  // so users still get *something* in mock mode. Real fuzzy matching is
  // server-side.
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<string[] | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  const debouncedQuery = useDebounced(query, SEARCH_DEBOUNCE_MS);
  const searchActive = debouncedQuery.trim().length > 0;
  const supportsServerSearch = !!filesystem.searchPaths;

  useEffect(() => {
    // Cancel any in-flight search when the query changes.
    searchAbortRef.current?.abort();
    searchAbortRef.current = null;
    if (!searchActive) {
      setSearchResults(null);
      setSearching(false);
      return undefined;
    }
    if (!filesystem.searchPaths) {
      // Client-side fallback: walk currently-loaded root names. Limited but
      // useful in mock mode.
      const q = debouncedQuery.toLowerCase();
      const hits = (roots ?? [])
        .map((n) => n.path)
        .filter((p) => p.toLowerCase().includes(q));
      setSearchResults(hits);
      setSearching(false);
      return undefined;
    }

    setSearching(true);
    const ac = new AbortController();
    searchAbortRef.current = ac;
    filesystem
      .searchPaths({
        pattern: debouncedQuery,
        fuzzy: true,
        maxResults: SEARCH_MAX_RESULTS,
      })
      .then((paths) => {
        if (ac.signal.aborted) return;
        setSearchResults(paths);
      })
      .catch((err) => {
        if (ac.signal.aborted) return;
        setError(extractErrorMessage(err));
        setSearchResults([]);
      })
      .finally(() => {
        if (!ac.signal.aborted) setSearching(false);
      });

    return () => ac.abort();
  }, [debouncedQuery, filesystem, roots, searchActive]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-7 shrink-0 items-center gap-1.5 border-b border-neutral-200 px-2 dark:border-neutral-800">
        <Search size={12} className="text-neutral-400 dark:text-neutral-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            supportsServerSearch
              ? "Search files by name…"
              : "Filter visible files…"
          }
          spellCheck={false}
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            title="Clear"
            className="flex h-4 w-4 items-center justify-center rounded-sm text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            <X size={11} />
          </button>
        )}
      </div>
      <div
        role="tree"
        aria-label="File tree"
        className="min-h-0 flex-1 overflow-y-auto py-1"
      >
        {error && (
          <div className="px-3 py-1 text-[11px] text-red-500">{error}</div>
        )}

        {searchActive ? (
          <SearchResults
            results={searchResults}
            searching={searching}
            onOpen={handleOpen}
            activePath={activeTab?.path ?? null}
          />
        ) : (
          <>
            {roots === null && !error && (
              <div className="px-3 py-1 text-[11px] text-neutral-500">
                Loading…
              </div>
            )}
            {roots?.map((node) => (
              <FileTreeNode
                key={node.path}
                node={node}
                depth={0}
                adapter={filesystem}
                isExpanded={isExpanded}
                onToggle={toggle}
                onOpenFile={handleOpen}
                activePath={activeTab?.path ?? null}
              />
            ))}
            {roots?.length === 0 && !error && (
              <div className="px-3 py-1 text-[11px] text-neutral-500">
                Empty directory
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Search results ────────────────────────────────────────────────────────

interface SearchResultsProps {
  results: string[] | null;
  searching: boolean;
  onOpen: (path: string) => void;
  activePath: string | null;
}

function basename(path: string): string {
  const idx = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return idx === -1 ? path : path.slice(idx + 1);
}

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  searching,
  onOpen,
  activePath,
}) => {
  if (searching && results === null) {
    return (
      <div className="px-3 py-1 text-[11px] text-neutral-500">Searching…</div>
    );
  }
  if (!results || results.length === 0) {
    return (
      <div className="px-3 py-1 text-[11px] text-neutral-500">
        No matches.
      </div>
    );
  }
  return (
    <ul role="list" className="py-0.5">
      {results.map((path) => {
        const name = basename(path);
        const isActive = activePath === path;
        return (
          <li key={path}>
            <button
              type="button"
              onClick={() => onOpen(path)}
              className={
                "flex w-full items-center gap-1.5 px-2 py-0.5 text-left text-[12px] hover:bg-neutral-100 dark:hover:bg-neutral-800 " +
                (isActive
                  ? "bg-blue-100/60 dark:bg-blue-900/30"
                  : "")
              }
              title={path}
            >
              <FileIcon name={name} kind="file" expanded={false} />
              <span className="truncate font-mono">{name}</span>
              <span className="ml-auto truncate text-[10px] text-neutral-400 dark:text-neutral-500">
                {path}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

// ─── Local debounce hook ───────────────────────────────────────────────────

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), ms);
    return () => window.clearTimeout(handle);
  }, [value, ms]);
  return debounced;
}
