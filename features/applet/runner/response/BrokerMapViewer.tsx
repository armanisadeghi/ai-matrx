"use client";

import React, { useState, MouseEvent } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { useAppSelector } from "@/lib/redux/hooks";
import { brokerSelectors } from "@/lib/redux/brokerSlice";
import { Copy, Check, Filter, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BrokerMapEntry {
  brokerId: string;
  mappedItemId: string;
  source: string;
  sourceId: string;
}

// Helper function to copy text to clipboard
const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error("Failed to copy text: ", err);
    return false;
  }
};

// Reusable copy button component
const CopyButton = ({
  text,
  size = "sm",
  onClick,
}: {
  text: string;
  size?: "default" | "icon" | "sm" | "lg";
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    // Stop propagation to prevent the row click event
    e.stopPropagation();

    // Call any additional onClick handler if provided
    if (onClick) {
      onClick(e);
    }

    const success = await copyToClipboard(text);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Button
      variant="ghost"
      size={size as "default" | "icon" | "sm" | "lg"}
      className="h-6 w-6 p-0 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full"
      onClick={handleCopy}
      title="Copy to clipboard"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
      )}
    </Button>
  );
};

// Function to get source badge color based on source type
const getSourceBadgeVariant = (source: string) => {
  switch (source.toLowerCase()) {
    case "workflow":
      return "default";
    case "applet":
      return "secondary";
    case "global":
      return "outline";
    default:
      return "default";
  }
};

// Component to format and display broker values
const ValueDisplay = ({ value, expanded = false, isExpandable = false }) => {
  if (value === undefined) {
    return <span className="text-gray-400 italic">undefined</span>;
  }

  if (value === null) {
    return <span className="text-gray-400 italic">null</span>;
  }

  if (typeof value === "boolean") {
    return (
      <Badge variant={value ? "success" : "destructive"}>
        {value.toString()}
      </Badge>
    );
  }

  if (typeof value === "number") {
    return (
      <span className="text-blue-600 dark:text-blue-400 font-mono">
        {value}
      </span>
    );
  }

  if (typeof value === "string") {
    // URLs get special treatment
    if (value.startsWith("http")) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline truncate inline-block max-w-[300px]"
        >
          {value}
        </a>
      );
    }

    // Regular strings - increase length limit before truncating
    if (value.length > 100 && !expanded) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="font-mono truncate inline-block max-w-[300px]">
                {value.substring(0, 100)}...
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-md">
              <p className="font-mono text-xs break-all">{value}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return <span className="font-mono">{value}</span>;
  }

  // Objects and arrays
  if (typeof value === "object") {
    const isArray = Array.isArray(value);
    const count = isArray ? value.length : Object.keys(value).length;
    const summary = isArray ? `Array[${count}]` : `Object{${count}}`;

    if (!expanded) {
      return (
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800">
            {summary}
          </Badge>
          {isExpandable && <ChevronRight className="h-3 w-3 text-slate-400" />}
        </div>
      );
    }

    // If expanded, show first few entries
    return (
      <div className="font-mono text-xs">
        <div className="text-purple-600 dark:text-purple-400">{summary}</div>
        <pre className="mt-2 bg-slate-50 dark:bg-slate-900 p-2 rounded overflow-auto max-h-40">
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    );
  }

  return <span>{String(value)}</span>;
};

