"use client";
import React from "react";
import { CheckCircleIcon, InfoIcon, TagIcon, CogIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type RecipeInfo = {
  id: string;
  name: string;
  description?: string;
  version: number;
  status: string;
  post_result_options?: Record<string, unknown>;
  tags?: {
    tags: string[];
  };
};

interface ExtendedRecipeInfo extends Omit<RecipeInfo, "tags"> {
  tags?: string[];
  originalTags?: { tags: string[] };
}

interface RecipeVersionSelectionCardProps {
  filteredRecipes?: ExtendedRecipeInfo[];
  selectedRecipe: string | null;
  versionSelection: "latest" | "specific";
  specificVersion: number;
  isVersionValid: boolean;
  isCheckingVersion: boolean;
  onVersionSelectionChange: (value: "latest" | "specific") => void;
  onSpecificVersionChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  useCardLayout?: boolean;
}

export const RecipeVersionSelectionCard: React.FC<
  RecipeVersionSelectionCardProps
> = ({
  filteredRecipes = [],
  selectedRecipe,
  versionSelection,
  specificVersion,
  isVersionValid,
  isCheckingVersion,
  onVersionSelectionChange,
  onSpecificVersionChange,
  useCardLayout = true,
}) => {
  if (!selectedRecipe) return null;

  // Find the selected recipe details - only needed for card layout
  const selectedRecipeDetails = useCardLayout
    ? filteredRecipes.find((recipe) => recipe.id === selectedRecipe)
    : undefined;

  // If we're using card layout but couldn't find recipe details, don't render
  if (useCardLayout && !selectedRecipeDetails) return null;

  // Original simple version
  if (!useCardLayout) {
    return (
      <div className="w-full mt-4 p-3 border-border rounded-lg bg-gray-50 dark:bg-gray-800/50">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Version Selection
        </h3>
        <RadioGroup
          value={versionSelection}
          onValueChange={(v) =>
            onVersionSelectionChange(v as "latest" | "specific")
          }
          className="space-y-2 mt-2"
        >
          <div
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => onVersionSelectionChange("latest")}
          >
            <RadioGroupItem value="latest" id="latest" />
            <Label
              htmlFor="latest"
              className="text-gray-900 dark:text-gray-100 cursor-pointer"
            >
              Latest Version
            </Label>
          </div>
          <div
            className="flex items-center space-x-2 cursor-pointer"
            onClick={() => onVersionSelectionChange("specific")}
          >
            <RadioGroupItem value="specific" id="specific" />
            <Label
              htmlFor="specific"
              className="text-gray-900 dark:text-gray-100 cursor-pointer"
            >
              Specific Version
            </Label>
          </div>
        </RadioGroup>
        {versionSelection === "specific" && (
          <div className="mt-2 space-y-1">
            <div className="flex items-center space-x-2">
              <Input
                type="number"
                min="1"
                value={specificVersion}
                onChange={onSpecificVersionChange}
                className={`w-20 border-gray-200 dark:border-gray-700 bg-textured ${
                  !isVersionValid ? "border-red-300 dark:border-red-700" : ""
                }`}
              />
              {isCheckingVersion ? (
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  Checking...
                </span>
              ) : isVersionValid ? (
                <span className="flex items-center text-xs text-green-500 dark:text-green-400">
                  <CheckCircleIcon className="h-3 w-3" /> Version exists
                </span>
              ) : (
                <span className="text-xs text-red-500 dark:text-red-400">
                  Version not found
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter a version number to use (current version is{" "}
              {specificVersion})
            </p>
          </div>
        )}
      </div>
    );
  }

  // New card version with recipe details
  if (!selectedRecipeDetails) return null;

  return (
    <div className="w-full mt-4 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm">
      {/* Header */}
      <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CogIcon className="h-4 w-4 text-blue-500 dark:text-blue-400" />
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-200 text-left">
            Recipe Version Configuration
          </h3>
        </div>
        <Badge
          variant="outline"
          className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
        >
          {selectedRecipeDetails?.status}
        </Badge>
      </div>

      {/* Recipe Info */}
      <div className="px-4 py-4 bg-gradient-to-r from-blue-50/50 to-slate-50/50 dark:from-blue-900/10 dark:to-slate-800/60 border-b border-slate-200 dark:border-slate-700">
        <div className="flex flex-col gap-2 text-left">
          <h4 className="font-bold text-lg text-slate-900 dark:text-slate-100 text-left">
            {selectedRecipeDetails?.name}
          </h4>

          {selectedRecipeDetails?.description ? (
            <p className="text-xs text-slate-600 dark:text-slate-400 text-left">
              {selectedRecipeDetails.description}
            </p>
          ) : (
            <p className="text-xs text-slate-600 dark:text-slate-400 text-left">
              Your Recipe Has No Description. Hint: Add descriptions in the
              Cockpit to help you identify your recipes.
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-1">
            <span className="text-xs px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-slate-700 dark:text-slate-300">
              Current v{selectedRecipeDetails?.version}
            </span>

            {selectedRecipeDetails?.tags &&
            selectedRecipeDetails.tags.length > 0 ? (
              <div className="flex items-center gap-1.5">
                <TagIcon className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                <div className="flex flex-wrap gap-1">
                  {selectedRecipeDetails.tags.slice(0, 3).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 text-slate-700 dark:text-slate-300"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {selectedRecipeDetails.tags.length > 3 && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      +{selectedRecipeDetails.tags.length - 3}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <TagIcon className="h-3 w-3 text-slate-500 dark:text-slate-400" />
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4 border-slate-200 dark:border-slate-600 bg-white/50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400"
                >
                  No Tags
                </Badge>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">
                  Hint: Use tags in the Cockpit to categorize your recipes
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1 pt-2 border-t border-slate-200 dark:border-slate-700">
            <span className="text-sm font-medium text-slate-600 dark:text-slate-400 w-24">
              Recipe ID:
            </span>
            <span className="text-sm text-slate-700 dark:text-slate-300 font-mono text-xs break-all">
              {selectedRecipeDetails.id}
            </span>
          </div>
        </div>
      </div>

      {/* Version Selection */}
      <div className="p-4">
        <div className="mb-4">
          <h4 className="text-md font-medium text-blue-500 dark:text-blue-400 mb-3 text-left">
            Version Selection
          </h4>
          <RadioGroup
            value={versionSelection}
            onValueChange={(v) =>
              onVersionSelectionChange(v as "latest" | "specific")
            }
            className="space-y-2"
          >
            <div
              className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
              onClick={() => onVersionSelectionChange("latest")}
            >
              <RadioGroupItem
                value="latest"
                id="latest"
                className="border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-500"
              />
              <Label
                htmlFor="latest"
                className="text-slate-800 dark:text-slate-200 cursor-pointer text-left flex-1"
              >
                Latest Version
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 ml-1 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">
                      Always use the most recent version
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div
              className="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer"
              onClick={() => onVersionSelectionChange("specific")}
            >
              <RadioGroupItem
                value="specific"
                id="specific"
                className="border-slate-300 dark:border-slate-600 text-blue-600 dark:text-blue-500"
              />
              <Label
                htmlFor="specific"
                className="text-slate-800 dark:text-slate-200 cursor-pointer text-left flex-1"
              >
                Specific Version
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <InfoIcon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 ml-1 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Pin to a specific version number</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </RadioGroup>
        </div>

        {versionSelection === "specific" && (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-700/30 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-3">
              <div className="flex-grow max-w-[120px]">
                <Input
                  type="number"
                  min="1"
                  value={specificVersion}
                  onChange={onSpecificVersionChange}
                  className={`border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 ${
                    !isVersionValid
                      ? "border-red-300 dark:border-red-700 focus:ring-red-500 dark:focus:ring-red-600"
                      : "focus:ring-blue-500 dark:focus:ring-blue-600"
                  }`}
                />
              </div>
              {isCheckingVersion ? (
                <span className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">
                  Checking version...
                </span>
              ) : isVersionValid ? (
                <span className="flex items-center text-xs text-emerald-600 dark:text-emerald-500">
                  <CheckCircleIcon className="h-3 w-3" /> Version exists
                </span>
              ) : (
                <span className="text-xs text-red-500 dark:text-red-400">
                  Version not found
                </span>
              )}
            </div>
            <p className="text-xs mt-2 text-slate-500 dark:text-slate-400 text-left">
              Latest version is {selectedRecipeDetails?.version}.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecipeVersionSelectionCard;
