"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Loader2,
  Regex,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useCodeWorkspace } from "../../CodeWorkspaceProvider";
import { useOpenFile } from "../../hooks/useOpenFile";
import type { FilesystemNode, FilesystemSearchHit } from "../../types";
import { SidePanelHeader } from "../SidePanelChrome";

interface SearchPanelProps {
  className?: string;
}

interface Match {
  path: string;
  line: number;
  text: string;
}

type SearchMode = "content" | "paths";

const MAX_FILES = 400;
const MAX_FILE_SIZE = 512 * 1024;
const MAX_RESULTS = 1000;
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
]);

export const SearchPanel: React.FC<SearchPanelProps> = ({ className }) => {
  const { filesystem } = useCodeWorkspace();
  const openFile = useOpenFile();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("content");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [pathResults, setPathResults] = useState<string[]>([]);
  const [scannedFiles, setScannedFiles] = useState(0);
  const [searching, setSearching] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const activeRun = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const supportsServerContent = typeof filesystem.searchContent === "function";
  const supportsServerPaths = typeof filesystem.searchPaths === "function";

  // ── Server-side content search (ripgrep) ────────────────────────────────
  const runServerContentSearch = useCallback(
    async (q: string, runId: number) => {
      const adapter = filesystem;
      if (!adapter.searchContent) return;

      const controller = new AbortController();
      abortRef.current?.abort();
      abortRef.current = controller;

      const hits: Match[] = [];
      try {
        const result = await adapter.searchContent({
          query: q,
          regex,
          caseSensitive,
          excludeGlobs: Array.from(SKIP_DIRS).map((d) => `**/${d}/**`),
          maxResults: MAX_RESULTS,
          signal: controller.signal,
          onHit: (hit: FilesystemSearchHit) => {
            if (runId !== activeRun.current) return;
            hits.push({ path: hit.path, line: hit.line, text: hit.text });
          },
        });
        if (runId === activeRun.current) {
          setMatches(hits);
          setTruncated(result.truncated);
          setSearching(false);
        }
      } catch (err) {
        if (runId !== activeRun.current) return;
        if ((err as Error).name === "AbortError") return;
        setError((err as Error).message);
        setSearching(false);
      }
    },
    [filesystem, caseSensitive, regex],
  );

  // ── Client-side fallback walker (only when adapter has no searchContent) ─
  const runWalkerSearch = useCallback(
    async (q: string, runId: number) => {
      const needle = caseSensitive ? q : q.toLowerCase();
      const hits: Match[] = [];
      let scanned = 0;

      const walk = async (dir: string): Promise<FilesystemNode[]> => {
        try {
          return await filesystem.listChildren(dir);
        } catch {
          return [];
        }
      };

      const stack: string[] = [filesystem.rootPath];
      while (stack.length > 0 && runId === activeRun.current) {
        const current = stack.shift()!;
        const entries = await walk(current);
        for (const entry of entries) {
          if (runId !== activeRun.current) break;
          if (entry.kind === "directory") {
            if (SKIP_DIRS.has(entry.name)) continue;
            stack.push(entry.path);
            continue;
          }
          if (scanned >= MAX_FILES) continue;
          if (entry.size && entry.size > MAX_FILE_SIZE) continue;
          scanned++;
          try {
            const content = await filesystem.readFile(entry.path);
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const lineText = lines[i];
              const hay = caseSensitive ? lineText : lineText.toLowerCase();
              if (hay.includes(needle)) {
                hits.push({ path: entry.path, line: i + 1, text: lineText });
              }
            }
            if (runId === activeRun.current) {
              setMatches([...hits]);
              setScannedFiles(scanned);
            }
          } catch {
            continue;
          }
        }
      }

      if (runId === activeRun.current) {
        setSearching(false);
        setTruncated(scanned >= MAX_FILES);
      }
    },
    [filesystem, caseSensitive],
  );

  // ── Server-side path search (fd) ─────────────────────────────────────────
  const runPathSearch = useCallback(
    async (q: string, runId: number) => {
      const adapter = filesystem;
      if (!adapter.searchPaths) {
        setError("Path search isn't available for this workspace.");
        setSearching(false);
        return;
      }
      try {
        const paths = await adapter.searchPaths({
          pattern: q,
          fuzzy: true,
          maxResults: 200,
        });
        if (runId !== activeRun.current) return;
        setPathResults(paths);
        setSearching(false);
        setTruncated(paths.length >= 200);
      } catch (err) {
        if (runId !== activeRun.current) return;
        setError((err as Error).message);
        setSearching(false);
      }
    },
    [filesystem],
  );

  const runSearch = useCallback(
    async (q: string) => {
      const trimmed = q.trim();
      setError(null);
      setMatches([]);
      setPathResults([]);
      setScannedFiles(0);
      setTruncated(false);
      if (!trimmed) {
        abortRef.current?.abort();
        return;
      }
      const runId = ++activeRun.current;
      setSearching(true);

      if (mode === "paths") {
        await runPathSearch(trimmed, runId);
      } else if (supportsServerContent) {
        await runServerContentSearch(trimmed, runId);
      } else {
        await runWalkerSearch(trimmed, runId);
      }
    },
    [
      mode,
      supportsServerContent,
      runServerContentSearch,
      runWalkerSearch,
      runPathSearch,
    ],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      void runSearch(query);
    }, 200);
    return () => clearTimeout(id);
  }, [query, runSearch]);

  // Cancel any in-flight server search on unmount.
  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      if (!map.has(m.path)) map.set(m.path, []);
      map.get(m.path)!.push(m);
    }
    return Array.from(map.entries());
  }, [matches]);

  const toggleFile = (path: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const statusLine = (() => {
    if (searching) {
      return (
        <span className="inline-flex items-center gap-1">
          <Loader2 size={10} className="animate-spin" />
          {mode === "paths"
            ? "matching paths…"
            : supportsServerContent
              ? "searching…"
              : `${scannedFiles} files scanned`}
        </span>
      );
    }
    if (mode === "paths") {
      return pathResults.length > 0
        ? `${pathResults.length} path${pathResults.length === 1 ? "" : "s"}${truncated ? " (truncated)" : ""}`
        : null;
    }
    if (matches.length === 0) return null;
    return `${matches.length} result${matches.length === 1 ? "" : "s"} in ${grouped.length} file${
      grouped.length === 1 ? "" : "s"
    }${truncated ? " (truncated)" : ""}`;
  })();

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <SidePanelHeader title="Search" subtitle={filesystem.label} />
      <p className="truncate px-2 py-1 text-xs text-muted-foreground" title={filesystem.rootPath}>Search in {filesystem.rootPath}</p>
      <div className="flex flex-col gap-1.5 border-b border-neutral-200 p-2 dark:border-neutral-800">
        <div className="flex h-6 items-center gap-1 rounded-sm bg-neutral-100 p-0.5 text-[10px] dark:bg-neutral-900">
          <ModeButton
            active={mode === "content"}
            onClick={() => setMode("content")}
            label="Text"
            icon={<Search size={10} />}
          />
          <ModeButton
            active={mode === "paths"}
            onClick={() => setMode("paths")}
            label="Paths"
            icon={<FileText size={10} />}
            disabled={!supportsServerPaths}
          />
        </div>
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "paths" ? "Find file by name…" : "Search workspace"
            }
            className="h-7 w-full rounded-sm border border-neutral-300 bg-white pl-6 pr-6 text-[12px] outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
              aria-label="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {mode === "content" && (
          <div className="flex items-center justify-between text-[10px] text-neutral-500 dark:text-neutral-400">
            <div className="flex items-center gap-2">
              <label className="flex min-h-11 items-center gap-1 cursor-pointer md:min-h-0">
                <Checkbox
                  aria-label="Match case"
                  checked={caseSensitive}
                  onCheckedChange={(v) => setCaseSensitive(v === true)}
                  className="h-3 w-3 shrink-0"
                />
                Aa
              </label>
              {supportsServerContent && (
                <label className="flex min-h-11 items-center gap-1 cursor-pointer md:min-h-0">
                  <Checkbox
                    aria-label="Use regular expression"
                    checked={regex}
                    onCheckedChange={(v) => setRegex(v === true)}
                    className="h-3 w-3 shrink-0"
                  />
                  <Regex size={10} />
                </label>
              )}
            </div>
            <span>{statusLine}</span>
          </div>
        )}
        {mode === "paths" && (
          <div className="flex items-center justify-end text-[10px] text-neutral-500 dark:text-neutral-400">
            <span>{statusLine}</span>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {error && <div className="p-3 text-[11px] text-red-500">{error}</div>}
        {!query && !error && (
          <div className="p-3 text-[11px] text-neutral-500">
            {mode === "paths"
              ? "Type a fragment to find files by path."
              : "Type a query to search across the active workspace."}
          </div>
        )}
        {query &&
          !searching &&
          !error &&
          mode === "content" &&
          matches.length === 0 && (
            <div className="p-3 text-[11px] text-neutral-500">
              No matches found.
            </div>
          )}
        {query &&
          !searching &&
          !error &&
          mode === "paths" &&
          pathResults.length === 0 && (
            <div className="p-3 text-[11px] text-neutral-500">
              No paths matched.
            </div>
          )}
        {mode === "paths" &&
          pathResults.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => void openFile(path)}
              className="flex w-full items-center gap-2 px-2 py-1 text-left text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
            >
              <FileText size={11} className="shrink-0 text-neutral-500" />
              <span className="truncate text-neutral-700 dark:text-neutral-200">
                {path.split("/").pop() ?? path}
              </span>
              <span className="ml-auto truncate text-[10px] text-neutral-400">
                {path}
              </span>
            </button>
          ))}
        {mode === "content" &&
          grouped.map(([path, items]) => {
            const isCollapsed = collapsed.has(path);
            const name = path.split("/").pop() ?? path;
            return (
              <div
                key={path}
                className="border-b border-neutral-100 dark:border-neutral-900"
              >
                <button
                  type="button"
                  onClick={() => toggleFile(path)}
                  className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                >
                  {isCollapsed ? (
                    <ChevronRight size={10} />
                  ) : (
                    <ChevronDown size={10} />
                  )}
                  <span className="truncate font-medium text-neutral-700 dark:text-neutral-200">
                    {name}
                  </span>
                  <span className="ml-auto shrink-0 rounded bg-neutral-200 px-1 text-[9px] text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                    {items.length}
                  </span>
                </button>
                {!isCollapsed &&
                  items.map((m, idx) => (
                    <button
                      key={`${path}:${m.line}:${idx}`}
                      type="button"
                      onClick={() => void openFile(m.path)}
                      className="flex w-full items-center gap-2 px-4 py-0.5 text-left font-mono text-[11px] hover:bg-neutral-100 dark:hover:bg-neutral-800/60"
                    >
                      <span className="shrink-0 tabular-nums text-neutral-500">
                        {m.line}
                      </span>
                      <span className="truncate text-neutral-700 dark:text-neutral-300">
                        {m.text.length > 120
                          ? `${m.text.slice(0, 120).trimStart()}…`
                          : m.text.trimStart()}
                      </span>
                    </button>
                  ))}
              </div>
            );
          })}
      </div>
    </div>
  );
};

const ModeButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
}> = ({ active, onClick, label, icon, disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "flex h-5 flex-1 items-center justify-center gap-1 rounded-sm transition-colors",
      active
        ? "bg-white text-neutral-900 shadow-sm dark:bg-neutral-700 dark:text-neutral-100"
        : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200",
      disabled && "cursor-not-allowed opacity-40 hover:text-neutral-500",
    )}
  >
    {icon}
    {label}
  </button>
);
