"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Database,
  Play,
  AlertCircle,
  Copy,
  Clock,
  Save,
  Lightbulb,
  Code,
  StopCircle,
  RefreshCw,
  History,
  Plus,
  Trash2,
  Wand2,
  FolderOpen,
} from "lucide-react";
import RawJsonExplorer from "@/components/official/json-explorer/RawJsonExplorer";
import { JsonTreeViewer } from "@/components/official/json-explorer/JsonTreeViewer";
import { JsonTruncator } from "@/components/official-candidate/json-truncator/JsonTruncator";
import AccordionWrapper from "@/components/matrx/matrx-collapsible/AccordionWrapper";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { QueryHistoryButton } from "@/components/admin/query-history/query-history-button";
import { saveQuery } from "@/components/admin/query-history/query-storage";
import { toast } from "sonner";
import { CategoryNotesModal } from "@/features/notes/actions/CategoryNotesModal";
import type { Note } from "@/features/notes/types";

// Define SQL queries as constants to avoid JSX parsing issues
const SQL_LIST_TABLES =
  "SELECT * FROM information_schema.tables WHERE table_schema = 'public'";
const SQL_TABLE_COLUMNS =
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'your_table_name'";
const SQL_TABLE_SIZES =
  "SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) AS size FROM information_schema.tables WHERE table_schema = 'public' ORDER BY pg_total_relation_size(quote_ident(table_name)) DESC";
const SQL_KILL_IDLE =
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle' AND state_change < current_timestamp - INTERVAL '30 minutes'";

export interface EnhancedSQLEditorProps {
  loading: boolean;
  error: string | null;
  isTimeout?: boolean;
  onExecuteQuery: (query: string, useCache?: boolean) => Promise<any>;
  onCancelQuery?: () => void;
  onClearCache?: () => void;
  queryCache?: Record<string, any>;
  className?: string;
}

interface ReplacementPair {
  id: string;
  find: string;
  replace: string;
}

