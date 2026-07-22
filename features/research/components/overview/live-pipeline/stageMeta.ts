import { Search, Download, Brain, Layers, FileText } from "lucide-react";
import type { StageState, StageKind } from "../../../hooks/usePipelineProgress";
import { sourcesDiscoveredFromItems } from "../../../hooks/usePipelineProgress";

/**
 * Canonical per-stage display metadata shared by the live-pipeline surfaces
 * (the stat-square rail, headers, etc.). One source of truth for a stage's
 * icon, label, duration, and headline numbers.
 *
 * Labels match the orchestra nouns so the same page never says "Search 0"
 * next to a Sources node that shows 236:
 *   Search stage  → Sources (search results)
 *   Scrape stage  → Content (scrape results)
 */

export const STAGE_ICON: Record<StageKind, typeof Search> = {
  search: Search,
  scrape: Download,
  analyze: Brain,
  synthesize: Layers,
  report: FileText,
};

export const STAGE_LABEL: Record<StageKind, string> = {
  search: "Sources",
  scrape: "Content",
  analyze: "Analysis",
  synthesize: "Synthesis",
  report: "Report",
};

/** Route segment (under /research/topics/[id]) a stage's results live on. */
export const STAGE_ROUTE: Record<StageKind, string> = {
  search: "sources",
  scrape: "content",
  analyze: "analysis",
  synthesize: "synthesis",
  report: "document",
};

export function stageDuration(stage: StageState): string | null {
  if (stage.startedAt == null || stage.completedAt == null) return null;
  const sec = Math.max(
    1,
    Math.round((stage.completedAt - stage.startedAt) / 1000),
  );
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const fmt = (n: number): string => n.toLocaleString();

export interface StageSquareData {
  /** Headline number (the stage's primary outcome). */
  value: string;
  /** Short unit for the headline. */
  unit: string;
  /** Secondary line — context / the "from N keywords" story. */
  sub: string;
}

/**
 * Per-stage headline for the this-run rail. Sources uses the same
 * `stored_count ?? sources_found` sum as `derived.totalSourcesDiscovered`.
 */
export function stageSquareData(stage: StageState): StageSquareData {
  const t = stage.totals;
  switch (stage.kind) {
    case "search": {
      const fromItems = sourcesDiscoveredFromItems(Object.values(stage.items));
      // Prefer item-level sum; fall back to search_complete target when the
      // stage finished without per-keyword metadata (shouldn't happen on a
      // real search, but keeps the square honest if it does).
      const total = fromItems > 0 ? fromItems : (t.target ?? 0);
      const kw = stage.itemOrder.length;
      return {
        value: fmt(total),
        unit: "sources",
        sub: `${kw} keyword${kw === 1 ? "" : "s"}`,
      };
    }
    case "scrape": {
      const tried = stage.itemOrder.length;
      return {
        value: fmt(t.succeeded),
        unit: t.succeeded === 1 ? "page" : "pages",
        sub: `${tried} tried${t.failed ? ` · ${t.failed} failed` : ""}`,
      };
    }
    case "analyze": {
      return {
        value: fmt(t.succeeded),
        unit: t.succeeded === 1 ? "analysis" : "analyses",
        sub: t.target
          ? `of ${t.target}${t.failed ? ` · ${t.failed} failed` : ""}`
          : t.failed
            ? `${t.failed} failed`
            : "this run",
      };
    }
    case "synthesize": {
      const items = Object.values(stage.items);
      const kw = items.filter((i) => i.metadata.scope === "keyword").length;
      // metadata.scope is normalized at ingress — "topic" covers legacy "project".
      const proj = items.filter((i) => i.metadata.scope === "topic").length;
      return {
        value: fmt(kw),
        unit: kw === 1 ? "synthesis" : "syntheses",
        sub:
          proj > 0 ? `+ ${proj} report${proj === 1 ? "" : "s"}` : "per keyword",
      };
    }
    case "report": {
      const items = Object.values(stage.items);
      const tagCount = items.filter((i) => i.id.startsWith("tag:")).length;
      const hasDoc = items.some((i) => i.id === "document");
      if (hasDoc) {
        return {
          value: "1",
          unit: "document",
          sub:
            tagCount > 0
              ? `${tagCount} tag${tagCount === 1 ? "" : "s"}`
              : "assembled",
        };
      }
      return {
        value: fmt(tagCount),
        unit: tagCount === 1 ? "consolidation" : "consolidations",
        sub: "report",
      };
    }
  }
}
