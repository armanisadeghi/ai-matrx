"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  FolderOpen,
  ExternalLink,
  Star,
  BookOpen,
  Video,
  FileText,
  Maximize2,
  Minimize2,
  Search,
  Check,
  Clock,
  Award,
  Play,
  Globe,
  Zap,
  Users,
  TrendingUp,
  Heart,
  Printer,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";
import { matchesSearch as matchesSearchScoring } from "@/utils/search-scoring";

interface ResourceItem {
  id: string;
  title: string;
  url: string;
  description: string;
  type:
    | "documentation"
    | "tool"
    | "video"
    | "article"
    | "course"
    | "book"
    | "tutorial"
    | "other";
  duration?: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  rating?: number;
  isFavorite?: boolean;
  isCompleted?: boolean;
  tags?: string[];
}

interface ResourceCategory {
  id: string;
  name: string;
  description?: string;
  resources: ResourceItem[];
}

interface ResourceCollectionData {
  title: string;
  description?: string;
  categories: ResourceCategory[];
}

interface ResourceCollectionBlockProps {
  collection: ResourceCollectionData;
  taskId?: string;
}

const STAT_ITEMS = [
  { key: "total", label: "Items", icon: BookOpen },
  { key: "completed", label: "Done", icon: Check },
  { key: "favorites", label: "Saved", icon: Heart },
  { key: "progress", label: "Progress", icon: TrendingUp, suffix: "%" },
] as const;

const TYPE_ICONS = {
  documentation: BookOpen,
  tool: Zap,
  video: Video,
  article: FileText,
  course: Users,
  book: BookOpen,
  tutorial: Play,
  other: Globe,
} as const;

const TYPE_ICON_COLORS: Record<string, string> = {
  documentation: "text-blue-600 dark:text-blue-400",
  tool: "text-purple-600 dark:text-purple-400",
  video: "text-red-600 dark:text-red-400",
  article: "text-green-600 dark:text-green-400",
  course: "text-orange-600 dark:text-orange-400",
  book: "text-indigo-600 dark:text-indigo-400",
  tutorial: "text-pink-600 dark:text-pink-400",
  other: "text-muted-foreground",
};

