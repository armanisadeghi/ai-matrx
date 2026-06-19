"use client";
import React from "react";
import { FolderOpen, BookOpen, ExternalLink, Star } from "lucide-react";

interface ResourcesLoadingVisualizationProps {
  title?: string;
}

const ResourcesLoadingVisualization: React.FC<
  ResourcesLoadingVisualizationProps
> = ({ title = "Loading Resources…" }) => {
  return (
    <div className="w-full border border-border rounded-xl py-2">
      <div className="max-w-6xl mx-auto p-2">
        <div className="bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-100 dark:from-violet-950/40 dark:via-purple-950/30 dark:to-fuchsia-950/40 rounded-xl p-3 border border-violet-200 dark:border-violet-800/50">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-violet-500 dark:bg-violet-600 rounded-lg">
              <FolderOpen className="h-4 w-4 text-white animate-pulse" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground">
                Organizing learning materials…
              </p>
            </div>
          </div>

          <div className="space-y-2 mb-3">
            {[
              { icon: BookOpen, width: "75%" },
              { icon: ExternalLink, width: "60%" },
              { icon: Star, width: "85%" },
            ].map(({ icon: Icon, width }, i) => (
              <div key={i} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-400/60 dark:bg-violet-600/60 rounded-full animate-pulse"
                    style={{ width }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((index) => (
              <div
                key={index}
                className="rounded-md border border-border bg-background/50 p-2 animate-pulse"
                style={{ animationDelay: `${index * 100}ms` }}
              >
                <div className="flex items-start gap-2 mb-2">
                  <div className="h-3.5 w-3.5 bg-muted rounded" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-muted rounded w-4/5" />
                    <div className="h-2 bg-muted rounded w-full" />
                  </div>
                </div>
                <div className="h-7 bg-muted rounded-md" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourcesLoadingVisualization;
