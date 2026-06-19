"use client";
import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  ChefHat,
  Clock,
  CheckCircle2,
  Circle,
  Maximize2,
  Minimize2,
  Timer,
  Flame,
  UtensilsCrossed,
  AlertCircle,
  Star,
  Plus,
  Minus,
  ExternalLink,
  Printer,
} from "lucide-react";
import { useCanvas } from "@/features/canvas/hooks/useCanvas";
import IconButton from "@/components/official/IconButton";

interface Ingredient {
  amount: string;
  item: string;
}

interface RecipeStep {
  action: string;
  description: string;
  time?: string;
}

interface RecipeData {
  title: string;
  yields: string;
  totalTime: string;
  prepTime: string;
  cookTime: string;
  ingredients: Ingredient[];
  instructions: RecipeStep[];
  notes?: string;
}

interface RecipeViewerProps {
  recipe: RecipeData;
  taskId?: string;
}

const STAT_ITEMS = [
  { key: "totalTime", label: "Total", icon: Clock },
  { key: "prepTime", label: "Prep", icon: UtensilsCrossed },
  { key: "cookTime", label: "Cook", icon: Flame },
  { key: "progress", label: "Done", icon: CheckCircle2, suffix: "%" },
] as const;

const RecipeViewer: React.FC<RecipeViewerProps> = ({ recipe, taskId }) => {
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    new Set(),
  );
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [servingMultiplier, setServingMultiplier] = useState(1);
  const { open: openCanvas } = useCanvas();
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
        recipe.title.replace(/\s+/g, "-").toLowerCase() || "recipe",
        "portrait",
      );
    } catch (err) {
      console.error("[RecipeViewer] Print failed:", err);
    } finally {
      setIsPrinting(false);
    }
  }, [recipe.title, isPrinting]);

  // Calculate progress
  const ingredientProgress = useMemo(
    () =>
      Math.round((checkedIngredients.size / recipe.ingredients.length) * 100),
    [checkedIngredients.size, recipe.ingredients.length],
  );

  const stepProgress = useMemo(
    () => Math.round((completedSteps.size / recipe.instructions.length) * 100),
    [completedSteps.size, recipe.instructions.length],
  );

  const overallProgress = useMemo(
    () =>
      Math.round(
        ((checkedIngredients.size + completedSteps.size) /
          (recipe.ingredients.length + recipe.instructions.length)) *
          100,
      ),
    [
      checkedIngredients.size,
      completedSteps.size,
      recipe.ingredients.length,
      recipe.instructions.length,
    ],
  );

  const toggleIngredient = (index: number) => {
    const newChecked = new Set(checkedIngredients);
    if (newChecked.has(index)) {
      newChecked.delete(index);
    } else {
      newChecked.add(index);
    }
    setCheckedIngredients(newChecked);
  };

  const toggleStep = (index: number) => {
    const newCompleted = new Set(completedSteps);
    if (newCompleted.has(index)) {
      newCompleted.delete(index);
    } else {
      newCompleted.add(index);
    }
    setCompletedSteps(newCompleted);
  };

  const adjustServings = (increment: boolean) => {
    if (increment) {
      setServingMultiplier((prev) => Math.min(prev + 0.5, 5));
    } else {
      setServingMultiplier((prev) => Math.max(prev - 0.5, 0.5));
    }
  };

  const resetProgress = () => {
    setCheckedIngredients(new Set());
    setCompletedSteps(new Set());
  };

  // Scale ingredient amounts
  const scaleAmount = (amount: string): string => {
    if (servingMultiplier === 1) return amount;

    // Extract numbers and scale them
    return amount.replace(/(\d+(?:\.\d+)?)/g, (match) => {
      const num = parseFloat(match);
      const scaled = num * servingMultiplier;
      return scaled % 1 === 0 ? scaled.toString() : scaled.toFixed(1);
    });
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
        className={`w-full border border-border rounded-xl ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-2" : "py-2"}`}
      >
        <div
          className={`max-w-6xl mx-auto ${isFullScreen ? "bg-textured rounded-xl shadow-2xl h-full max-h-[98dvh] w-full flex flex-col overflow-hidden border border-border" : ""}`}
        >
          {isFullScreen && (
            <div className="flex-shrink-0 px-3 py-2 border-b border-border flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30">
              <div className="flex items-center gap-2 min-w-0">
                <ChefHat className="h-4 w-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
                <h3 className="text-sm font-semibold text-foreground truncate">
                  {recipe.title}
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
                  tooltip="Exit cook mode"
                  onClick={() => setIsFullScreen(false)}
                  size="sm"
                  variant="outline"
                />
              </div>
            </div>
          )}

          {/* Scrollable Content */}
          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div ref={blockContentRef} className="@container p-2 space-y-3">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-orange-100 via-amber-50 to-yellow-100 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-yellow-950/40 rounded-xl p-2 border border-orange-200 dark:border-orange-800/50">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-start gap-2 flex-1 min-w-0">
                    <div className="p-2 bg-orange-500 dark:bg-orange-600 rounded-lg flex-shrink-0">
                      <ChefHat className="h-4 w-4 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="text-sm font-bold text-foreground leading-tight line-clamp-2">
                        {recipe.title}
                      </h1>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {recipe.yields}
                      </p>
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
                            type: "recipe",
                            data: recipe,
                            metadata: {
                              title: recipe.title,
                              sourceTaskId: taskId,
                            },
                          })
                        }
                        size="sm"
                        className="bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700"
                      />
                      <IconButton
                        icon={Maximize2}
                        tooltip="Cook mode (full screen)"
                        onClick={() => setIsFullScreen(true)}
                        size="sm"
                        className="bg-orange-500 dark:bg-orange-600 text-white hover:bg-orange-600 dark:hover:bg-orange-700"
                      />
                    </div>
                  )}
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-4 gap-1.5">
                  {STAT_ITEMS.map((item) => {
                    const { key, label, icon: StatIcon } = item;
                    const suffix = "suffix" in item ? item.suffix : "";
                    let displayValue: string | number = overallProgress;
                    if (key === "totalTime") displayValue = recipe.totalTime;
                    else if (key === "prepTime") displayValue = recipe.prepTime;
                    else if (key === "cookTime") displayValue = recipe.cookTime;
                    else if (key === "progress") displayValue = overallProgress;
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
                        <div className="text-sm font-semibold text-foreground tabular-nums truncate">
                          {displayValue}
                          {suffix}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Main Content Grid — container query: stack until the block is wide enough */}
              <div className="grid grid-cols-1 @[550px]:grid-cols-2 gap-3">
                {/* Ingredients Section */}
                <div className="space-y-2">
                  <div className="bg-textured rounded-xl p-2 shadow-md border-border">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-3">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 min-w-0">
                        <Star className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0" />
                        Ingredients
                      </h2>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span>Gathered</span>
                        <span>
                          {checkedIngredients.size}/{recipe.ingredients.length}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-600 dark:to-pink-600 transition-all duration-300 rounded-full"
                          style={{ width: `${ingredientProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Servings + Ingredients List */}
                    <div className="space-y-1.5 pr-2">
                      <div className="flex items-center gap-2 pb-2 mb-1 border-b border-border/60 sticky top-0 bg-textured z-[1]">
                        <span className="text-xs font-semibold text-muted-foreground">
                          Servings
                        </span>
                        <div className="flex items-center gap-1.5 ml-auto">
                          <button
                            type="button"
                            onClick={() => adjustServings(false)}
                            disabled={servingMultiplier <= 0.5}
                            aria-label="Decrease servings"
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="min-w-[2rem] text-center font-bold text-xs tabular-nums text-purple-700 dark:text-purple-300">
                            {servingMultiplier}x
                          </span>
                          <button
                            type="button"
                            onClick={() => adjustServings(true)}
                            disabled={servingMultiplier >= 5}
                            aria-label="Increase servings"
                            className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-purple-500 dark:bg-purple-600 text-white hover:bg-purple-600 dark:hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>

                      {recipe.ingredients.map((ingredient, index) => (
                        <div
                          key={index}
                          onClick={() => toggleIngredient(index)}
                          className={`flex items-start gap-2 p-2 rounded-lg cursor-pointer transition-all duration-200 ${
                            checkedIngredients.has(index)
                              ? "border border-purple-300 dark:border-purple-700"
                              : "border-border hover:border-purple-300 dark:hover:border-purple-700"
                          }`}
                        >
                          <span className="flex h-4 w-4 flex-shrink-0 items-center justify-center">
                            {checkedIngredients.has(index) ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                            ) : (
                              <Circle className="h-3.5 w-3.5 text-gray-400 dark:text-gray-600" />
                            )}
                          </span>
                          <div className="flex-1 min-w-0 text-xs leading-4">
                            <span
                              className={`font-medium ${
                                checkedIngredients.has(index)
                                  ? "text-purple-900 dark:text-purple-200 line-through"
                                  : "text-gray-900 dark:text-gray-100"
                              }`}
                            >
                              {scaleAmount(ingredient.amount)}
                            </span>
                            <span
                              className={`ml-1.5 ${
                                checkedIngredients.has(index)
                                  ? "text-purple-700 dark:text-purple-300 line-through"
                                  : "text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {ingredient.item}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Instructions Section */}
                <div className="space-y-2">
                  <div className="bg-textured rounded-xl p-2 shadow-md border-border">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Timer className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Instructions
                      </h2>
                      {completedSteps.size > 0 && (
                        <button
                          onClick={resetProgress}
                          className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                        >
                          Reset
                        </button>
                      )}
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-3">
                      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span>Completed</span>
                        <span>
                          {completedSteps.size}/{recipe.instructions.length}
                        </span>
                      </div>
                      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-blue-600 dark:to-cyan-600 transition-all duration-300 rounded-full"
                          style={{ width: `${stepProgress}%` }}
                        />
                      </div>
                    </div>

                    {/* Steps List */}
                    <div className="space-y-2">
                      {recipe.instructions.map((step, index) => {
                        const isCompleted = completedSteps.has(index);
                        return (
                          <div
                            key={index}
                            onClick={() => toggleStep(index)}
                            className={`rounded-lg cursor-pointer transition-all duration-200 p-2 ${
                              isCompleted
                                ? "border border-green-300 dark:border-green-700"
                                : "border-border hover:border-blue-300 dark:hover:border-blue-700"
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                                  isCompleted
                                    ? "bg-green-500 dark:bg-green-600 text-white"
                                    : "bg-blue-500 dark:bg-blue-600 text-white"
                                }`}
                              >
                                {isCompleted ? "✓" : index + 1}
                              </div>
                              <div
                                className={`flex-1 min-w-0 font-semibold text-xs leading-snug ${
                                  isCompleted
                                    ? "text-green-900 dark:text-green-200 line-through"
                                    : "text-gray-900 dark:text-gray-100"
                                }`}
                              >
                                {step.action}
                              </div>
                            </div>

                            {!isCompleted && (
                              <div className="mt-2 space-y-1.5 w-full">
                                <p className="text-xs leading-relaxed text-gray-700 dark:text-gray-300">
                                  {step.description}
                                </p>
                                {step.time && (
                                  <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                    <span>{step.time}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes Section */}
              {recipe.notes && (
                <div className="bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800/50 shadow-sm">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-amber-900 dark:text-amber-200 mb-1 text-sm">
                        Pro Tips
                      </h3>
                      <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                        {recipe.notes}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Completion Message */}
              {overallProgress === 100 && (
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl p-4 border border-green-300 dark:border-green-700 shadow-md">
                  <div className="flex flex-col items-center text-center gap-2">
                    <div className="p-2 bg-green-500 dark:bg-green-600 rounded-full">
                      <CheckCircle2 className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-green-900 dark:text-green-100 mb-1">
                        Recipe Complete!
                      </h3>
                      <p className="text-xs text-green-700 dark:text-green-300">
                        Your {recipe.title.toLowerCase()} should be ready to
                        enjoy!
                      </p>
                    </div>
                    <button
                      onClick={resetProgress}
                      className="mt-1 px-3 py-1.5 bg-green-500 dark:bg-green-600 hover:bg-green-600 dark:hover:bg-green-700 text-white rounded-lg font-medium text-xs shadow-md hover:shadow-lg transform hover:scale-105 transition-all"
                    >
                      Start Again
                    </button>
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

export default RecipeViewer;
