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
  Filter,
  Check,
  Clock,
  Award,
  Bookmark,
  Eye,
  Play,
  Download,
  Globe,
  Code,
  Users,
  Zap,
  Target,
  TrendingUp,
  Heart,
  Printer,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
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
  taskId?: string; // Task ID for canvas deduplication
}

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
        await import("@/features/chat/utils/dom-capture-block-printer");
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
    new Set(["category-0"]),
  ); // First category expanded by default
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
    const iconMap = {
      documentation: BookOpen,
      tool: Zap,
      video: Video,
      article: FileText,
      course: Users,
      book: BookOpen,
      tutorial: Play,
      other: Globe,
    };
    const IconComponent = iconMap[type as keyof typeof iconMap] || Globe;
    return <IconComponent className="h-4 w-4" />;
  };

  const getTypeColor = (type: string) => {
    const colorMap = {
      documentation:
        "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
      tool: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800",
      video:
        "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
      article:
        "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
      course:
        "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800",
      book: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800",
      tutorial:
        "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800",
      other:
        "text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-950/30 border-gray-200 dark:border-gray-800",
    };
    return colorMap[type as keyof typeof colorMap] || colorMap.other;
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
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/30">
              <div className="flex items-center gap-3">
                <FolderOpen className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">
                  Resource Library
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
              <div className="bg-gradient-to-br from-violet-100 via-purple-50 to-fuchsia-100 dark:from-violet-950/40 dark:via-purple-950/30 dark:to-fuchsia-950/40 rounded-2xl p-6 shadow-lg border-2 border-violet-200 dark:border-violet-800/50">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-violet-500 dark:bg-violet-600 rounded-xl shadow-md">
                      <FolderOpen className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {collection.title}
                      </h1>
                      {collection.description && (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {collection.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isFullScreen && (
                    <div className="flex items-center gap-2">
                      <button
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
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-violet-500 dark:bg-violet-600 text-white text-sm font-semibold shadow-md hover:bg-violet-600 dark:hover:bg-violet-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Maximize2 className="h-4 w-4" />
                        <span>Library View</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Progress and Stats */}
                <div className="grid md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-textured/50 rounded-lg p-3 border border-violet-200 dark:border-violet-800/50">
                    <div className="flex items-center gap-2 text-violet-600 dark:text-violet-400 mb-1">
                      <BookOpen className="h-4 w-4" />
                      <span className="text-xs font-medium">
                        Total Resources
                      </span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {totalResources}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-green-200 dark:border-green-800/50">
                    <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                      <Check className="h-4 w-4" />
                      <span className="text-xs font-medium">Completed</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {completedCount}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-pink-200 dark:border-pink-800/50">
                    <div className="flex items-center gap-2 text-pink-600 dark:text-pink-400 mb-1">
                      <Heart className="h-4 w-4" />
                      <span className="text-xs font-medium">Favorites</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {favorites.size}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-3 border border-blue-200 dark:border-blue-800/50">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                      <TrendingUp className="h-4 w-4" />
                      <span className="text-xs font-medium">Progress</span>
                    </div>
                    <div className="text-lg font-bold text-gray-900 dark:text-gray-100">
                      {progressPercentage}%
                    </div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-4">
                  <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                    <span>Learning Progress</span>
                    <span>
                      {completedCount}/{totalResources} resources
                    </span>
                  </div>
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-violet-500 to-purple-500 dark:from-violet-600 dark:to-purple-600 transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercentage}%` }}
                    />
                  </div>
                </div>

                {/* Search and Filters */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search resources..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 rounded-lg border-border bg-textured text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
                    />
                  </div>

                  <div className="flex gap-2">
                    <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="px-3 py-2 rounded-lg border-border bg-textured text-gray-900 dark:text-gray-100 text-sm"
                    >
                      <option value="all">All Types</option>
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
                        className="px-3 py-2 rounded-lg border-border bg-textured text-gray-900 dark:text-gray-100 text-sm"
                      >
                        <option value="all">All Levels</option>
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

              {/* Resource Categories */}
              <div ref={blockContentRef} className="space-y-6">
                {filteredCategories.map((category, categoryIndex) => (
                  <div
                    key={category.id}
                    className="bg-textured rounded-xl shadow-lg border-border overflow-hidden"
                  >
                    <button
                      onClick={() => toggleCategory(category.id)}
                      className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                    >
                      <div className="text-left">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                          {category.name}
                        </h2>
                        {category.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {category.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-3 py-1 bg-violet-100 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium">
                          {category.resources.length} resources
                        </span>
                        {expandedCategories.has(category.id) ? (
                          <Eye className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                        ) : (
                          <Eye className="h-5 w-5 text-gray-300 dark:text-gray-600" />
                        )}
                      </div>
                    </button>

                    {expandedCategories.has(category.id) && (
                      <div className="border-t border-border p-6">
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                          {category.resources.map((resource) => (
                            <div
                              key={resource.id}
                              className={`p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${
                                completed.has(resource.id)
                                  ? "bg-green-50 dark:bg-green-950/20 border-green-300 dark:border-green-700"
                                  : "bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-700"
                              }`}
                            >
                              {/* Resource Header */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-start gap-2 flex-1">
                                  <div
                                    className={`p-1.5 rounded-md border ${getTypeColor(resource.type)}`}
                                  >
                                    {getTypeIcon(resource.type)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3
                                      className={`font-semibold text-sm leading-tight ${
                                        completed.has(resource.id)
                                          ? "line-through text-green-700 dark:text-green-300"
                                          : "text-gray-900 dark:text-gray-100"
                                      }`}
                                    >
                                      {resource.title}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span
                                        className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getTypeColor(resource.type)}`}
                                      >
                                        {resource.type}
                                      </span>
                                      {resource.difficulty && (
                                        <span
                                          className={`px-2 py-0.5 text-xs font-medium rounded-full ${getDifficultyColor(resource.difficulty)}`}
                                        >
                                          {resource.difficulty}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1 ml-2">
                                  <button
                                    onClick={() => toggleFavorite(resource.id)}
                                    className={`p-1.5 rounded-md transition-colors ${
                                      favorites.has(resource.id)
                                        ? "text-pink-600 dark:text-pink-400 bg-pink-50 dark:bg-pink-950/30"
                                        : "text-gray-400 dark:text-gray-600 hover:text-pink-500 dark:hover:text-pink-400"
                                    }`}
                                  >
                                    <Heart
                                      className={`h-4 w-4 ${favorites.has(resource.id) ? "fill-current" : ""}`}
                                    />
                                  </button>
                                  <button
                                    onClick={() => toggleCompleted(resource.id)}
                                    className={`p-1.5 rounded-md transition-colors ${
                                      completed.has(resource.id)
                                        ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/30"
                                        : "text-gray-400 dark:text-gray-600 hover:text-green-500 dark:hover:text-green-400"
                                    }`}
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Resource Description */}
                              <p
                                className={`text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2 ${
                                  completed.has(resource.id)
                                    ? "line-through"
                                    : ""
                                }`}
                              >
                                {resource.description}
                              </p>

                              {/* Resource Metadata */}
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  {resource.duration && (
                                    <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                                      <Clock className="h-3 w-3" />
                                      <span>{resource.duration}</span>
                                    </div>
                                  )}
                                  {resource.rating && (
                                    <div className="flex items-center gap-1">
                                      {renderStars(resource.rating)}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Resource Link */}
                              <a
                                href={resource.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 w-full py-2 px-3 bg-violet-500 dark:bg-violet-600 hover:bg-violet-600 dark:hover:bg-violet-700 text-white text-xs font-medium rounded-md transition-colors"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>Open Resource</span>
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Completion Celebration */}
              {progressPercentage === 100 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl p-6 border-2 border-green-300 dark:border-green-700 shadow-lg">
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="p-3 bg-green-500 dark:bg-green-600 rounded-full">
                      <Award className="h-8 w-8 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-green-900 dark:text-green-100 mb-1">
                        Collection Complete!
                      </h3>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        You've completed all resources in {collection.title}!
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