const BrokerMapViewer = () => {
  const brokerMap = useAppSelector(brokerSelectors.selectMap);
  const brokerValues = useAppSelector(brokerSelectors.selectAllValues);
  const [filterText, setFilterText] = useState<string>("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Convert broker map to array of entries for table display
  const entries: Array<BrokerMapEntry & { id: string }> = Object.entries(
    brokerMap,
  ).map(([id, entry]) => ({
    id,
    ...(entry as BrokerMapEntry),
  }));

  // Apply filtering if filter text exists
  const filteredEntries = filterText
    ? entries.filter(
        (entry) =>
          entry.id.toLowerCase().includes(filterText.toLowerCase()) ||
          entry.brokerId.toLowerCase().includes(filterText.toLowerCase()) ||
          entry.mappedItemId.toLowerCase().includes(filterText.toLowerCase()) ||
          entry.source.toLowerCase().includes(filterText.toLowerCase()) ||
          entry.sourceId.toLowerCase().includes(filterText.toLowerCase()),
      )
    : entries;

  // Toggle expanded row
  const toggleExpandRow = (rowId: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowId)) {
        newSet.delete(rowId);
      } else {
        newSet.add(rowId);
      }
      return newSet;
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between mb-3 px-4 py-2">
        <p className="text-sm text-slate-600 dark:text-slate-400 max-w-3xl">
          The Broker Map shows 'Data Sources' which have been mapped to brokers.
          Examples include fields from applets, APIs, database data, or the
          results of other applets and processes
        </p>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="h-4 w-4 absolute left-2 top-[50%] transform translate-y-[-50%] text-slate-400" />
            <Input
              placeholder="Filter entries..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              className="pl-8 h-8 w-64 text-sm"
            />
          </div>
          <CopyButton
            text={JSON.stringify(brokerMap, null, 2)}
            size="default"
          />
        </div>
      </div>

      <div className="flex-1 bg-white dark:bg-slate-950 rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
        <ScrollArea className="h-full w-full">
          <Table>
            <TableHeader className="bg-slate-100 dark:bg-slate-800 sticky top-0">
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead className="font-medium w-[15%]">Map ID</TableHead>
                <TableHead className="font-medium w-[15%]">Broker ID</TableHead>
                <TableHead className="font-medium w-[15%]">
                  Mapped Item ID
                </TableHead>
                <TableHead className="font-medium w-[10%]">Source</TableHead>
                <TableHead className="font-medium w-[15%]">Source ID</TableHead>
                <TableHead className="font-medium bg-blue-50 dark:bg-blue-950 w-[25%]">
                  Current Value
                </TableHead>
                <TableHead className="w-[5%] text-right">Copy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredEntries.length > 0 ? (
                filteredEntries.map((entry) => {
                  const isExpanded = expandedRows.has(entry.id);
                  const brokerValue = brokerValues[entry.brokerId];
                  const isComplexValue =
                    brokerValue !== null &&
                    typeof brokerValue === "object" &&
                    !Array.isArray(brokerValue) &&
                    Object.keys(brokerValue).length > 0;

                  return (
                    <React.Fragment key={entry.id}>
                      <TableRow
                        className={`hover:bg-slate-50 dark:hover:bg-slate-900 ${
                          typeof brokerValue === "object" &&
                          brokerValue !== null
                            ? "cursor-pointer"
                            : ""
                        }`}
                        onClick={(e: React.MouseEvent<HTMLTableRowElement>) => {
                          // Only toggle if the click didn't come from a button (like the copy buttons)
                          if (!(e.target as Element).closest("button")) {
                            typeof brokerValue === "object" &&
                              brokerValue !== null &&
                              toggleExpandRow(entry.id);
                          }
                        }}
                      >
                        <TableCell className="p-0 w-8">
                          {typeof brokerValue === "object" &&
                            brokerValue !== null && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation(); // Prevent row click event
                                  toggleExpandRow(entry.id);
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </Button>
                            )}
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[140px]">
                          <div className="flex items-center gap-1">
                            <span className="truncate" title={entry.id}>
                              {entry.id}
                            </span>
                            <CopyButton text={entry.id} />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[140px]">
                          <div className="flex items-center gap-1">
                            <span className="truncate" title={entry.brokerId}>
                              {entry.brokerId}
                            </span>
                            <CopyButton text={entry.brokerId} />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[140px]">
                          <div className="flex items-center gap-1">
                            <span
                              className="truncate"
                              title={entry.mappedItemId}
                            >
                              {entry.mappedItemId}
                            </span>
                            <CopyButton text={entry.mappedItemId} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={getSourceBadgeVariant(entry.source)}
                            >
                              {entry.source}
                            </Badge>
                            <CopyButton text={entry.source} />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs truncate max-w-[140px]">
                          <div className="flex items-center gap-1">
                            <span className="truncate" title={entry.sourceId}>
                              {entry.sourceId}
                            </span>
                            <CopyButton text={entry.sourceId} />
                          </div>
                        </TableCell>
                        <TableCell className="bg-blue-50 dark:bg-blue-950/30">
                          <div className="flex items-center gap-1 min-w-0">
                            <ValueDisplay
                              value={brokerValue}
                              isExpandable={
                                typeof brokerValue === "object" &&
                                brokerValue !== null
                              }
                            />
                            {brokerValue !== undefined && (
                              <CopyButton
                                text={
                                  typeof brokerValue === "object"
                                    ? JSON.stringify(brokerValue, null, 2)
                                    : String(brokerValue)
                                }
                              />
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <CopyButton
                            text={JSON.stringify(entry, null, 2)}
                            onClick={(e: MouseEvent<HTMLButtonElement>) =>
                              e.stopPropagation()
                            }
                          />
                        </TableCell>
                      </TableRow>

                      {/* Expanded row for displaying complex values */}
                      {isExpanded && (
                        <TableRow className="bg-slate-50 dark:bg-slate-900/50">
                          <TableCell colSpan={8} className="py-2 px-4">
                            <div className="pl-8 border-l-2 border-blue-200 dark:border-blue-800">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                  Full Value for{" "}
                                  <span className="font-mono">
                                    {entry.brokerId}
                                  </span>
                                  :
                                </span>
                                <CopyButton
                                  text={
                                    typeof brokerValue === "object"
                                      ? JSON.stringify(brokerValue, null, 2)
                                      : String(brokerValue)
                                  }
                                />
                              </div>
                              <ValueDisplay
                                value={brokerValue}
                                expanded={true}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center py-8 text-slate-500 dark:text-slate-400"
                  >
                    {entries.length === 0
                      ? "No broker map entries found."
                      : "No entries match your filter."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>
    </div>
  );
};

export default BrokerMapViewer;
