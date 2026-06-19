"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  Table,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Star,
  DollarSign,
  Check,
  X,
  Maximize2,
  Minimize2,
  Search,
  Trophy,
  Medal,
  Award,
  Zap,
  Target,
  Eye,
  EyeOff,
  Crown,
  ExternalLink,
  Printer,
  BarChart3,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";

interface ComparisonCriterion {
  name: string;
  values: (string | number | boolean)[];
  type: "cost" | "rating" | "text" | "boolean";
  weight?: number;
  higherIsBetter?: boolean;
}

interface ComparisonTableData {
  title: string;
  description?: string;
  items: string[];
  criteria: ComparisonCriterion[];
}

interface ComparisonTableBlockProps {
  comparison: ComparisonTableData;
  taskId?: string; // Task ID for canvas deduplication
}

type SortDirection = "asc" | "desc" | null;

const STAT_ITEMS = [
  { key: "items", label: "Items", icon: Table },
  { key: "criteria", label: "Criteria", icon: Target },
  { key: "avgScore", label: "Avg", icon: BarChart3, suffix: "%" },
] as const;

const navBtnClass =
  "inline-flex items-center justify-center gap-1 p-1.5 md:px-2 md:py-1.5 rounded-md text-xs font-medium border transition-colors";

const ComparisonTableBlock: React.FC<ComparisonTableBlockProps> = ({
  comparison,
  taskId,
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const blockContentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const handlePrint = useCallback(async () => {
    if (!blockContentRef.current || isPrinting) return;
    setIsPrinting(true);
    try {
      const { captureBlockElement } =
        await import("@/features/chat/utils/dom-capture-block-printer");
      await captureBlockElement(
        blockContentRef.current,
        comparison.title.replace(/\s+/g, "-").toLowerCase() || "comparison",
      );
    } catch (err) {
      console.error("[ComparisonTableBlock] Print failed:", err);
    } finally {
      setIsPrinting(false);
    }
  }, [comparison.title, isPrinting]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedItem, setHighlightedItem] = useState<string | null>(null);
  const [showScores, setShowScores] = useState(false);
  const { open: openCanvas } = useCanvas();

  // Calculate scores for each item based on criteria
  const itemScores = useMemo(() => {
    const scores: Record<string, number> = {};

    comparison.items.forEach((item, itemIndex) => {
      let totalScore = 0;
      let totalWeight = 0;

      comparison.criteria.forEach((criterion) => {
        const value = criterion.values[itemIndex];
        const weight = criterion.weight || 1;
        let score = 0;

        switch (criterion.type) {
          case "rating":
            score = typeof value === "number" ? (value / 5) * 100 : 0;
            break;
          case "cost":
            // For cost, lower is usually better (inverse scoring)
            const costValues = criterion.values.filter(
              (v) => typeof v === "number",
            ) as number[];
            if (costValues.length > 0) {
              const maxCost = Math.max(...costValues);
              const minCost = Math.min(...costValues);
              if (typeof value === "number" && maxCost > minCost) {
                score = criterion.higherIsBetter
                  ? ((value - minCost) / (maxCost - minCost)) * 100
                  : ((maxCost - value) / (maxCost - minCost)) * 100;
              }
            }
            break;
          case "boolean":
            score = value === true ? 100 : 0;
            break;
          case "text":
            // Simple text scoring based on positive keywords
            if (typeof value === "string") {
              const positiveWords = [
                "excellent",
                "great",
                "good",
                "high",
                "fast",
                "easy",
                "yes",
              ];
              const negativeWords = [
                "poor",
                "bad",
                "low",
                "slow",
                "hard",
                "difficult",
                "no",
              ];
              const lowerValue = value.toLowerCase();

              if (positiveWords.some((word) => lowerValue.includes(word)))
                score = 80;
              else if (negativeWords.some((word) => lowerValue.includes(word)))
                score = 20;
              else score = 50; // neutral
            }
            break;
        }

        totalScore += score * weight;
        totalWeight += weight;
      });

      scores[item] = totalWeight > 0 ? Math.round(totalScore / totalWeight) : 0;
    });

    return scores;
  }, [comparison]);

  // Sort items based on current sort criteria
  const sortedItemIndices = useMemo(() => {
    let indices = comparison.items.map((_, index) => index);

    if (sortBy && sortDirection) {
      indices.sort((a, b) => {
        let aValue: any;
        let bValue: any;

        if (sortBy === "name") {
          aValue = comparison.items[a];
          bValue = comparison.items[b];
        } else if (sortBy === "score") {
          aValue = itemScores[comparison.items[a]];
          bValue = itemScores[comparison.items[b]];
        } else {
          const criterion = comparison.criteria.find((c) => c.name === sortBy);
          if (criterion) {
            aValue = criterion.values[a];
            bValue = criterion.values[b];
          }
        }

        // Handle different data types
        if (typeof aValue === "number" && typeof bValue === "number") {
          return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        } else if (typeof aValue === "boolean" && typeof bValue === "boolean") {
          const aNum = aValue ? 1 : 0;
          const bNum = bValue ? 1 : 0;
          return sortDirection === "asc" ? aNum - bNum : bNum - aNum;
        } else {
          const aStr = String(aValue).toLowerCase();
          const bStr = String(bValue).toLowerCase();
          return sortDirection === "asc"
            ? aStr.localeCompare(bStr)
            : bStr.localeCompare(aStr);
        }
      });
    }

    return indices;
  }, [comparison, sortBy, sortDirection, itemScores]);

  // Filter items based on search query
  const filteredIndices = useMemo(() => {
    if (!searchQuery) return sortedItemIndices;

    return sortedItemIndices.filter((index) => {
      const item = comparison.items[index];
      const itemMatches = item
        .toLowerCase()
        .includes(searchQuery.toLowerCase());

      const criteriaMatch = comparison.criteria.some((criterion) => {
        const value = criterion.values[index];
        return String(value).toLowerCase().includes(searchQuery.toLowerCase());
      });

      return itemMatches || criteriaMatch;
    });
  }, [sortedItemIndices, searchQuery, comparison]);

  const handleSort = (columnName: string) => {
    if (sortBy === columnName) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortBy(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortBy(columnName);
      setSortDirection("asc");
    }
  };

  const toggleColumnVisibility = (criterionName: string) => {
    const newHidden = new Set(hiddenColumns);
    if (newHidden.has(criterionName)) {
      newHidden.delete(criterionName);
    } else {
      newHidden.add(criterionName);
    }
    setHiddenColumns(newHidden);
  };

  const renderCellValue = (
    criterion: ComparisonCriterion,
    value: any,
    itemIndex: number,
  ) => {
    const isHighlighted = highlightedItem === comparison.items[itemIndex];

    switch (criterion.type) {
      case "rating":
        if (typeof value === "number") {
          return (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <Star
                  key={star}
                  className={`h-3 w-3 ${
                    star <= value
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-muted-foreground/40"
                  }`}
                />
              ))}
              <span className="ml-0.5 text-xs font-medium text-muted-foreground tabular-nums">
                {value}
              </span>
            </div>
          );
        }
        break;

      case "cost":
        if (typeof value === "string") {
          const costLevel = value.length; // $ = 1, $$ = 2, $$$ = 3
          return (
            <div className="flex items-center gap-1">
              {[1, 2, 3].map((level) => (
                <DollarSign
                  key={level}
                  className={`h-4 w-4 ${
                    level <= costLevel
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-300 dark:text-gray-600"
                  }`}
                />
              ))}
            </div>
          );
        } else if (typeof value === "number") {
          return (
            <span className="font-medium text-green-600 dark:text-green-400">
              ${value}
            </span>
          );
        }
        break;

      case "boolean":
        return (
          <div className="flex justify-center">
            {value ? (
              <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
            ) : (
              <X className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
          </div>
        );

      case "text":
      default:
        return (
          <span className={`text-sm ${isHighlighted ? "font-semibold" : ""}`}>
            {String(value)}
          </span>
        );
    }

    return <span className="text-sm">{String(value)}</span>;
  };

  const getSortIcon = (columnName: string) => {
    if (sortBy !== columnName) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    }

    if (sortDirection === "asc") {
      return (
        <ArrowUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      );
    }
    if (sortDirection === "desc") {
      return (
        <ArrowDown className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
      );
    }

    return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
  };

  const getWinnerIndices = () => {
    const scores = Object.entries(itemScores).map(([item, score]) => ({
      item,
      score,
      index: comparison.items.indexOf(item),
    }));

    scores.sort((a, b) => b.score - a.score);

    return {
      winner: scores[0]?.index,
      runnerUp: scores[1]?.index,
      third: scores[2]?.index,
    };
  };

  const winners = getWinnerIndices();

  const stats = useMemo(
    () => ({
      items: comparison.items.length,
      criteria: comparison.criteria.length,
      avgScore:
        comparison.items.length > 0
          ? Math.round(
              Object.values(itemScores).reduce((a, b) => a + b, 0) /
                comparison.items.length,
            )
          : 0,
    }),
    [comparison.items.length, comparison.criteria.length, itemScores],
  );

  const getStickyItemCellClass = (
    highlighted: boolean,
    isWinner: boolean,
    isRunnerUp: boolean,
    isThird: boolean,
  ) => {
    const base =
      "sticky left-0 z-[1] border-r border-border shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)]";
    if (highlighted) {
      return `${base} bg-emerald-50 dark:bg-emerald-950`;
    }
    if (isWinner) {
      return `${base} bg-yellow-50 dark:bg-yellow-950`;
    }
    if (isThird) {
      return `${base} bg-orange-50 dark:bg-orange-950`;
    }
    if (isRunnerUp) {
      return `${base} bg-muted dark:bg-muted`;
    }
    return `${base} bg-card group-hover:bg-muted`;
  };

  return (
    <>
      {isFullScreen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsFullScreen(false)}
        />
      )}

      <div
        className={`w-full border border-border rounded-xl ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-2" : "py-2"}`}
      >
        <div
          className={`max-w-6xl mx-auto ${isFullScreen ? "bg-textured rounded-xl shadow-2xl h-full max-h-[95dvh] w-full flex flex-col overflow-hidden border border-border" : ""}`}
        >
          {isFullScreen && (
            <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
              <div className="flex items-center gap-2 min-w-0">
                <Table className="h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {comparison.title}
                </h3>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <IconButton
                  icon={Printer}
                  tooltip={isPrinting ? "Saving…" : "Print / Save as PDF"}
                  onClick={handlePrint}
                  disabled={isPrinting}
                  size="sm"
                  className="bg-slate-500 dark:bg-slate-600 text-white hover:bg-slate-600 dark:hover:bg-slate-700"
                />
                <IconButton
                  icon={Minimize2}
                  tooltip="Exit full screen"
                  onClick={() => setIsFullScreen(false)}
                  size="sm"
                  variant="outline"
                />
              </div>
            </div>
          )}

          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div ref={blockContentRef} className="p-2 space-y-3">
              {/* Header */}
              <div className="bg-gradient-to-br from-emerald-100 via-teal-50 to-cyan-100 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/40 rounded-xl p-2 border border-emerald-200 dark:border-emerald-800/50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="p-2 bg-emerald-500 dark:bg-emerald-600 rounded-lg flex-shrink-0">
                      <Table className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-sm font-bold text-foreground leading-tight line-clamp-2">
                        {comparison.title}
                      </h1>
                      {comparison.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {comparison.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isFullScreen && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <IconButton
                        icon={Printer}
                        tooltip={isPrinting ? "Saving…" : "Print / Save as PDF"}
                        onClick={handlePrint}
                        disabled={isPrinting}
                        size="sm"
                        className="bg-slate-500 dark:bg-slate-600 text-white hover:bg-slate-600 dark:hover:bg-slate-700"
                      />
                      <IconButton
                        icon={ExternalLink}
                        tooltip="Open Canvas"
                        onClick={() =>
                          openCanvas({
                            type: "comparison",
                            data: comparison,
                            metadata: {
                              title: comparison.title,
                              sourceTaskId: taskId,
                            },
                          })
                        }
                        size="sm"
                        className="bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700"
                      />
                      <IconButton
                        icon={Maximize2}
                        tooltip="Expand to full screen"
                        onClick={() => setIsFullScreen(true)}
                        size="sm"
                        className="bg-emerald-500 dark:bg-emerald-600 text-white hover:bg-emerald-600 dark:hover:bg-emerald-700"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-1.5 mb-2">
                  {STAT_ITEMS.map((item) => {
                    const { key, label, icon: StatIcon } = item;
                    const suffix = "suffix" in item ? item.suffix : "";
                    return (
                      <div
                        key={key}
                        className="rounded-md border border-border bg-background/50 px-1.5 py-1.5 text-center"
                      >
                        <div className="flex items-center justify-center gap-1 text-muted-foreground">
                          <StatIcon className="h-3 w-3 flex-shrink-0" />
                          <span className="text-[10px] font-medium truncate hidden md:inline">
                            {label}
                          </span>
                        </div>
                        <div className="text-sm font-semibold text-foreground tabular-nums">
                          {stats[key]}
                          {suffix}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="flex flex-col sm:flex-row gap-1.5">
                  <div className="flex-1 relative min-w-0">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-base sm:text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-emerald-500 focus:border-transparent"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowScores(!showScores)}
                    title={showScores ? "Hide scores" : "Show scores"}
                    className={`${navBtnClass} flex-shrink-0 ${
                      showScores
                        ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                        : "bg-background/60 text-foreground border-border"
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    <span className="hidden md:inline">
                      {showScores ? "Hide" : "Scores"}
                    </span>
                  </button>
                </div>
              </div>

              {showScores && (
                <div className="rounded-lg p-2 border border-yellow-200 dark:border-yellow-800/50 bg-gradient-to-r from-yellow-50/80 to-orange-50/80 dark:from-yellow-950/30 dark:to-orange-950/30">
                  <h3 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <Trophy className="h-3.5 w-3.5 text-yellow-500" />
                    Top performers
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {winners.winner !== undefined && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-yellow-300 dark:border-yellow-700 bg-yellow-50/90 dark:bg-yellow-950/40 min-w-0 max-w-full">
                        <Crown className="h-3.5 w-3.5 text-yellow-600 flex-shrink-0" />
                        <span className="text-xs font-semibold truncate">
                          {comparison.items[winners.winner]}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                          {itemScores[comparison.items[winners.winner]]}%
                        </span>
                      </div>
                    )}
                    {winners.runnerUp !== undefined && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-border bg-background/80 min-w-0 max-w-full">
                        <Medal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {comparison.items[winners.runnerUp]}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                          {itemScores[comparison.items[winners.runnerUp]]}%
                        </span>
                      </div>
                    )}
                    {winners.third !== undefined && (
                      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md border border-orange-300 dark:border-orange-700 bg-orange-50/80 dark:bg-orange-950/40 min-w-0 max-w-full">
                        <Award className="h-3.5 w-3.5 text-orange-600 flex-shrink-0" />
                        <span className="text-xs font-medium truncate">
                          {comparison.items[winners.third]}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground flex-shrink-0">
                          {itemScores[comparison.items[winners.third]]}%
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Column toggles */}
              <div className="rounded-lg p-2 border border-border bg-background/50">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] font-medium text-muted-foreground hidden sm:inline mr-1">
                    Columns
                  </span>
                  {comparison.criteria.map((criterion) => (
                    <button
                      key={criterion.name}
                      type="button"
                      onClick={() => toggleColumnVisibility(criterion.name)}
                      title={
                        hiddenColumns.has(criterion.name)
                          ? `Show ${criterion.name}`
                          : `Hide ${criterion.name}`
                      }
                      className={`inline-flex items-center gap-1 px-1.5 py-1 rounded-md text-[10px] font-medium border transition-colors ${
                        hiddenColumns.has(criterion.name)
                          ? "bg-muted text-muted-foreground border-border"
                          : "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700"
                      }`}
                    >
                      {hiddenColumns.has(criterion.name) ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                      <span className="hidden md:inline truncate max-w-[8rem]">
                        {criterion.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Table */}
              <div className="rounded-lg border border-border bg-background/50 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-2 py-2 text-left sticky left-0 z-10 bg-muted border-r border-border shadow-[2px_0_6px_-2px_rgba(0,0,0,0.06)] dark:shadow-[2px_0_6px_-2px_rgba(0,0,0,0.35)]">
                          <button
                            type="button"
                            onClick={() => handleSort("name")}
                            className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                          >
                            Item
                            {getSortIcon("name")}
                          </button>
                        </th>
                        {showScores && (
                          <th className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleSort("score")}
                              className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                            >
                              Score
                              {getSortIcon("score")}
                            </button>
                          </th>
                        )}
                        {comparison.criteria.map(
                          (criterion) =>
                            !hiddenColumns.has(criterion.name) && (
                              <th
                                key={criterion.name}
                                className="px-2 py-2 text-center"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleSort(criterion.name)}
                                  className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-emerald-600 dark:hover:text-emerald-400"
                                >
                                  <span>{criterion.name}</span>
                                  {getSortIcon(criterion.name)}
                                </button>
                              </th>
                            ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {filteredIndices.map((itemIndex) => {
                        const item = comparison.items[itemIndex];
                        const isWinner = itemIndex === winners.winner;
                        const isRunnerUp = itemIndex === winners.runnerUp;
                        const isThird = itemIndex === winners.third;

                        return (
                          <tr
                            key={itemIndex}
                            className={`group hover:bg-muted/30 transition-colors ${
                              highlightedItem === item
                                ? "bg-emerald-50 dark:bg-emerald-950/20"
                                : ""
                            } ${
                              isWinner
                                ? "bg-yellow-50/80 dark:bg-yellow-950/20"
                                : isRunnerUp
                                  ? "bg-muted/20"
                                  : isThird
                                    ? "bg-orange-50/80 dark:bg-orange-950/20"
                                    : ""
                            }`}
                            onMouseEnter={() => setHighlightedItem(item)}
                            onMouseLeave={() => setHighlightedItem(null)}
                          >
                            <td
                              className={`px-2 py-2 ${getStickyItemCellClass(
                                highlightedItem === item,
                                isWinner,
                                isRunnerUp,
                                isThird,
                              )}`}
                            >
                              <div className="flex items-center gap-1.5 min-w-[6rem] max-w-[10rem]">
                                {isWinner && (
                                  <Crown className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0" />
                                )}
                                {isRunnerUp && (
                                  <Medal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                )}
                                {isThird && (
                                  <Award className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
                                )}
                                <span
                                  className={`font-medium text-foreground line-clamp-2 ${
                                    isWinner
                                      ? "text-yellow-800 dark:text-yellow-200"
                                      : ""
                                  }`}
                                >
                                  {item}
                                </span>
                              </div>
                            </td>
                            {showScores && (
                              <td className="px-2 py-2 text-center">
                                <span
                                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
                                    itemScores[item] >= 80
                                      ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                                      : itemScores[item] >= 60
                                        ? "bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300"
                                        : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                                  }`}
                                >
                                  {itemScores[item]}%
                                  {itemScores[item] >= 80 && (
                                    <Zap className="h-3 w-3 text-green-500" />
                                  )}
                                </span>
                              </td>
                            )}
                            {comparison.criteria.map(
                              (criterion) =>
                                !hiddenColumns.has(criterion.name) && (
                                  <td
                                    key={criterion.name}
                                    className="px-2 py-2 text-center"
                                  >
                                    {renderCellValue(
                                      criterion,
                                      criterion.values[itemIndex],
                                      itemIndex,
                                    )}
                                  </td>
                                ),
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ComparisonTableBlock;
