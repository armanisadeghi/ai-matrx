"use client";
import React from "react";
import { Table, BarChart3, Trophy } from "lucide-react";

interface ComparisonLoadingVisualizationProps {
  title?: string;
}

const ComparisonLoadingVisualization: React.FC<
  ComparisonLoadingVisualizationProps
> = ({ title = "Loading comparison…" }) => {
  return (
    <div className="w-full border border-border rounded-xl py-2">
      <div className="max-w-6xl mx-auto p-2">
        <div className="bg-gradient-to-br from-emerald-100 via-teal-50 to-cyan-100 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/40 rounded-xl p-3 border border-emerald-200 dark:border-emerald-800/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-emerald-500 dark:bg-emerald-600 rounded-lg">
              <Table className="h-4 w-4 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground">
                Building comparison matrix…
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {[Table, BarChart3, Trophy].map((Icon, i) => (
              <div
                key={i}
                className="rounded-md border border-border bg-background/50 p-2 animate-pulse"
              >
                <Icon className="h-3 w-3 text-muted-foreground mx-auto mb-1" />
                <div className="h-3 bg-muted rounded w-6 mx-auto" />
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="bg-muted/50 px-2 py-2 border-b border-border flex gap-3">
              {[20, 16, 18, 14].map((w, i) => (
                <div
                  key={i}
                  className="h-3 bg-muted rounded animate-pulse"
                  style={{ width: `${w * 4}px` }}
                />
              ))}
            </div>
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="px-2 py-2 border-b border-border last:border-b-0 flex gap-3 animate-pulse"
              >
                <div className="h-3 bg-muted rounded w-20" />
                <div className="h-3 bg-muted rounded w-16" />
                <div className="h-3 bg-muted rounded w-12" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComparisonLoadingVisualization;
