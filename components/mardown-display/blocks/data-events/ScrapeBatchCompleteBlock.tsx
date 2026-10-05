"use client";
import { Badge } from "@ai-matrx/design-system/controls";
import React from "react";
import { Download, CheckCircle2 } from "lucide-react";

export interface ScrapeBatchCompleteBlockProps {
  totalScraped: number;
}

const ScrapeBatchCompleteBlock: React.FC<ScrapeBatchCompleteBlockProps> = ({
  totalScraped,
}) => (
  <div className="rounded-lg border border-success/40 bg-success/5 my-2">
    <div className="flex items-center gap-2 px-3 py-2.5">
      <Download className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0" />
      <span className="text-sm font-medium text-foreground">
        Scrape Complete
      </span>
      <Badge tone="success">{`${totalScraped} page${totalScraped !== 1 ? "s" : ""} scraped`}</Badge>
    </div>
  </div>
);

export default ScrapeBatchCompleteBlock;
