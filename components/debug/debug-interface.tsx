// app/components/debug-interface.tsx
// STATUS: NEW FILE
"use client";

import React, { useEffect, useState } from "react";
import {
  Download,
  Filter,
  Search,
  Trash2,
  RefreshCw,
  MaximizeIcon,
  MinimizeIcon,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useAppSelector } from "@/lib/redux/hooks";

import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LogEntry, LogStorage, SchemaResolutionLog } from "@/utils/logger";

export default function DebugInterface() {
  const [activeTab, setActiveTab] = useState("app");
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [schemaLogs, setSchemaLogs] = useState<SchemaResolutionLog[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const theme = useAppSelector((s) => s.theme.mode);

  useEffect(() => {
    const updateLogs = () => {
      setLogs(LogStorage.getFromStorage());
      setSchemaLogs(LogStorage.getSchemaLogs());
    };

    updateLogs();
    let interval: NodeJS.Timeout;

    if (autoRefresh) {
      interval = setInterval(updateLogs, 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch = log.message
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesLevel = levelFilter === "all" || log.level === levelFilter;
    return matchesSearch && matchesLevel;
  });

  const filteredSchemaLogs = schemaLogs.filter(
    (log) =>
      log.original.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resolved.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const downloadLogs = (type: "app" | "schema") => {
    const data = type === "app" ? filteredLogs : filteredSchemaLogs;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}-logs-${new Date().toISOString()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const clearLogs = (type: "app" | "schema") => {
    if (type === "app") {
      LogStorage.clearStorage();
      setLogs([]);
    } else {
      LogStorage.clearSchemaLogs();
      setSchemaLogs([]);
    }
  };

  const containerStyles = isExpanded
    ? "fixed inset-0 z-50"
    : "fixed bottom-4 right-4 w-96 h-96";

  return (
    <motion.div
      layout
      className={`${containerStyles} bg-background border rounded-lg shadow-lg overflow-hidden`}
    >
      <Card className="h-full flex flex-col">
        <div className="p-4 border-b flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={
                autoRefresh ? "text-green-500" : "text-muted-foreground"
              }
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? (
                <MinimizeIcon className="w-4 h-4" />
              ) : (
                <MaximizeIcon className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col"
        >
          <div className="border-b px-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="app">Application Logs</TabsTrigger>
              <TabsTrigger value="schema">Schema Logs</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="app" className="flex-1 flex flex-col">
            <div className="px-4 py-2 border-b flex items-center gap-2">
              <Select value={levelFilter} onValueChange={setLevelFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Filter level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warning</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadLogs("app")}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearLogs("app")}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              <AnimatePresence mode="popLayout">
                {filteredLogs.length > 0 ? (
                  filteredLogs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="mb-2"
                    >
                      <Alert
                        variant={
                          log.level === "error" ? "destructive" : "default"
                        }
                      >
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={
                              log.level === "error"
                                ? "destructive"
                                : log.level === "warn"
                                  ? "default"
                                  : "default"
                            }
                          >
                            {log.level.toUpperCase()}
                          </Badge>
                          <AlertDescription>{log.message}</AlertDescription>
                        </div>
                      </Alert>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No logs found
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="schema" className="flex-1 flex flex-col">
            <div className="px-4 py-2 border-b flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadLogs("schema")}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => clearLogs("schema")}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear
              </Button>
            </div>

            <ScrollArea className="flex-1 p-4">
              <AnimatePresence mode="popLayout">
                {filteredSchemaLogs.length > 0 ? (
                  filteredSchemaLogs.map((log) => (
                    <motion.div
                      key={log.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="mb-4"
                    >
                      <Card>
                        <CardContent className="pt-6">
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge>{log.resolutionType}</Badge>
                              <span className="text-muted-foreground">→</span>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-sm font-medium">
                                  Original
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {log.original}
                                </div>
                              </div>
                              <div>
                                <div className="text-sm font-medium">
                                  Resolved
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {log.resolved}
                                </div>
                              </div>
                            </div>
                            <div>
                              <div className="text-sm font-medium">Trace</div>
                              <div className="text-sm text-muted-foreground">
                                {(log.trace ?? []).join(" → ")}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                ) : (
                  <div className="text-center text-muted-foreground py-8">
                    No schema logs found
                  </div>
                )}
              </AnimatePresence>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </Card>
    </motion.div>
  );
}
