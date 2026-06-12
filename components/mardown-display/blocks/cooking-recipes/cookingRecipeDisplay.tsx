import React, { useState, useMemo, useRef, useCallback } from "react";
import {
  ChefHat,
  Clock,
  Users,
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
  taskId?: string; // Task ID for canvas deduplication
}

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
        className={`w-full ${isFullScreen ? "fixed inset-0 z-50 flex items-center justify-center p-2" : "py-3"}`}
      >
        <div
          className={`max-w-6xl mx-auto ${isFullScreen ? "bg-textured rounded-xl shadow-2xl h-full max-h-[98dvh] w-full flex flex-col overflow-hidden" : ""}`}
        >
          {/* Scrollable Content */}
          <div className={isFullScreen ? "flex-1 overflow-y-auto" : ""}>
            <div className="p-3 space-y-3">
              {/* Header Section */}
              <div className="bg-gradient-to-br from-orange-100 via-amber-50 to-yellow-100 dark:from-orange-950/40 dark:via-amber-950/30 dark:to-yellow-950/40 rounded-xl p-4 shadow-md border border-orange-200 dark:border-orange-800/50">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-orange-500 dark:bg-orange-600 rounded-lg shadow-sm">
                      <ChefHat className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
                        {recipe.title}
                      </h1>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        {recipe.yields}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!isFullScreen && (
                      <>
                        <button
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
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-purple-500 dark:bg-purple-600 text-white text-xs font-semibold shadow-sm hover:bg-purple-600 dark:hover:bg-purple-700 hover:shadow-md transform hover:scale-105 transition-all"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Canvas</span>
                        </button>
                        <button
                          onClick={handlePrint}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-xs font-semibold shadow-sm hover:bg-slate-600 dark:hover:bg-slate-700 hover:shadow-md transform hover:scale-105 transition-all"
                        >
                          <Printer className="h-3 w-3" />
                          <span>Print</span>
                        </button>
                        <button
                          onClick={() => setIsFullScreen(true)}
                          className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-orange-500 dark:bg-orange-600 text-white text-xs font-semibold shadow-sm hover:bg-orange-600 dark:hover:bg-orange-700 hover:shadow-md transform hover:scale-105 transition-all"
                        >
                          <Maximize2 className="h-3 w-3" />
                          <span>Cook Mode</span>
                        </button>
                      </>
                    )}
                    {isFullScreen && (
                      <button
                        onClick={() => setIsFullScreen(false)}
                        className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium transition-all shadow-sm"
                      >
                        <Minimize2 className="h-3 w-3" />
                        <span>Exit</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="bg-textured/50 rounded-lg p-2 border border-orange-200 dark:border-orange-800/50">
                    <div className="flex items-center gap-1.5 text-orange-600 dark:text-orange-400 mb-0.5">
                      <Clock className="h-3 w-3" />
                      <span className="text-xs font-medium">Total</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {recipe.totalTime}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-2 border border-blue-200 dark:border-blue-800/50">
                    <div className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 mb-0.5">
                      <UtensilsCrossed className="h-3 w-3" />
                      <span className="text-xs font-medium">Prep</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {recipe.prepTime}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-2 border border-red-200 dark:border-red-800/50">
                    <div className="flex items-center gap-1.5 text-red-600 dark:text-red-400 mb-0.5">
                      <Flame className="h-3 w-3" />
                      <span className="text-xs font-medium">Cook</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {recipe.cookTime}
                    </div>
                  </div>
                  <div className="bg-textured/50 rounded-lg p-2 border border-green-200 dark:border-green-800/50">
                    <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 mb-0.5">
                      <Users className="h-3 w-3" />
                      <span className="text-xs font-medium">Progress</span>
                    </div>
                    <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                      {overallProgress}%
                    </div>
                  </div>
                </div>
              </div>

              {/* Main Content Grid */}
              <div ref={blockContentRef} className="grid lg:grid-cols-2 gap-3">
                {/* Ingredients Section */}
                <div className="space-y-2">
                  <div className="bg-textured rounded-xl p-4 shadow-md border-border">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        <Star className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        Ingredients
                      </h2>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => adjustServings(false)}
                          disabled={servingMultiplier <= 0.5}
                          className="p-1 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <Minus className="h-3 w-3 text-gray-700 dark:text-gray-300" />
                        </button>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 min-w-[2.5rem] text-center">
                          {servingMultiplier}x
                        </span>
                        <button
                          onClick={() => adjustServings(true)}
                          disabled={servingMultiplier >= 5}
                          className="p-1 rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                        >
                          <Plus className="h-3 w-3 text-gray-700 dark:text-gray-300" />
                        </button>
                      </div>
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

                    {/* Ingredients List */}
                    <div className="space-y-1.5 max-h-[400px] overflow-y-auto pr-2">
                      {recipe.ingredients.map((ingredient, index) => (
                        <div
                          key={index}
                          onClick={() => toggleIngredient(index)}
                          className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                            checkedIngredients.has(index)
                              ? "bg-purple-50 dark:bg-purple-950/30 border border-purple-300 dark:border-purple-700"
                              : "bg-gray-50 dark:bg-gray-900/50 border-border hover:border-purple-300 dark:hover:border-purple-700"
                          }`}
                        >
                          {checkedIngredients.has(index) ? (
                            <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                          ) : (
                            <Circle className="h-4 w-4 text-gray-400 dark:text-gray-600 flex-shrink-0 mt-0.5" />
                          )}
                          <div className="flex-1">
                            <span
                              className={`text-xs font-medium ${
                                checkedIngredients.has(index)
                                  ? "text-purple-900 dark:text-purple-200 line-through"
                                  : "text-gray-900 dark:text-gray-100"
                              }`}
                            >
                              {scaleAmount(ingredient.amount)}
                            </span>
                            <span
                              className={`text-xs ml-1.5 ${
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
                  <div className="bg-textured rounded-xl p-4 shadow-md border-border">
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
                    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                      {recipe.instructions.map((step, index) => (
                        <div
                          key={index}
                          onClick={() => toggleStep(index)}
                          className={`relative flex gap-3 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
                            completedSteps.has(index)
                              ? "bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700"
                              : "bg-gray-50 dark:bg-gray-900/50 border-border hover:border-blue-300 dark:hover:border-blue-700"
                          }`}
                        >
                          <div
                            className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
                              completedSteps.has(index)
                                ? "bg-green-500 dark:bg-green-600 text-white"
                                : "bg-blue-500 dark:bg-blue-600 text-white"
                            }`}
                          >
                            {completedSteps.has(index) ? "✓" : index + 1}
                          </div>
                          <div className="flex-1">
                            <div
                              className={`font-semibold text-xs mb-1 ${
                                completedSteps.has(index)
                                  ? "text-green-900 dark:text-green-200 line-through"
                                  : "text-gray-900 dark:text-gray-100"
                              }`}
                            >
                              {step.action}
                            </div>
                            <div
                              className={`text-xs ${
                                completedSteps.has(index)
                                  ? "text-green-700 dark:text-green-300 line-through"
                                  : "text-gray-700 dark:text-gray-300"
                              }`}
                            >
                              {step.description}
                            </div>
                            {step.time && (
                              <div
                                className={`flex items-center gap-1 mt-1.5 text-xs ${
                                  completedSteps.has(index)
                                    ? "text-green-600 dark:text-green-400"
                                    : "text-blue-600 dark:text-blue-400"
                                }`}
                              >
                                <Clock className="h-3 w-3" />
                                <span>{step.time}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
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
