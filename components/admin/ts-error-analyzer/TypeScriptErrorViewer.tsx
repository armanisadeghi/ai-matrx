"use client";
import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { supabase } from "@/utils/supabase/client";

// Copy to clipboard icon
const CopyIcon = ({ className = "" }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
  </svg>
);

interface TypeScriptError {
  file: string | null;
  line: number | null;
  column: number | null;
  message: string;
  code: number;
}

interface CheckRun {
  id: string;
  ran_at: string;
  codebase_path: string;
  tsconfig: string;
  status: string;
  error_count: number;
  duration_ms: number | null;
  message: string | null;
}

interface SortConfig {
  key: keyof TypeScriptError | null;
  direction: "ascending" | "descending";
}

const PATH_STORAGE_KEY = "ts-error-analyzer:codebase-path";
const MAX_ERROR_LENGTH = 500;

// Coerce a jsonb payload from the DB into the strict error shape.
function normalizeErrors(raw: unknown): TypeScriptError[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((e) => {
    const r = (e ?? {}) as Record<string, unknown>;
    return {
      file: typeof r.file === "string" ? r.file : null,
      line: typeof r.line === "number" ? r.line : null,
      column: typeof r.column === "number" ? r.column : null,
      message:
        typeof r.message === "string" ? r.message : String(r.message ?? ""),
      code: typeof r.code === "number" ? r.code : 0,
    };
  });
}

