"use client";

/**
 * ConfidenceChip — the ONE rendering of a mandate-result confidence across
 * the review surfaces (triage, drafts). Confidence bands drive attention:
 * high collapses, low demands it — never present all AI output as equally
 * trustworthy.
 */

import React from "react";

import { Badge } from "@/components/ui/badge";

export function confidenceBand(
  confidence: number | null,
): "high" | "medium" | "low" | "none" {
  if (confidence === null) return "none";
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

export function ConfidenceChip({ confidence }: { confidence: number | null }) {
  const band = confidenceBand(confidence);
  if (band === "none") return null;
  const pct = Math.round((confidence ?? 0) * 100);
  return (
    <Badge
      variant={band === "high" ? "secondary" : band === "medium" ? "outline" : "destructive"}
    >
      {pct}% confident
    </Badge>
  );
}
