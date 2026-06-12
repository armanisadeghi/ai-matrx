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
  Filter,
  Trophy,
  Medal,
  Award,
  TrendingUp,
  TrendingDown,
  Minus,
  Plus,
  Eye,
  EyeOff,
  Atom,
  Crown,
  Zap,
  Target,
  ThumbsUp,
  ThumbsDown,
  AlertCircle,
  ExternalLink,
  Printer,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";

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
                  className={`h-4 w-4 ${
                    star <= value
                      ? "text-yellow-500 fill-yellow-500"
                      : "text-gray-300 dark:text-gray-600"
                  }`}
                />
              ))}
              <span className="ml-1 text-sm font-medium text-gray-700 dark:text-gray-300">
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
      return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
    }

    if (sortDirection === "asc") {
      return <ArrowUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    } else if (sortDirection === "desc") {
      return <ArrowDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    }

    return <ArrowUpDown className="h-4 w-4 text-gray-400" />;
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

  return (
    <>
      {/* Fullscreen Backdrop */}
      {isFullScreen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsFullScreen(false)}
        />
      )}

      <div
        className={`w-full ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-4" : "py-6"}`}
      >
        <div
          className={`max-w-7xl mx-auto ${isFullScreen ? "bg-textured rounded-2xl shadow-2xl h-full max-h-[95dvh] w-full flex flex-col overflow-hidden" : ""}`}
        >
          {/* Fullscreen Header */}
          {isFullScreen && (
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
              <div className="flex items-center gap-3">
                <Table className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  Comparison Table
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={isPrinting}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-sm font-medium transition-all shadow-sm hover:bg-slate-600 dark:hover:bg-slate-700 disabled:opacity-50"
                >
                  <Printer className="h-4 w-4" />
                  <span>{isPrinting ? "Saving…" : "Print"}</span>
                </button>
                <button
                  onClick={() => setIsFullScreen(false)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all shadow-sm"
                >
                  <Minimize2 className="h-4 w-4" />
                  <span>Exit</span>
                </button>
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div className="p-6 space-y-6">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-emerald-100 via-teal-50 to-cyan-100 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/40 rounded-2xl p-6 shadow-lg border-2 border-emerald-200 dark:border-emerald-800/50">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-500 dark:bg-emerald-600 rounded-xl shadow-md">
                      <Table className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {comparison.title}
                      </h1>
                      {comparison.description && (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {comparison.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!isFullScreen && (
                      <>
                        <button
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
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 dark:bg-purple-600 text-white text-sm font-semibold shadow-md hover:bg-purple-600 dark:hover:bg-purple-700 hover:shadow-lg transform hover:scale-105 transition-all"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span>Canvas</span>
                        </button>
                        <button
                          onClick={handlePrint}
                          disabled={isPrinting}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-sm font-semibold shadow-md hover:bg-slate-600 dark:hover:bg-slate-700 hover:shadow-lg transform hover:scale-105 transition-all disabled:opacity-50"
                        >
                          <Printer className="h-4 w-4" />
                          <span>{isPrinting ? "Saving…" : "Print"}</span>
                        </button>
                        <button
                          onClick={() => setIsFullScreen(true)}
                          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 dark:bg-emerald-600 text-white text-sm font-semibold shadow-md hover:bg-emerald-600 dark:hover:bg-emerald-700 hover:shadow-lg transform hover:scale-105 transition-all"
                        >
                          <Maximize2 className="h-4 w-4" />
                          <span>Expand</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <input
                        type="text"
                        placeholder="Search items or criteria..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 pr-4 py-2 rounded-lg border-border bg-textured text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-emerald-500 focus:border-transparent text-sm"
                      />
                    </div>

                    <button
                      onClick={() => setShowScores(!showScores)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        showScores
                          ? "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-border"
                      }`}
                    >
                      {showScores ? "Hide Scores" : "Show Scores"}
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Comparing {comparison.items.length} items
                    </span>
                  </div>
                </div>
              </div>

              {/* Winners Podium */}
              {showScores && (
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 rounded-xl p-6 border border-yellow-200 dark:border-yellow-800/50">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Top Performers
                  </h3>
                  <div className="flex items-end justify-center gap-4">
                    {/* Runner-up (2nd place) */}
                    {winners.runnerUp !== undefined && (
                      <div className="text-center">
                        <div className="bg-gray-300 dark:bg-gray-600 rounded-lg p-4 mb-2 min-h-[80px] flex items-end">
                          <Medal className="h-8 w-8 text-gray-600 dark:text-gray-300 mx-auto" />
                        </div>
                        <div className="font-semibold text-gray-700 dark:text-gray-300">
                          {comparison.items[winners.runnerUp]}
                        </div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">
                          {itemScores[comparison.items[winners.runnerUp]]}%
                        </div>
                        <div className="text-xs text-gray-400">2nd</div>
                      </div>
                    )}

                    {/* Winner (1st place) */}
                    {winners.winner !== undefined && (
                      <div className="text-center">
                        <div className="bg-yellow-400 dark:bg-yellow-500 rounded-lg p-4 mb-2 min-h-[100px] flex items-end">
                          <Crown className="h-10 w-10 text-yellow-800 dark:text-yellow-900 mx-auto" />
                        </div>
                        <div className="font-bold text-yellow-800 dark:text-yellow-200">
                          {comparison.items[winners.winner]}
                        </div>
                        <div className="text-sm text-yellow-700 dark:text-yellow-300">
                          {itemScores[comparison.items[winners.winner]]}%
                        </div>
                        <div className="text-xs text-yellow-600 dark:text-yellow-400">
                          1st
                        </div>
                      </div>
                    )}

                    {/* Third place */}
                    {winners.third !== undefined && (
                      <div className="text-center">
                        <div className="bg-orange-300 dark:bg-orange-600 rounded-lg p-4 mb-2 min-h-[60px] flex items-end">
                          <Award className="h-6 w-6 text-orange-700 dark:text-orange-200 mx-auto" />
                        </div>
                        <div className="font-semibold text-orange-700 dark:text-orange-300">
                          {comparison.items[winners.third]}
                        </div>
                        <div className="text-sm text-orange-600 dark:text-orange-400">
                          {itemScores[comparison.items[winners.third]]}%
                        </div>
                        <div className="text-xs text-orange-500">3rd</div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Column Visibility Controls */}
              <div className="bg-textured rounded-lg p-4 border-border">
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Show/Hide Columns:
                    </span>
                  </div>
                  {comparison.criteria.map((criterion) => (
                    <button
                      key={criterion.name}
                      onClick={() => toggleColumnVisibility(criterion.name)}
                      className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                        hiddenColumns.has(criterion.name)
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
                          : "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                      }`}
                    >
                      {hiddenColumns.has(criterion.name) ? (
                        <EyeOff className="h-3 w-3" />
                      ) : (
                        <Eye className="h-3 w-3" />
                      )}
                      {criterion.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comparison Table */}
              <div
                ref={blockContentRef}
                className="bg-textured rounded-xl shadow-lg border-border overflow-hidden"
              >
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-900/50">
                      <tr>
                        <th className="px-6 py-4 text-left">
                          <button
                            onClick={() => handleSort("name")}
                            className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                          >
                            Item
                            {getSortIcon("name")}
                          </button>
                        </th>
                        {showScores && (
                          <th className="px-6 py-4 text-center">
                            <button
                              onClick={() => handleSort("score")}
                              className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
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
                                className="px-6 py-4 text-center"
                              >
                                <button
                                  onClick={() => handleSort(criterion.name)}
                                  className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                                >
                                  {criterion.name}
                                  {getSortIcon(criterion.name)}
                                </button>
                              </th>
                            ),
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredIndices.map((itemIndex, rowIndex) => {
                        const item = comparison.items[itemIndex];
                        const isWinner = itemIndex === winners.winner;
                        const isRunnerUp = itemIndex === winners.runnerUp;
                        const isThird = itemIndex === winners.third;

                        return (
                          <tr
                            key={itemIndex}
                            className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${
                              highlightedItem === item
                                ? "bg-emerald-50 dark:bg-emerald-950/20"
                                : ""
                            } ${
                              isWinner
                                ? "bg-yellow-50 dark:bg-yellow-950/20"
                                : isRunnerUp
                                  ? "bg-gray-50 dark:bg-gray-950/20"
                                  : isThird
                                    ? "bg-orange-50 dark:bg-orange-950/20"
                                    : ""
                            }`}
                            onMouseEnter={() => setHighlightedItem(item)}
                            onMouseLeave={() => setHighlightedItem(null)}
                          >
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-3">
                                {isWinner && (
                                  <Crown className="h-4 w-4 text-yellow-500" />
                                )}
                                {isRunnerUp && (
                                  <Medal className="h-4 w-4 text-gray-500" />
                                )}
                                {isThird && (
                                  <Award className="h-4 w-4 text-orange-500" />
                                )}
                                <span
                                  className={`font-medium text-gray-900 dark:text-gray-100 ${
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
                              <td className="px-6 py-4 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <div
                                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                                      itemScores[item] >= 80
                                        ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300"
                                        : itemScores[item] >= 60
                                          ? "bg-yellow-100 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300"
                                          : "bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300"
                                    }`}
                                  >
                                    {itemScores[item]}%
                                  </div>
                                  {itemScores[item] >= 80 && (
                                    <Zap className="h-4 w-4 text-green-500" />
                                  )}
                                </div>
                              </td>
                            )}
                            {comparison.criteria.map(
                              (criterion) =>
                                !hiddenColumns.has(criterion.name) && (
                                  <td
                                    key={criterion.name}
                                    className="px-6 py-4 text-center"
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

              {/* Summary Stats */}
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-textured rounded-lg p-4 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <Target className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Items Compared
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {comparison.items.length}
                  </div>
                </div>

                <div className="bg-textured rounded-lg p-4 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <Table className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Criteria
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {comparison.criteria.length}
                  </div>
                </div>

                <div className="bg-textured rounded-lg p-4 border-border">
                  <div className="flex items-center gap-3 mb-2">
                    <Atom className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                    <span className="font-semibold text-gray-900 dark:text-gray-100">
                      Avg Score
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {Math.round(
                      Object.values(itemScores).reduce((a, b) => a + b, 0) /
                        Object.values(itemScores).length,
                    )}
                    %
                  </div>
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