const ResourceCollectionBlock: React.FC<ResourceCollectionBlockProps> = ({
  collection,
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
        await import("@/lib/block-print/dom-capture-block-printer");
      await captureBlockElement(
        blockContentRef.current,
        collection.title.replace(/\s+/g, "-").toLowerCase() || "resources",
        "portrait",
      );
    } catch (err) {
      console.error("[ResourceCollectionBlock] Print failed:", err);
    } finally {
      setIsPrinting(false);
    }
  }, [collection.title, isPrinting]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>("all");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    () =>
      new Set(
        collection.categories[0]?.id ? [collection.categories[0].id] : [],
      ),
  );
  const { open: openCanvas } = useCanvas();

  // Get all unique types and difficulties
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    collection.categories.forEach((cat) => {
      cat.resources.forEach((res) => types.add(res.type));
    });
    return Array.from(types);
  }, [collection.categories]);

  const allDifficulties = useMemo(() => {
    const difficulties = new Set<string>();
    collection.categories.forEach((cat) => {
      cat.resources.forEach((res) => {
        if (res.difficulty) difficulties.add(res.difficulty);
      });
    });
    return Array.from(difficulties);
  }, [collection.categories]);

  // Filter resources
  const filteredCategories = useMemo(() => {
    return collection.categories
      .map((category) => ({
        ...category,
        resources: category.resources.filter((resource) => {
          const matchesSearch =
            searchQuery === "" ||
            matchesSearchScoring(resource, searchQuery, [
              { get: (r) => r.title, weight: "title" },
              { get: (r) => r.description, weight: "body" },
              { get: (r) => r.tags, weight: "tag" },
            ]);

          const matchesType =
            selectedType === "all" || resource.type === selectedType;
          const matchesDifficulty =
            selectedDifficulty === "all" ||
            resource.difficulty === selectedDifficulty;

          return matchesSearch && matchesType && matchesDifficulty;
        }),
      }))
      .filter((category) => category.resources.length > 0);
  }, [collection.categories, searchQuery, selectedType, selectedDifficulty]);

  // Calculate progress
  const totalResources = collection.categories.reduce(
    (sum, cat) => sum + cat.resources.length,
    0,
  );
  const completedCount = completed.size;
  const progressPercentage =
    totalResources > 0
      ? Math.round((completedCount / totalResources) * 100)
      : 0;

  const stats = useMemo(
    () => ({
      total: totalResources,
      completed: completedCount,
      favorites: favorites.size,
      progress: progressPercentage,
    }),
    [totalResources, completedCount, favorites.size, progressPercentage],
  );

  const toggleFavorite = (resourceId: string) => {
    const newFavorites = new Set(favorites);
    if (newFavorites.has(resourceId)) {
      newFavorites.delete(resourceId);
    } else {
      newFavorites.add(resourceId);
    }
    setFavorites(newFavorites);
  };

  const toggleCompleted = (resourceId: string) => {
    const newCompleted = new Set(completed);
    if (newCompleted.has(resourceId)) {
      newCompleted.delete(resourceId);
    } else {
      newCompleted.add(resourceId);
    }
    setCompleted(newCompleted);
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

  const getTypeIcon = (type: string) => {
    const IconComponent = TYPE_ICONS[type as keyof typeof TYPE_ICONS] ?? Globe;
    const color = TYPE_ICON_COLORS[type] ?? TYPE_ICON_COLORS.other;
    return <IconComponent className={`h-3.5 w-3.5 flex-shrink-0 ${color}`} />;
  };

  const getDifficultyColor = (difficulty: string) => {
    const colorMap = {
      beginner:
        "text-green-700 dark:text-green-300 bg-green-100 dark:bg-green-950/30",
      intermediate:
        "text-yellow-700 dark:text-yellow-300 bg-yellow-100 dark:bg-yellow-950/30",
      advanced: "text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/30",
    };
    return colorMap[difficulty as keyof typeof colorMap] || "";
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-3 w-3 ${
              star <= rating
                ? "text-yellow-500 fill-yellow-500"
                : "text-gray-300 dark:text-gray-600"
            }`}
          />
        ))}
      </div>
    );
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
            <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30">
              <div className="flex items-center gap-2 min-w-0">
                <FolderOpen className="h-4 w-4 flex-shrink-0 text-violet-600 dark:text-violet-400" />
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {collection.title}
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
              <div className="bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-100 dark:from-violet-950/40 dark:via-purple-950/30 dark:to-fuchsia-950/40 rounded-xl p-2 border border-violet-200 dark:border-violet-800/50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="p-2 bg-violet-500 dark:bg-violet-600 rounded-lg flex-shrink-0">
                      <FolderOpen className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-sm font-bold text-foreground leading-tight line-clamp-2">
                        {collection.title}
                      </h1>
                      {collection.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {collection.description}
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
                            type: "resources",
                            data: collection,
                            metadata: {
                              title: collection.title,
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
                        className="bg-violet-500 dark:bg-violet-600 text-white hover:bg-violet-600 dark:hover:bg-violet-700"
                      />
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-1.5 mb-2">
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

                {/* Progress bar */}
                <div className="mb-2">
                  <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
                    <span className="hidden sm:inline">Progress</span>
                    <span className="tabular-nums">
                      {completedCount}/{totalResources}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 dark:bg-violet-600 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Search & filters */}
                <div className="flex flex-col sm:flex-row gap-1.5">
                  <div className="flex-1 relative min-w-0">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-8 pr-2 py-1.5 text-base sm:text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-1 focus:ring-violet-500 focus:border-transparent"
                      style={{ fontSize: "16px" }}
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="flex-1 sm:flex-none px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs min-w-0"
                    >
                      <option value="all">All types</option>
                      {allTypes.map((type) => (
                        <option key={type} value={type}>
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </select>
                    {allDifficulties.length > 0 && (
                      <select
                        value={selectedDifficulty}
                        onChange={(e) => setSelectedDifficulty(e.target.value)}
                        className="flex-1 sm:flex-none px-2 py-1.5 rounded-md border border-border bg-background text-foreground text-xs min-w-0"
                      >
                        <option value="all">All levels</option>
                        {allDifficulties.map((difficulty) => (
                          <option key={difficulty} value={difficulty}>
                            {difficulty.charAt(0).toUpperCase() +
                              difficulty.slice(1)}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Categories */}
              <div className="space-y-2">
                {filteredCategories.map((category) => {
                  const isExpanded = expandedCategories.has(category.id);
                  return (
                    <div
                      key={category.id}
                      className="rounded-lg border border-border bg-background/50 overflow-hidden"
                    >
                      <button
                        type="button"
                        onClick={() => toggleCategory(category.id)}
                        className="w-full px-2 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h2 className="text-sm font-semibold text-foreground truncate">
                            {category.name}
                          </h2>
                          {category.description && (
                            <p className="text-xs text-muted-foreground truncate">
                              {category.description}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground tabular-nums flex-shrink-0">
                          {category.resources.length}
                        </span>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border p-2">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 items-stretch">
                            {category.resources.map((resource) => {
                              const isDone = completed.has(resource.id);
                              const isFav = favorites.has(resource.id);
                              return (
                                <div
                                  key={resource.id}
                                  className={`flex flex-col h-full rounded-md border p-2 transition-colors ${
                                    isDone
                                      ? "border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20"
                                      : "border-border bg-card hover:border-violet-300 dark:hover:border-violet-700"
                                  }`}
                                >
                                  <div className="flex items-start gap-2 min-w-0 flex-1">
                                    {getTypeIcon(resource.type)}
                                    <div className="flex-1 min-w-0">
                                      <h3
                                        className={`text-sm font-medium leading-snug line-clamp-2 ${
                                          isDone
                                            ? "line-through text-green-700 dark:text-green-300"
                                            : "text-foreground"
                                        }`}
                                      >
                                        {resource.title}
                                      </h3>
                                      <p
                                        className={`text-xs text-muted-foreground mt-0.5 line-clamp-3 ${
                                          isDone ? "line-through" : ""
                                        }`}
                                      >
                                        {resource.description}
                                      </p>
                                      {(resource.difficulty ||
                                        resource.duration) && (
                                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                                          {resource.difficulty && (
                                            <span
                                              className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${getDifficultyColor(resource.difficulty)}`}
                                            >
                                              {resource.difficulty}
                                            </span>
                                          )}
                                          {resource.duration && (
                                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                                              <Clock className="h-3 w-3" />
                                              {resource.duration}
                                            </span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                                      <IconButton
                                        icon={Heart}
                                        tooltip={
                                          isFav
                                            ? "Remove from saved"
                                            : "Save resource"
                                        }
                                        onClick={() =>
                                          toggleFavorite(resource.id)
                                        }
                                        size="xs"
                                        iconClassName={
                                          isFav
                                            ? "fill-current text-pink-500"
                                            : ""
                                        }
                                        className={
                                          isFav
                                            ? "text-pink-600 dark:text-pink-400"
                                            : "text-muted-foreground"
                                        }
                                      />
                                      <IconButton
                                        icon={Check}
                                        tooltip={
                                          isDone
                                            ? "Mark incomplete"
                                            : "Mark complete"
                                        }
                                        onClick={() =>
                                          toggleCompleted(resource.id)
                                        }
                                        size="xs"
                                        className={
                                          isDone
                                            ? "text-green-600 dark:text-green-400"
                                            : "text-muted-foreground"
                                        }
                                      />
                                    </div>
                                  </div>

                                  <div className="mt-auto pt-2 flex flex-col gap-1.5">
                                    {resource.rating != null && (
                                      <div className="flex justify-center">
                                        {renderStars(resource.rating)}
                                      </div>
                                    )}
                                    <a
                                      href={resource.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center justify-center gap-1 w-full py-1.5 px-2 bg-violet-500 dark:bg-violet-600 hover:bg-violet-600 dark:hover:bg-violet-700 text-white text-xs font-medium rounded-md transition-colors"
                                    >
                                      <ExternalLink className="h-3 w-3" />
                                      <span className="hidden sm:inline">
                                        Open
                                      </span>
                                    </a>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {progressPercentage === 100 && totalResources > 0 && (
                <div className="rounded-lg p-3 border border-green-300 dark:border-green-700 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500 dark:bg-green-600 rounded-full flex-shrink-0">
                      <Award className="h-4 w-4 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-green-900 dark:text-green-100">
                        Collection complete
                      </h3>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        All resources in {collection.title} are done.
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResourceCollectionBlock;