export const EnhancedSQLEditor = ({
  loading,
  error,
  isTimeout,
  onExecuteQuery,
  onCancelQuery,
  onClearCache,
  queryCache = {},
  className,
}: EnhancedSQLEditorProps) => {
  const [sqlQuery, setSqlQuery] = useState("");
  const [queryResult, setQueryResult] = useState<any>(null);
  const [queryHistory, setQueryHistory] = useState<
    { query: string; timestamp: Date }[]
  >([]);
  const [activeResultTab, setActiveResultTab] = useState("raw");
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [useCache, setUseCache] = useState(true);
  const [replacementPairs, setReplacementPairs] = useState<ReplacementPair[]>([
    { id: "1", find: "", replace: "" },
  ]);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);

  const handleExecuteQuery = async () => {
    if (!sqlQuery.trim()) return;

    try {
      const startTime = performance.now();
      setQueryHistory((prev) => [
        { query: sqlQuery, timestamp: new Date() },
        ...prev.slice(0, 9),
      ]);

      const result = await onExecuteQuery(sqlQuery, useCache);

      const endTime = performance.now();
      const execTime = endTime - startTime;
      setExecutionTime(execTime);
      setQueryResult(result);

      // Only save successful queries to history
      if (result && !error) {
        saveQuery(sqlQuery, result, execTime);
      }
    } catch (err) {
      setQueryResult(null);
      setExecutionTime(null);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add toast notification here
  };

  const loadFromHistory = (query: string) => {
    setSqlQuery(query);
  };

  const handleSelectHistoryQuery = (query: string) => {
    setSqlQuery(query);
  };

  const isCached = sqlQuery && Object.keys(queryCache).includes(sqlQuery);

  // Template replacement functions
  const addReplacementPair = () => {
    const newId = (
      Math.max(...replacementPairs.map((p) => parseInt(p.id)), 0) + 1
    ).toString();
    setReplacementPairs([
      ...replacementPairs,
      { id: newId, find: "", replace: "" },
    ]);
  };

  const removeReplacementPair = (id: string) => {
    if (replacementPairs.length > 1) {
      setReplacementPairs(replacementPairs.filter((p) => p.id !== id));
    }
  };

  const updateReplacementPair = (
    id: string,
    field: "find" | "replace",
    value: string,
  ) => {
    setReplacementPairs(
      replacementPairs.map((p) => (p.id === id ? { ...p, [field]: value } : p)),
    );
  };

  const applyReplacements = () => {
    let updatedQuery = sqlQuery;
    let totalReplacements = 0;
    const replacementDetails: string[] = [];

    replacementPairs.forEach((pair) => {
      if (pair.find && pair.replace) {
        const count = (
          sqlQuery.match(
            new RegExp(pair.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
          ) || []
        ).length;
        if (count > 0) {
          totalReplacements += count;
          replacementDetails.push(`${pair.find} → ${pair.replace} (${count}x)`);
        }
        // Global replacement - replace all occurrences
        updatedQuery = updatedQuery.split(pair.find).join(pair.replace);
      }
    });

    setSqlQuery(updatedQuery);

    if (totalReplacements > 0) {
      toast.success(
        `Applied ${totalReplacements} replacement${totalReplacements !== 1 ? "s" : ""}`,
        {
          description: replacementDetails.join(", "),
        },
      );
    } else {
      toast.info("No matches found for the specified replacements");
    }
  };

  const clearReplacements = () => {
    setReplacementPairs([{ id: "1", find: "", replace: "" }]);
    toast.info("Cleared all replacement pairs");
  };

  // Count how many active replacement pairs we have
  const activeReplacements = replacementPairs.filter(
    (p) => p.find && p.replace,
  ).length;
  const templateVariablesTitle =
    activeReplacements > 0
      ? `Template Variables (${activeReplacements} active)`
      : "Template Variables";

  return (
    <Card
      className={`w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm rounded-xl flex flex-col overflow-hidden gap-0 py-0 ${className ?? ""}`}
    >
      <CardHeader className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 rounded-t-xl flex-shrink-0 py-2 px-4 [.border-b]:pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center gap-2 text-slate-800 dark:text-slate-200 rounded-t-xl">
            <Database className="h-5 w-5" />
            SQL Query Editor
          </CardTitle>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => setTemplatesModalOpen(true)}
                    variant="outline"
                    size="sm"
                    className="text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <FolderOpen className="h-4 w-4" /> Templates
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Manage SQL templates</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <QueryHistoryButton onSelectQuery={handleSelectHistoryQuery} />

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => onClearCache?.()}
                    variant="outline"
                    size="sm"
                    className="text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <RefreshCw className="h-4 w-4" /> Clear Cache
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Clear cached query results</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
              <label
                htmlFor="use-cache"
                className="text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Checkbox
                  id="use-cache"
                  checked={useCache}
                  onCheckedChange={(v) => setUseCache(v === true)}
                  className="h-3 w-3"
                />
                Use Cache
              </label>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
        <div className="relative flex-shrink-0">
          <textarea
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            className="min-h-[120px] h-[400px] w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 shadow-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-400 dark:focus-visible:ring-slate-500 disabled:cursor-not-allowed disabled:opacity-50 font-mono resize-y"
            placeholder="Enter your SQL query here..."
          />
          <div className="absolute bottom-4 right-4 flex space-x-2">
            {isCached && (
              <Badge
                variant="outline"
                className="bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
              >
                <History className="h-3 w-3" /> Cached
              </Badge>
            )}
            <Button
              onClick={() => copyToClipboard(sqlQuery)}
              variant="outline"
              size="sm"
              className="text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Copy query"
            >
              <Copy className="h-4 w-4" />
            </Button>
            {loading && onCancelQuery && (
              <Button
                onClick={onCancelQuery}
                className="bg-red-600 hover:bg-red-700 text-white dark:bg-red-700 dark:hover:bg-red-800"
                size="sm"
              >
                Cancel
                <StopCircle className="ml-2 h-4 w-4" />
              </Button>
            )}
            <Button
              onClick={handleExecuteQuery}
              className="bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-700 dark:hover:bg-blue-800"
              size="sm"
              disabled={loading || !sqlQuery.trim()}
            >
              {loading ? "Running..." : "Execute"}
              <Play className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Template Variable Replacement Section */}
        <div className="w-full flex-shrink-0">
          <AccordionWrapper
            title={templateVariablesTitle}
            value="template-variables"
            className="border border-slate-200 dark:border-slate-700 rounded-lg"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Define placeholder replacements (e.g., TABLE_NAME → my_table)
                </p>
                <div className="flex gap-2">
                  <Button
                    onClick={clearReplacements}
                    variant="outline"
                    size="sm"
                    className="text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Clear All
                  </Button>
                  <Button
                    onClick={addReplacementPair}
                    variant="outline"
                    size="sm"
                    className="text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>

              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {replacementPairs.map((pair, index) => (
                  <div key={pair.id} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        placeholder="Find (e.g., TABLE_NAME)"
                        value={pair.find}
                        onChange={(e) =>
                          updateReplacementPair(pair.id, "find", e.target.value)
                        }
                        className="flex-1 text-sm font-mono bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                      />
                      <span className="text-slate-500 dark:text-slate-400 text-sm">
                        →
                      </span>
                      <Input
                        placeholder="Replace with (e.g., my_table)"
                        value={pair.replace}
                        onChange={(e) =>
                          updateReplacementPair(
                            pair.id,
                            "replace",
                            e.target.value,
                          )
                        }
                        className="flex-1 text-sm font-mono bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                      />
                    </div>
                    <Button
                      onClick={() => removeReplacementPair(pair.id)}
                      variant="ghost"
                      size="sm"
                      disabled={replacementPairs.length === 1}
                      className="text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 h-9 w-9 p-0"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                <Button
                  onClick={applyReplacements}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white dark:bg-purple-700 dark:hover:bg-purple-800"
                  disabled={!replacementPairs.some((p) => p.find && p.replace)}
                >
                  <Wand2 className="h-4 w-4 mr-2" />
                  Apply Replacements to Query
                </Button>
              </div>
            </div>
          </AccordionWrapper>
        </div>

        <div className="grid grid-cols-3 gap-3 flex-shrink-0">
          <div className="col-span-1">
            <AccordionWrapper
              title="Query History"
              value="query-history"
              className="border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              {queryHistory.length > 0 ? (
                <ScrollArea className="h-[120px]">
                  <div className="space-y-2">
                    {queryHistory.map((item, index) => (
                      <div
                        key={index}
                        className="p-2 text-xs border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer group"
                        onClick={() => loadFromHistory(item.query)}
                      >
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-slate-500 dark:text-slate-400 text-[10px]">
                            {item.timestamp.toLocaleTimeString()}
                          </span>
                          <div className="flex gap-1">
                            {Object.keys(queryCache).includes(item.query) && (
                              <Badge
                                variant="outline"
                                className="text-[8px] py-0 h-4 bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                              >
                                Cached
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                copyToClipboard(item.query);
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <div className="font-mono truncate">{item.query}</div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                  No query history yet. Execute queries to see them here.
                </p>
              )}
            </AccordionWrapper>
          </div>

          <div className="col-span-2">
            <AccordionWrapper
              title="Query Templates"
              value="query-templates"
              className="border border-slate-200 dark:border-slate-700 rounded-lg"
            >
              <div className="grid grid-cols-2 gap-2">
                <div
                  className="p-2 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  onClick={() => setSqlQuery(SQL_LIST_TABLES)}
                >
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium mb-1">
                    <Lightbulb className="h-3 w-3" />
                    <span className="text-xs">List all tables</span>
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {SQL_LIST_TABLES}
                  </div>
                </div>
                <div
                  className="p-2 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  onClick={() => setSqlQuery(SQL_TABLE_COLUMNS)}
                >
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium mb-1">
                    <Lightbulb className="h-3 w-3" />
                    <span className="text-xs">Table columns</span>
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {SQL_TABLE_COLUMNS}
                  </div>
                </div>
                <div
                  className="p-2 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  onClick={() => setSqlQuery(SQL_TABLE_SIZES)}
                >
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium mb-1">
                    <Lightbulb className="h-3 w-3" />
                    <span className="text-xs">Table sizes</span>
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {SQL_TABLE_SIZES}
                  </div>
                </div>
                <div
                  className="p-2 border border-slate-200 dark:border-slate-700 rounded bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                  onClick={() => setSqlQuery(SQL_KILL_IDLE)}
                >
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium mb-1">
                    <Lightbulb className="h-3 w-3" />
                    <span className="text-xs">Kill idle connections</span>
                  </div>
                  <div className="text-xs font-mono text-slate-500 dark:text-slate-400 truncate">
                    {SQL_KILL_IDLE}
                  </div>
                </div>
              </div>
            </AccordionWrapper>
          </div>
        </div>

        {error && (
          <Alert
            variant="destructive"
            className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-900/20"
          >
            <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
            <AlertDescription className="text-red-600 dark:text-red-400">
              <pre className="whitespace-pre-wrap font-mono text-sm">
                {error}
              </pre>
            </AlertDescription>
          </Alert>
        )}

        {isTimeout && (
          <Alert className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-900/20">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-600 dark:text-amber-400">
              Query execution took too long and was timed out. Try simplifying
              your query or adjusting filters.
            </AlertDescription>
          </Alert>
        )}

        {queryResult && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-2 flex justify-between items-center flex-shrink-0">
              <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Code className="h-4 w-4" />
                Query Result
                {isCached && (
                  <Badge
                    variant="outline"
                    className="ml-2 bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800"
                  >
                    From Cache
                  </Badge>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {executionTime !== null && (
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {(executionTime / 1000).toFixed(2)}s
                  </span>
                )}
                <Button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(queryResult, null, 2))
                  }
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>

            <Tabs
              value={activeResultTab}
              onValueChange={setActiveResultTab}
              className="w-full flex-1 min-h-0 flex flex-col overflow-hidden"
            >
              <div className="border-b border-slate-200 dark:border-slate-700 px-4 flex-shrink-0">
                <TabsList className="h-9 bg-transparent">
                  <TabsTrigger
                    value="raw"
                    className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-800 dark:data-[state=active]:text-slate-200 data-[state=active]:shadow-none data-[state=active]:border-slate-200 dark:data-[state=active]:border-slate-700 data-[state=active]:border-b-0 rounded-b-none"
                  >
                    Raw JSON
                  </TabsTrigger>
                  <TabsTrigger
                    value="explorer"
                    className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-800 dark:data-[state=active]:text-slate-200 data-[state=active]:shadow-none data-[state=active]:border-slate-200 dark:data-[state=active]:border-slate-700 data-[state=active]:border-b-0 rounded-b-none"
                  >
                    JSON Explorer
                  </TabsTrigger>
                  <TabsTrigger
                    value="tree-viewer"
                    className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-800 dark:data-[state=active]:text-slate-200 data-[state=active]:shadow-none data-[state=active]:border-slate-200 dark:data-[state=active]:border-slate-700 data-[state=active]:border-b-0 rounded-b-none"
                  >
                    Tree
                  </TabsTrigger>
                  <TabsTrigger
                    value="truncator"
                    className="text-xs data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:text-slate-800 dark:data-[state=active]:text-slate-200 data-[state=active]:shadow-none data-[state=active]:border-slate-200 dark:data-[state=active]:border-slate-700 data-[state=active]:border-b-0 rounded-b-none"
                  >
                    Truncator
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="raw"
                className="m-0 flex-1 min-h-0 overflow-auto"
              >
                <pre className="p-4 text-sm text-slate-800 dark:text-slate-200 font-mono whitespace-pre-wrap">
                  {JSON.stringify(queryResult, null, 2)}
                </pre>
              </TabsContent>

              <TabsContent
                value="explorer"
                className="m-0 flex-1 min-h-0 overflow-auto"
              >
                <RawJsonExplorer pageData={queryResult} />
              </TabsContent>

              <TabsContent
                value="tree-viewer"
                className="m-0 flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-zinc-900"
              >
                <JsonTreeViewer data={queryResult} />
              </TabsContent>
              <TabsContent
                value="truncator"
                className="m-0 flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
              >
                <JsonTruncator
                  initialValue={
                    typeof queryResult === "string"
                      ? queryResult
                      : JSON.stringify(queryResult, null, 2)
                  }
                  tabbed
                  defaultTab="fields"
                  className="flex-1 min-h-0"
                  allowLayoutToggle
                />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>

      {/* SQL Templates Modal */}
      <CategoryNotesModal
        open={templatesModalOpen}
        onOpenChange={setTemplatesModalOpen}
        categoryName="SQL Templates"
        selectButtonLabel="Use Template"
        onSelectNote={(note: Note) => {
          setSqlQuery(note.content);
          setTemplatesModalOpen(false);
          toast.success(`Template loaded: ${note.label}`);
        }}
        allowCreate={true}
        allowEdit={true}
        allowDelete={true}
      />
    </Card>
  );
};
