"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  BarChart3,
  CheckCircle2,
  Circle,
  Target,
  Trophy,
  Flame,
  Calendar,
  Maximize2,
  Minimize2,
  Play,
  Pause,
  RotateCcw,
  TrendingUp,
  Award,
  Zap,
  Clock,
  Star,
  ChevronRight,
  ChevronDown,
  Plus,
  Minus,
  BookOpen,
  Code,
  Lightbulb,
  Users,
  Coffee,
  Heart,
  PartyPopper,
  Rainbow,
  ExternalLink,
  Upload,
  Printer,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import ImportTasksModal from "@/features/tasks/components/ImportTasksModal";
import { convertProgressToTasks } from "@/features/tasks/utils/importConverters";

interface ProgressItem {
  id: string;
  text: string;
  completed: boolean;
  optional?: boolean;
  priority?: "low" | "medium" | "high";
  estimatedHours?: number;
  category?: string;
}

interface ProgressCategory {
  id: string;
  name: string;
  description?: string;
  color?: string;
  items: ProgressItem[];
  completionPercentage?: number;
}

interface ProgressTrackerData {
  title: string;
  description?: string;
  categories: ProgressCategory[];
  overallProgress?: number;
  startDate?: string;
  targetDate?: string;
  totalItems?: number;
  completedItems?: number;
}

interface ProgressTrackerBlockProps {
  tracker: ProgressTrackerData;
  taskId?: string; // Task ID for canvas deduplication
}

