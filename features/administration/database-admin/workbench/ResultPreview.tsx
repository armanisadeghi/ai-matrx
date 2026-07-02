"use client";

import { useMemo, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table as TableIcon } from "lucide-react";
import { JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
import { getColumns, toRows } from "./utils/joinResults";

interface ResultPreviewProps {
  data: unknown;
  emptyMessage?: string;
  defaultTab?: "table" | "json";
  maxTableRows?: number;
  className?: string;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

export function ResultPreview({
  data,
  emptyMessage = "No rows returned",
  defaultTab = "table",
  maxTableRows = 100,
  className,
}: ResultPreviewProps) {
  const [tab, setTab] = useState<string>(defaultTab);
  const rows = useMemo(() => toRows(data), [data]);
  const columns = useMemo(() => getColumns(rows), [rows]);
  const truncated = rows.length > maxTableRows;
  const displayRows = truncated ? rows.slice(0, maxTableRows) : rows;

  if (rows.length === 0 && (data === null || data === undefined)) {
    return (
      <div
        className={`p-3 text-xs text-slate-500 dark:text-slate-400 italic ${
          className ?? ""
        }`}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`flex flex-col min-h-0 overflow-hidden ${className ?? ""}`}>
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex-1 min-h-0 flex flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between px-2 pt-2 pb-1 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <TabsList className="h-7 bg-transparent gap-1">
            <TabsTrigger
              value="table"
              className="text-xs h-6 px-2 data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
            >
              <TableIcon className="h-3 w-3 mr-1" />
              Table ({rows.length})
            </TabsTrigger>
            <TabsTrigger
              value="json"
              className="text-xs h-6 px-2 data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
            >
              JSON
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="table" className="m-0 flex-1 min-h-0 overflow-auto">
          {rows.length === 0 ? (
            <div className="p-3 text-xs text-slate-500 dark:text-slate-400 italic">
              {emptyMessage}
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800 z-10">
                  <tr>
                    <th className="text-left px-2 py-1 font-medium text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 w-8">
                      #
                    </th>
                    {columns.map((col) => (
                      <th
                        key={col}
                        className="text-left px-2 py-1 font-medium text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800"
                    >
                      <td className="px-2 py-1 text-slate-400 dark:text-slate-500 font-mono">
                        {idx + 1}
                      </td>
                      {columns.map((col) => {
                        const text = formatCell(row[col]);
                        return (
                          <td
                            key={col}
                            className="px-2 py-1 font-mono text-slate-800 dark:text-slate-200 align-top max-w-[400px]"
                            title={text}
                          >
                            <div className="truncate">
                              {text || (
                                <span className="text-slate-400 dark:text-slate-600">
                                  NULL
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {truncated && (
                <div className="px-2 py-1 text-[10px] text-slate-500 dark:text-slate-400 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                  Showing {maxTableRows} of {rows.length} rows. Switch to JSON
                  to see all.
                </div>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="json"
          className="m-0 flex-1 min-h-0 overflow-hidden data-[state=active]:flex data-[state=active]:flex-col"
        >
          <JsonInspector data={data} defaultView="json" className="h-full" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