const TypeScriptErrorViewer: React.FC = () => {
  const [allErrors, setAllErrors] = useState<TypeScriptError[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [expandedError, setExpandedError] = useState<{
    message: string;
    index: number;
  } | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [errorsPerPage, setErrorsPerPage] = useState<number>(25);
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: "ascending",
  });
  const [filterText, setFilterText] = useState<string>("");
  const [fileFilter, setFileFilter] = useState<string>("");
  const [codeFilter, setCodeFilter] = useState<string>("");
  const [directoryFilter, setDirectoryFilter] = useState<string>("");
  const [copiedItem, setCopiedItem] = useState<string | null>(null);
  const [showCopySuccessToast, setShowCopySuccessToast] =
    useState<boolean>(false);

  const [codebasePath, setCodebasePath] = useState<string>("");
  const [latestRun, setLatestRun] = useState<CheckRun | null>(null);
  const [recentRuns, setRecentRuns] = useState<CheckRun[]>([]);

  // Load the most-recent run (and a short history) directly from the DB.
  const loadFromDb = useCallback(async (selectRunId?: string) => {
    setLoading(true);
    try {
      const { data, error: dbError } = await supabase
        .from("ts_check_runs")
        .select(
          "id, ran_at, codebase_path, tsconfig, status, error_count, duration_ms, message, errors",
        )
        .order("ran_at", { ascending: false })
        .limit(25);

      if (dbError) throw new Error(dbError.message);

      const rows = data ?? [];
      const toMeta = (r: (typeof rows)[number]): CheckRun => ({
        id: r.id,
        ran_at: r.ran_at,
        codebase_path: r.codebase_path,
        tsconfig: r.tsconfig,
        status: r.status,
        error_count: r.error_count,
        duration_ms: r.duration_ms,
        message: r.message,
      });
      setRecentRuns(rows.map(toMeta));

      const selected = selectRunId
        ? rows.find((r) => r.id === selectRunId)
        : rows[0];
      if (selected) {
        setLatestRun(toMeta(selected));
        setAllErrors(normalizeErrors(selected.errors));
        setError(
          selected.status === "error"
            ? selected.message || "Last run failed."
            : null,
        );
      } else {
        setLatestRun(null);
        setAllErrors([]);
        setError(null);
      }
    } catch (err) {
      setError(
        `Error loading runs from the database: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Prefill the codebase path: saved value first, else the server's default.
  const initPath = useCallback(async () => {
    const saved =
      typeof window !== "undefined"
        ? window.localStorage.getItem(PATH_STORAGE_KEY)
        : null;
    if (saved) {
      setCodebasePath(saved);
      return;
    }
    try {
      const res = await fetch("/api/admin/typescript-errors/regenerate", {
        method: "GET",
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.defaultPath) setCodebasePath(json.defaultPath);
      }
    } catch {
      /* non-fatal — user can type the path */
    }
  }, []);

  useEffect(() => {
    initPath();
    loadFromDb();
  }, [initPath, loadFromDb]);

  const persistPath = (value: string) => {
    setCodebasePath(value);
    if (typeof window !== "undefined")
      window.localStorage.setItem(PATH_STORAGE_KEY, value);
  };

  // Run the check against the configured codebase path, then reload from the DB.
  const runCheck = async () => {
    if (!codebasePath.trim()) {
      setError("Enter the absolute path to the codebase directory first.");
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/typescript-errors/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codebasePath: codebasePath.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          json?.error || json?.details || "Failed to run the type check",
        );
      }
      if (typeof window !== "undefined")
        window.localStorage.setItem(PATH_STORAGE_KEY, codebasePath.trim());
      await loadFromDb(json?.run?.id);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unknown error running the type check",
      );
      console.error("Run error:", err);
    } finally {
      setRunning(false);
    }
  };

  const truncateMessage = (message: string) => {
    if (message.length <= MAX_ERROR_LENGTH) return message;
    return `${message.substring(0, MAX_ERROR_LENGTH)}...`;
  };

  const requestSort = (key: keyof TypeScriptError) => {
    let direction: "ascending" | "descending" = "ascending";
    if (sortConfig.key === key && sortConfig.direction === "ascending") {
      direction = "descending";
    }
    setSortConfig({ key, direction });
  };

  // Apply filtering and sorting
  const filteredAndSortedErrors = useMemo(() => {
    let result = [...allErrors];

    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      result = result.filter(
        (err) =>
          err.message?.toLowerCase().includes(lowerFilter) ||
          err.file?.toLowerCase().includes(lowerFilter),
      );
    }

    if (fileFilter) {
      const lowerFileFilter = fileFilter.toLowerCase();
      result = result.filter((err) =>
        err.file?.toLowerCase().includes(lowerFileFilter),
      );
    }

    if (directoryFilter) {
      result = result.filter((err) => err.file?.startsWith(directoryFilter));
    }

    if (codeFilter) {
      result = result.filter((err) => err.code.toString().includes(codeFilter));
    }

    if (sortConfig.key) {
      result.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];

        if (aValue === null)
          return sortConfig.direction === "ascending" ? -1 : 1;
        if (bValue === null)
          return sortConfig.direction === "ascending" ? 1 : -1;

        if (typeof aValue === "string" && typeof bValue === "string") {
          return sortConfig.direction === "ascending"
            ? aValue.localeCompare(bValue)
            : bValue.localeCompare(aValue);
        }

        if (aValue < bValue)
          return sortConfig.direction === "ascending" ? -1 : 1;
        if (aValue > bValue)
          return sortConfig.direction === "ascending" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [
    allErrors,
    filterText,
    fileFilter,
    directoryFilter,
    codeFilter,
    sortConfig,
  ]);

  const uniqueFiles = useMemo(() => {
    const fileSet = new Set<string>();
    allErrors.forEach((err) => {
      if (err.file) fileSet.add(err.file);
    });
    return Array.from(fileSet).sort();
  }, [allErrors]);

  const uniqueDirectories = useMemo(() => {
    const dirSet = new Set<string>();
    allErrors.forEach((err) => {
      if (err.file) {
        const lastSlashIndex = Math.max(
          err.file.lastIndexOf("/"),
          err.file.lastIndexOf("\\"),
        );
        if (lastSlashIndex > 0) {
          dirSet.add(err.file.substring(0, lastSlashIndex));
        }
      }
    });
    return Array.from(dirSet).sort();
  }, [allErrors]);

  const uniqueCodes = useMemo(() => {
    const codeSet = new Set<number>();
    allErrors.forEach((err) => {
      codeSet.add(err.code);
    });
    return Array.from(codeSet).sort((a, b) => a - b);
  }, [allErrors]);

  const copyToClipboard = (text: string, item: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedItem(item);
        setShowCopySuccessToast(true);
        setTimeout(() => {
          setShowCopySuccessToast(false);
          setCopiedItem(null);
        }, 2000);
      })
      .catch((err) => {
        console.error("Failed to copy text: ", err);
      });
  };

  const copyAllErrorCodes = () => {
    const codesList = uniqueCodes.map((code) => `TS${code}`).join("\n");
    copyToClipboard(codesList, "all-codes");
  };

  const copyRowData = (err: TypeScriptError) => {
    const location = err.line
      ? `Line ${err.line}${err.column ? `, Column ${err.column}` : ""}`
      : "N/A";
    const rowText = `File: ${err.file || "Unknown"}\nLocation: ${location}\nCode: TS${err.code}\nMessage: ${err.message}`;
    copyToClipboard(rowText, `row-${err.file}-${err.line}`);
  };

  const indexOfLastError = currentPage * errorsPerPage;
  const indexOfFirstError = indexOfLastError - errorsPerPage;
  const currentErrors = filteredAndSortedErrors.slice(
    indexOfFirstError,
    indexOfLastError,
  );
  const totalPages = Math.ceil(filteredAndSortedErrors.length / errorsPerPage);

  const paginate = (pageNumber: number) => setCurrentPage(pageNumber);

  const clearFilters = () => {
    setFilterText("");
    setDirectoryFilter("");
    setCodeFilter("");
    setSortConfig({ key: null, direction: "ascending" });
  };

  const getSortIndicator = (column: keyof TypeScriptError) => {
    if (sortConfig.key !== column) return null;
    return sortConfig.direction === "ascending" ? " ↑" : " ↓";
  };

  const formatWhen = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <div className="p-4 bg-slate-100 dark:bg-slate-900 min-h-dvh text-slate-800 dark:text-slate-200 w-full">
      <div className="w-full">
        <div className="flex flex-col gap-1 mb-4">
          <h1 className="text-2xl font-bold">TypeScript Errors</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Runs the type check against the codebase on the machine hosting this
            app, writes the results to the database, then displays the database
            as the source of truth.
          </p>
        </div>

        {/* Run control panel */}
        <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-md mb-4">
          <label className="block text-sm font-medium mb-1">
            Codebase directory (absolute path)
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={codebasePath}
              onChange={(e) => persistPath(e.target.value)}
              placeholder="/Users/you/code/matrx-frontend"
              spellCheck={false}
              className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-md font-mono text-sm
                        bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
              style={{ fontSize: 16 }}
            />
            <button
              onClick={runCheck}
              disabled={running}
              className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
            >
              {running ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Running type check…
                </>
              ) : (
                "Run type check"
              )}
            </button>
            <button
              onClick={() => loadFromDb()}
              disabled={loading || running}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 rounded-md
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            >
              Reload from DB
            </button>
          </div>

          {/* Run metadata + history */}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
            {latestRun ? (
              <>
                <span>
                  Showing run from{" "}
                  <span className="font-medium text-slate-800 dark:text-slate-200">
                    {formatWhen(latestRun.ran_at)}
                  </span>
                </span>
                <span>·</span>
                <span>{latestRun.error_count} errors</span>
                {latestRun.duration_ms != null && (
                  <>
                    <span>·</span>
                    <span>{(latestRun.duration_ms / 1000).toFixed(1)}s</span>
                  </>
                )}
                <span>·</span>
                <span className="font-mono">{latestRun.tsconfig}</span>
                <span>·</span>
                <span
                  className={
                    latestRun.status === "error"
                      ? "text-red-500"
                      : "text-green-600 dark:text-green-400"
                  }
                >
                  {latestRun.status}
                </span>
                {recentRuns.length > 1 && (
                  <select
                    value={latestRun.id}
                    onChange={(e) => loadFromDb(e.target.value)}
                    className="ml-auto p-1 border border-slate-300 dark:border-slate-600 rounded-md
                              bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-xs"
                  >
                    {recentRuns.map((r) => (
                      <option key={r.id} value={r.id}>
                        {formatWhen(r.ran_at)} — {r.error_count} errors (
                        {r.status})
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <span>
                No runs yet. Enter the codebase path and click “Run type check”.
              </span>
            )}
          </div>
        </div>

        {loading && allErrors.length === 0 ? (
          <div className="flex justify-center items-center p-12">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-lg">Loading…</span>
          </div>
        ) : (
          <>
            {error && (
              <div className="p-4 mb-6 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 whitespace-pre-wrap">
                {error}
              </div>
            )}

            {!loading && allErrors.length === 0 && !error && latestRun && (
              <div className="p-4 mb-6 bg-green-100 dark:bg-green-900/20 border border-green-300 dark:border-green-800 rounded-md text-green-700 dark:text-green-300">
                No TypeScript errors found.
              </div>
            )}

            {allErrors.length > 0 && (
              <>
                {/* Filters */}
                <div className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-md mb-4">
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold mb-2">Filters</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Search
                        </label>
                        <input
                          type="text"
                          value={filterText}
                          onChange={(e) => {
                            setFilterText(e.target.value);
                            setCurrentPage(1);
                          }}
                          placeholder="Search messages or files..."
                          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md 
                                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Directory
                        </label>
                        <select
                          value={directoryFilter}
                          onChange={(e) => {
                            setDirectoryFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md
                                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">All Directories</option>
                          {uniqueDirectories.map((dir) => (
                            <option key={dir} value={dir}>
                              {dir}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          File
                        </label>
                        <select
                          value={fileFilter}
                          onChange={(e) => {
                            setFileFilter(e.target.value);
                            setCurrentPage(1);
                          }}
                          className="w-full p-2 border border-slate-300 dark:border-slate-600 rounded-md
                                    bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        >
                          <option value="">All Files</option>
                          {uniqueFiles.map((file) => (
                            <option key={file} value={file}>
                              {file}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">
                          Error Code
                        </label>
                        <div className="flex">
                          <select
                            value={codeFilter}
                            onChange={(e) => {
                              setCodeFilter(e.target.value);
                              setCurrentPage(1);
                            }}
                            className="flex-1 p-2 border border-slate-300 dark:border-slate-600 rounded-l-md
                                      bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">All Codes</option>
                            {uniqueCodes.map((code) => (
                              <option key={code} value={code.toString()}>
                                TS{code}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={copyAllErrorCodes}
                            title="Copy all error codes"
                            className="flex items-center justify-center px-2 border border-l-0 border-slate-300 dark:border-slate-600 rounded-r-md
                                     bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300"
                          >
                            <CopyIcon />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <button
                      onClick={clearFilters}
                      className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 
                               rounded-md text-sm transition-colors"
                    >
                      Clear Filters
                    </button>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      Found {filteredAndSortedErrors.length} of{" "}
                      {allErrors.length} errors
                    </div>
                  </div>
                </div>

                {/* Error Table */}
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow-md overflow-auto mb-4 max-h-[600px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white dark:bg-slate-800 z-10">
                      <TableRow className="border-b border-slate-200 dark:border-slate-700">
                        <TableHead
                          className="text-slate-700 dark:text-slate-300 cursor-pointer bg-white dark:bg-slate-800"
                          onClick={() => requestSort("file")}
                        >
                          File {getSortIndicator("file")}
                        </TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800">
                          Location
                        </TableHead>
                        <TableHead
                          className="text-slate-700 dark:text-slate-300 cursor-pointer bg-white dark:bg-slate-800"
                          onClick={() => requestSort("code")}
                        >
                          Error Code {getSortIndicator("code")}
                        </TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800">
                          Message
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentErrors.map((err, index) => (
                        <TableRow
                          key={indexOfFirstError + index}
                          className="border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 relative group"
                        >
                          <TableCell className="font-medium">
                            <div className="group flex items-center">
                              <span className="mr-2">
                                {err.file || "Unknown"}
                              </span>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    err.file || "Unknown",
                                    `file-${index}`,
                                  )
                                }
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy file path"
                              >
                                <CopyIcon />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="group flex items-center">
                              <span className="mr-2">
                                {err.line ? `Line ${err.line}` : "N/A"}
                                {err.line && err.column
                                  ? `, Column ${err.column}`
                                  : ""}
                              </span>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    `${err.line ? `Line ${err.line}` : "N/A"}${err.line && err.column ? `, Column ${err.column}` : ""}`,
                                    `loc-${index}`,
                                  )
                                }
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy location"
                              >
                                <CopyIcon />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="group flex items-center">
                              <span className="mr-2">TS{err.code}</span>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    `TS${err.code}`,
                                    `code-${index}`,
                                  )
                                }
                                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Copy error code"
                              >
                                <CopyIcon />
                              </button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="group">
                              <div className="flex justify-between">
                                <p className="mr-2">
                                  {truncateMessage(err.message)}
                                </p>
                                <button
                                  onClick={() =>
                                    copyToClipboard(err.message, `msg-${index}`)
                                  }
                                  className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2"
                                  title="Copy message"
                                >
                                  <CopyIcon />
                                </button>
                              </div>
                              <div className="flex justify-between items-center mt-1">
                                {err.message.length > MAX_ERROR_LENGTH && (
                                  <button
                                    onClick={() =>
                                      setExpandedError({
                                        message: err.message,
                                        index: indexOfFirstError + index,
                                      })
                                    }
                                    className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
                                  >
                                    Show full message
                                  </button>
                                )}
                                <button
                                  onClick={() => copyRowData(err)}
                                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 text-sm opacity-0 group-hover:opacity-100 transition-opacity ml-auto"
                                  title="Copy all row data"
                                >
                                  Copy row
                                </button>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex justify-between items-center">
                    <div>
                      <select
                        value={errorsPerPage}
                        onChange={(e) => {
                          setErrorsPerPage(Number(e.target.value));
                          setCurrentPage(1);
                        }}
                        className="p-2 border border-slate-300 dark:border-slate-600 rounded-md
                                 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                      >
                        <option value={10}>10 per page</option>
                        <option value={25}>25 per page</option>
                        <option value={50}>50 per page</option>
                        <option value={100}>100 per page</option>
                      </select>
                    </div>

                    <div className="flex space-x-2">
                      <button
                        onClick={() => paginate(Math.max(1, currentPage - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 
                                 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Previous
                      </button>

                      <div className="flex items-center px-2">
                        Page {currentPage} of {totalPages}
                      </div>

                      <button
                        onClick={() =>
                          paginate(Math.min(totalPages, currentPage + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 
                                 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Full error message overlay */}
      {expandedError && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
          onClick={() => setExpandedError(null)}
        >
          <div
            className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg max-w-3xl w-full max-h-[80dvh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold">
                Error Details{" "}
                {allErrors[expandedError.index]?.file &&
                  `(${allErrors[expandedError.index].file})`}
              </h3>
              <div className="flex">
                <button
                  onClick={() =>
                    copyToClipboard(expandedError.message, "expanded-error")
                  }
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 mr-2"
                  title="Copy full error message"
                >
                  <CopyIcon />
                </button>
                <button
                  onClick={() => setExpandedError(null)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            </div>
            <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-md overflow-auto whitespace-pre-wrap font-mono text-sm">
              {expandedError.message}
            </div>
          </div>
        </div>
      )}

      {/* Success toast notification */}
      {showCopySuccessToast && (
        <div className="fixed bottom-4 right-4 bg-green-500 text-white px-4 py-2 rounded-md shadow-lg z-50 animate-fade-in">
          Copied to clipboard
        </div>
      )}
    </div>
  );
};

export default TypeScriptErrorViewer;
