"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { List, Columns2, FileText, Braces } from "lucide-react";
import type { DiffResult, ViewMode } from "../engine/types";
import type { AdapterRegistry, EnrichmentContext } from "../adapters/types";
import { AllChangesView } from "./AllChangesView";
import { ChangesOnlyView } from "./ChangesOnlyView";
import { SummaryView } from "./SummaryView";
import { RawJsonView } from "./RawJsonView";

interface DiffViewerShellProps {
  diffResult: DiffResult;
  oldValue: unknown;
  newValue: unknown;
  oldLabel: string;
  newLabel: string;
  adapters: AdapterRegistry;
  enrichment?: EnrichmentContext;
  defaultMode?: ViewMode;
  className?: string;
}

const viewModeConfig: { value: ViewMode; label: string; icon: typeof List }[] =
  [
    { value: "all", label: "All", icon: Columns2 },
    { value: "changes-only", label: "Changes", icon: FileText },
    { value: "summary", label: "Summary", icon: List },
    { value: "raw-json", label: "JSON", icon: Braces },
  ];

export function DiffViewerShell({
  diffResult,
  oldValue,
  newValue,
  oldLabel,
  newLabel,
  adapters,
  enrichment,
  defaultMode = "changes-only",
  className,
}: DiffViewerShellProps) {
  const [mode, setMode] = useState<ViewMode>(defaultMode);
  const { stats, hasChanges } = diffResult;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <Tabs
        value={mode}
        onValueChange={(v) => setMode(v as ViewMode)}
        className="flex flex-col h-full"
      >
        {/* Tab bar with stats */}
        <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 border-b border-border bg-card/50">
          <TabsList className="h-7 p-0.5 bg-muted/50">
            {viewModeConfig.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="h-6 px-2 text-xs gap-1 data-[state=active]:bg-background"
              >
                <Icon className="w-3 h-3" />
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className="flex-1" />
          {hasChanges ? (
            <div className="flex items-center gap-2 text-[0.625rem]">
              {stats.added > 0 && (
                <span className="text-green-600 dark:text-green-400">
                  +{stats.added} added
                </span>
              )}
              {stats.removed > 0 && (
                <span className="text-red-600 dark:text-red-400">
                  -{stats.removed} removed
                </span>
              )}
              {stats.modified > 0 && (
                <span className="text-amber-600 dark:text-amber-400">
                  ~{stats.modified} modified
                </span>
              )}
              {stats.unchanged > 0 && (
                <span className="text-muted-foreground">
                  {stats.unchanged} unchanged
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No changes</span>
          )}
        </div>

        <TabsContent value="all" className="flex-1 overflow-y-auto mt-0">
          <AllChangesView
            diffResult={diffResult}
            adapters={adapters}
            enrichment={enrichment}
            oldLabel={oldLabel}
            newLabel={newLabel}
          />
        </TabsContent>
        <TabsContent
          value="changes-only"
          className="flex-1 overflow-y-auto mt-0"
        >
          <ChangesOnlyView
            diffResult={diffResult}
            adapters={adapters}
            enrichment={enrichment}
            oldLabel={oldLabel}
            newLabel={newLabel}
          />
        </TabsContent>
        <TabsContent value="summary" className="flex-1 overflow-y-auto mt-0">
          <SummaryView
            diffResult={diffResult}
            adapters={adapters}
            enrichment={enrichment}
          />
        </TabsContent>
        <TabsContent value="raw-json" className="flex-1 overflow-hidden mt-0">
          <RawJsonView
            oldValue={oldValue}
            newValue={newValue}
            oldLabel={oldLabel}
            newLabel={newLabel}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
