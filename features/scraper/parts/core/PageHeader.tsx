"use client";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { InfoIcon, ExternalLinkIcon } from "lucide-react";

const PageHeader = ({
  title,
  url,
  status,
  featureToggles = {
    keywordAnalysis: false,
    factChecker: false,
  },
  setFeatureToggles,
}) => {
  const handleToggleChange = (feature) => {
    setFeatureToggles((prev) => ({
      ...prev,
      [feature]: !prev[feature],
    }));
  };

  return (
    <div className="bg-card rounded-t-lg shadow-md overflow-hidden border border-border">
      <div className="px-4 py-3 relative">
        <div className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <h1 className="text-xl font-bold text-foreground truncate">
                {title || "Untitled Page"}
              </h1>
              {url && (
                <div className="flex items-center mt-0.5 min-w-0">
                  <ExternalLinkIcon className="text-muted-foreground mr-1.5 h-3 w-3 shrink-0" />
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground text-xs truncate"
                  >
                    {url || "No URL"}
                  </a>
                </div>
              )}
            </div>
            <Badge
              className={`ml-2 shrink-0 text-xs px-2 py-0.5 ${
                status === "success"
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 border border-emerald-500/30"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-300 hover:bg-rose-500/25 border border-rose-500/30"
              }`}
            >
              {status}
            </Badge>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <TooltipProvider>
              <div className="flex items-center">
                <div className="flex items-center gap-2 bg-muted rounded-md px-2 py-1">
                  <Switch
                    id="keyword-analysis-toggle"
                    checked={featureToggles.keywordAnalysis}
                    onCheckedChange={() =>
                      handleToggleChange("keywordAnalysis")
                    }
                  />
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    Keyword Analysis
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="w-40 text-xs">
                        Enable keyword analysis feature
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </TooltipProvider>

            <TooltipProvider>
              <div className="flex items-center">
                <div className="flex items-center gap-2 bg-muted rounded-md px-2 py-1">
                  <Switch
                    id="fact-checker-toggle"
                    checked={featureToggles.factChecker}
                    onCheckedChange={() => handleToggleChange("factChecker")}
                  />
                  <span className="text-muted-foreground text-xs whitespace-nowrap">
                    Fact Checker
                  </span>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-3 w-3 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="bottom">
                      <p className="w-40 text-xs">
                        Enable fact checking feature
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </div>
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PageHeader;