const ProgressTrackerBlock: React.FC<ProgressTrackerBlockProps> = ({
  tracker,
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
        tracker.title.replace(/\s+/g, "-").toLowerCase() || "progress",
        "portrait",
      );
    } catch (err) {
      console.error("[ProgressTrackerBlock] Print failed:", err);
    } finally {
      setIsPrinting(false);
    }
  }, [tracker.title, isPrinting]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const { open: openCanvas } = useCanvas();

  // Initialize completedItems with items that are already marked as completed in the tracker data
  const [completedItems, setCompletedItems] = useState<Set<string>>(() => {
    const initialCompleted = new Set<string>();
    tracker.categories.forEach((category) => {
      category.items.forEach((item) => {
        if (item.completed) {
          initialCompleted.add(item.id);
        }
      });
    });
    return initialCompleted;
  });

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(["category-1"]),
  ); // First category expanded by default
  const [showCompletedOnly, setShowCompletedOnly] = useState(false);
  const [selectedPriority, setSelectedPriority] = useState<string>("all");

  // Convert progress tracker to tasks format
  const convertedTasks = useMemo(() => {
    return convertProgressToTasks(tracker.title, tracker.categories);
  }, [tracker]);

  // Build checkbox state from completed items
  const checkboxState = useMemo(() => {
    const state: Record<string, boolean> = {};
    convertedTasks.forEach((task) => {
      state[task.id] = task.checked || false;
      if (task.children) {
        task.children.forEach((child) => {
          state[child.id] = child.checked || false;
        });
      }
    });
    return state;
  }, [convertedTasks]);

  // Update completedItems when tracker data changes (in case the component receives new data)
  React.useEffect(() => {
    const newCompleted = new Set<string>();
    tracker.categories.forEach((category) => {
      category.items.forEach((item) => {
        if (item.completed) {
          newCompleted.add(item.id);
        }
      });
    });
    setCompletedItems(newCompleted);
  }, [tracker]);

  // Calculate dynamic progress
  const progressStats = useMemo(() => {
    const totalItems = tracker.categories.reduce(
      (sum, cat) => sum + cat.items.length,
      0,
    );
    const completedCount = completedItems.size;
    const overallPercentage =
      totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

    const categoryStats = tracker.categories.map((category) => {
      const categoryCompleted = category.items.filter((item) =>
        completedItems.has(item.id),
      ).length;
      const categoryTotal = category.items.length;
      const categoryPercentage =
        categoryTotal > 0
          ? Math.round((categoryCompleted / categoryTotal) * 100)
          : 0;

      return {
        ...category,
        completedCount: categoryCompleted,
        totalCount: categoryTotal,
        percentage: categoryPercentage,
      };
    });

    return {
      totalItems,
      completedCount,
      overallPercentage,
      categories: categoryStats,
    };
  }, [tracker.categories, completedItems]);

  const toggleItem = (itemId: string) => {
    const newCompleted = new Set(completedItems);
    if (newCompleted.has(itemId)) {
      newCompleted.delete(itemId);
    } else {
      newCompleted.add(itemId);
    }
    setCompletedItems(newCompleted);
  };

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleAllInCategory = (categoryId: string) => {
    const category = tracker.categories.find((cat) => cat.id === categoryId);
    if (!category) return;

    const newCompleted = new Set(completedItems);
    const allCompleted = category.items.every((item) =>
      completedItems.has(item.id),
    );

    if (allCompleted) {
      // Uncheck all items in category
      category.items.forEach((item) => newCompleted.delete(item.id));
    } else {
      // Check all items in category
      category.items.forEach((item) => newCompleted.add(item.id));
    }

    setCompletedItems(newCompleted);
  };

  const resetProgress = () => {
    setCompletedItems(new Set());
  };

  const getCategoryColor = (color: string | undefined, index: number) => {
    if (color) return color;
    const colors = [
      "from-blue-500 to-blue-600",
      "from-green-500 to-green-600",
      "from-purple-500 to-purple-600",
      "from-orange-500 to-orange-600",
      "from-pink-500 to-pink-600",
      "from-indigo-500 to-indigo-600",
      "from-red-500 to-red-600",
      "from-teal-500 to-teal-600",
    ];
    return colors[index % colors.length];
  };

  const getCategoryBorderColor = (color: string | undefined, index: number) => {
    if (color)
      return color
        .replace("from-", "border-")
        .replace(" to-blue-600", "")
        .replace(" to-green-600", "")
        .replace(" to-purple-600", "")
        .replace(" to-orange-600", "")
        .replace(" to-pink-600", "")
        .replace(" to-indigo-600", "")
        .replace(" to-red-600", "")
        .replace(" to-teal-600", "");
    const colors = [
      "border-blue-500",
      "border-green-500",
      "border-purple-500",
      "border-orange-500",
      "border-pink-500",
      "border-indigo-500",
      "border-red-500",
      "border-teal-500",
    ];
    return colors[index % colors.length];
  };

  const getPriorityColor = (priority: string | undefined) => {
    switch (priority) {
      case "high":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30";
      case "medium":
        return "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30";
      case "low":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30";
      default:
        return "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/30";
    }
  };

  const getCategoryIcon = (categoryName: string) => {
    const name = categoryName.toLowerCase();
    if (name.includes("learn") || name.includes("study")) return BookOpen;
    if (name.includes("code") || name.includes("dev")) return Code;
    if (name.includes("idea") || name.includes("concept")) return Lightbulb;
    if (name.includes("team") || name.includes("collab")) return Users;
    if (name.includes("break") || name.includes("rest")) return Coffee;
    if (name.includes("health") || name.includes("wellness")) return Heart;
    return Target;
  };

  // Filter items based on current filters
  const getFilteredCategories = () => {
    return progressStats.categories
      .map((category) => ({
        ...category,
        items: category.items.filter((item) => {
          const matchesPriority =
            selectedPriority === "all" || item.priority === selectedPriority;
          const matchesCompletion =
            !showCompletedOnly || completedItems.has(item.id);
          return matchesPriority && matchesCompletion;
        }),
      }))
      .filter((category) => category.items.length > 0);
  };

  const filteredCategories = getFilteredCategories();

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
          className={`max-w-6xl mx-auto ${isFullScreen ? "bg-textured rounded-2xl shadow-2xl h-full max-h-[95dvh] w-full flex flex-col overflow-hidden" : ""}`}
        >
          {/* Fullscreen Header */}
          {isFullScreen && (
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  Progress Tracker
                </h3>
              </div>
              <button
                onClick={() => setIsFullScreen(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all shadow-sm"
              >
                <Minimize2 className="h-4 w-4" />
                <span>Exit</span>
              </button>
            </div>
          )}

          {/* Scrollable Content */}
          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div className="p-6 space-y-6">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-blue-100 via-indigo-50 to-purple-100 dark:from-blue-950/40 dark:via-indigo-950/30 dark:to-purple-950/40 rounded-2xl p-6 shadow-lg border-2 border-blue-200 dark:border-blue-800/50">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-500 dark:bg-blue-600 rounded-xl shadow-md">
                      <BarChart3 className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {tracker.title}
                      </h1>
                      {tracker.description && (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {tracker.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isFullScreen && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsImportModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500 dark:bg-green-600 text-white text-sm font-semibold shadow-md hover:bg-green-600 dark:hover:bg-green-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Upload className="h-4 w-4" />
                        <span>Import to Tasks</span>
                      </button>
                      <button
                        onClick={() =>
                          openCanvas({
                            type: "progress",
                            data: tracker,
                            metadata: {
                              title: tracker.title,
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
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-sm font-semibold shadow-md hover:bg-slate-600 dark:hover:bg-slate-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Printer className="h-4 w-4" />
                        <span>Print</span>
                      </button>
                      <button
                        onClick={() => setIsFullScreen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-500 dark:bg-blue-600 text-white text-sm font-semibold shadow-md hover:bg-blue-600 dark:hover:bg-blue-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Maximize2 className="h-4 w-4" />
                        <span>Focus</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Overall Progress */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <Trophy className="h-6 w-6 text-yellow-500 dark:text-yellow-400" />
                      <span className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Overall Progress
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {progressStats.overallPercentage}%
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {progressStats.completedCount}/
                        {progressStats.totalItems} tasks
                      </span>
                    </div>
                  </div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 dark:from-blue-600 dark:to-purple-600 transition-all duration-500 rounded-full relative"
                      style={{ width: `${progressStats.overallPercentage}%` }}
                    >
                      {progressStats.overallPercentage > 15 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <Flame className="h-3 w-3 text-white animate-pulse" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-textured/50 rounded-lg p-3 border border-blue-200 dark:border-blue-800/50">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                      <Target className="h-4 w-4" />
                      <span className="text-xs font-medium">Total Goals</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {progressStats.totalItems}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-green-200 dark:border-green-800/50">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Completed</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {progressStats.completedCount}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-orange-200 dark:border-orange-800/50">
                    <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 mb-1">
                      <Clock className="h-4 w-4" />
                      <span className="text-xs font-medium">Remaining</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {progressStats.totalItems - progressStats.completedCount}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-purple-200 dark:border-purple-800/50">
                    <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs font-medium">Categories</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {tracker.categories.length}
                    </div>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
                  <div className="flex flex-wrap gap-2">
                    <select
                      value={selectedPriority}
                      onChange={(e) => setSelectedPriority(e.target.value)}
                      className="px-3 py-2 rounded-lg border-border bg-textured text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="all">All Priority</option>
                      <option value="high">High Priority</option>
                      <option value="medium">Medium Priority</option>
                      <option value="low">Low Priority</option>
                    </select>

                    <button
                      onClick={() => setShowCompletedOnly(!showCompletedOnly)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        showCompletedOnly
                          ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-border"
                      }`}
                    >
                      {showCompletedOnly ? "Show All" : "Completed Only"}
                    </button>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={resetProgress}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-colors"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span>Reset</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Progress Categories */}
              <div ref={blockContentRef} className="space-y-4">
                {filteredCategories.map((category, categoryIndex) => {
                  const IconComponent = getCategoryIcon(category.name);
                  const gradientColor = getCategoryColor(
                    category.color,
                    categoryIndex,
                  );
                  const borderColor = getCategoryBorderColor(
                    category.color,
                    categoryIndex,
                  );
                  const isExpanded = expandedCategories.has(category.id);
                  const allItemsCompleted = category.items.every((item) =>
                    completedItems.has(item.id),
                  );

                  return (
                    <div
                      key={category.id}
                      className={`bg-textured rounded-xl shadow-lg border-2 ${borderColor} dark:border-opacity-50 overflow-hidden`}
                    >
                      <div className="p-4">
                        {/* Category Header */}
                        <div className="flex items-center justify-between mb-4">
                          <button
                            onClick={() => toggleCategory(category.id)}
                            className="flex items-center gap-3 flex-1 text-left hover:opacity-80 transition-opacity"
                          >
                            <div
                              className={`p-2 bg-gradient-to-br ${gradientColor} rounded-lg shadow-md`}
                            >
                              <IconComponent className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                {category.name}
                              </h2>
                              {category.description && (
                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                  {category.description}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                                {category.completedCount}/{category.totalCount}
                              </span>
                              <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                {category.percentage}%
                              </div>
                              {isExpanded ? (
                                <ChevronDown className="h-5 w-5 text-gray-400" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-gray-400" />
                              )}
                            </div>
                          </button>
                        </div>

                        {/* Category Progress Bar */}
                        <div className="mb-4">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                              Progress
                            </span>
                            <button
                              onClick={() => toggleAllInCategory(category.id)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                            >
                              {allItemsCompleted ? "Uncheck All" : "Check All"}
                            </button>
                          </div>
                          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden shadow-inner">
                            <div
                              className={`h-full bg-gradient-to-r ${gradientColor} transition-all duration-300 rounded-full`}
                              style={{ width: `${category.percentage}%` }}
                            />
                          </div>
                        </div>

                        {/* Category Items */}
                        {isExpanded && (
                          <div className="space-y-2">
                            {category.items.map((item) => {
                              const isCompleted = completedItems.has(item.id);
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => toggleItem(item.id)}
                                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all text-left ${
                                    isCompleted
                                      ? "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-950/30"
                                      : "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800/50"
                                  }`}
                                >
                                  <div className="flex-shrink-0">
                                    {isCompleted ? (
                                      <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                                    ) : (
                                      <Circle className="h-5 w-5 text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400" />
                                    )}
                                  </div>

                                  <div className="flex-1 min-w-0">
                                    <span
                                      className={`text-sm font-medium ${
                                        isCompleted
                                          ? "line-through text-green-700 dark:text-green-300"
                                          : "text-gray-900 dark:text-gray-100"
                                      }`}
                                    >
                                      {item.text}
                                    </span>

                                    <div className="flex items-center gap-2 mt-1">
                                      {item.priority && (
                                        <span
                                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${getPriorityColor(item.priority)}`}
                                        >
                                          {item.priority}
                                        </span>
                                      )}
                                      {item.optional && (
                                        <span className="px-2 py-0.5 text-xs font-medium rounded-full text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30">
                                          optional
                                        </span>
                                      )}
                                      {item.estimatedHours && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                          <Clock className="h-3 w-3" />
                                          {item.estimatedHours}h
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Completion Celebration */}
              {progressStats.overallPercentage === 100 && (
                <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 rounded-xl p-6 border-2 border-yellow-300 dark:border-yellow-700 shadow-lg">
                  <div className="flex flex-col items-center text-center gap-4">
                    <div className="relative">
                      <div className="p-4 bg-yellow-500 dark:bg-yellow-600 rounded-full shadow-lg">
                        <Trophy className="h-12 w-12 text-white" />
                      </div>
                      <div className="absolute -top-2 -right-2 animate-bounce">
                        <Star className="h-8 w-8 text-yellow-400 dark:text-yellow-300 fill-current" />
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <PartyPopper className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                        <h3 className="text-2xl font-bold text-yellow-900 dark:text-yellow-100">
                          Congratulations!
                        </h3>
                        <Rainbow className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                      </div>
                      <p className="text-yellow-700 dark:text-yellow-300 text-lg">
                        You've completed all tasks in {tracker.title}!
                      </p>
                      <div className="flex items-center justify-center gap-2 mt-2">
                        <Award className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                        <p className="text-sm text-yellow-600 dark:text-yellow-400">
                          Amazing work! Time to celebrate your achievement!
                        </p>
                        <Zap className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      <ImportTasksModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        tasks={convertedTasks}
        checkboxState={checkboxState}
      />
    </>
  );
};

export default ProgressTrackerBlock;
