"use client";
import React from "react";
import { CheckIcon, SearchIcon, TagIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RecipeInfo } from "@/features/recipes/types";

// Extended RecipeInfo interface with extracted tags
export interface ExtendedRecipeInfo extends Omit<RecipeInfo, "tags"> {
    tags?: string[];
    originalTags?: { tags: string[] };
}

// Props for the RecipeSearchFilters component
interface RecipeSearchFiltersProps {
    allTags: string[];
    selectedTags: string[];
    searchTerm: string;
    onToggleTag: (tag: string) => void;
    onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearFilters: () => void;
}

// Component for recipe search and filter controls
export const RecipeSearchFilters: React.FC<RecipeSearchFiltersProps> = ({
    allTags,
    selectedTags,
    searchTerm,
    onToggleTag,
    onSearchChange,
    onClearFilters,
}) => {
    return (
        <div className="flex flex-col gap-3">
            {/* Search */}
            <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500" />
                <Input
                    type="text"
                    placeholder="Search recipes..."
                    value={searchTerm}
                    onChange={onSearchChange}
                    className="pl-9 border-gray-200 dark:border-gray-700 bg-textured"
                />
            </div>
            {/* Tags */}
            <div className="flex flex-wrap gap-2 items-center">
                <TagIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                {allTags.length < 10 ? (
                    <div className="flex items-center gap-2">
                        <Badge
                            variant="outline"
                            className="text-xs border-gray-200 dark:border-gray-700 bg-white/50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400"
                        >
                            {allTags.length === 0 ? "No Tags" : `${allTags.length} Tags`}
                        </Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                            {allTags.length === 0
                                ? "Hint: Use tags in the Cockpit to categorize your recipes"
                                : `You only have ${allTags.length} tags. Hint: Add more tags in the Cockpit`}
                        </span>
                    </div>
                ) : (
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300 mr-2">Tags</span>
                )}
                <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => (
                        <Badge
                            key={tag}
                            variant={selectedTags.includes(tag) ? "default" : "outline"}
                            className={`cursor-pointer ${
                                selectedTags.includes(tag)
                                    ? "bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700"
                                    : "border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800"
                            }`}
                            onClick={() => onToggleTag(tag)}
                        >
                            {tag}
                        </Badge>
                    ))}
                </div>
                {(searchTerm || selectedTags.length > 0) && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearFilters}
                        className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                    >
                        <XIcon className="h-3.5 w-3.5" />
                        Clear filters
                    </Button>
                )}
            </div>
        </div>
    );
};

// Props for the RecipeList component
interface RecipeListProps {
    filteredRecipes: ExtendedRecipeInfo[];
    selectedRecipe: string | null;
    isLoading: boolean;
    onRecipeSelect: (recipe: ExtendedRecipeInfo) => void;
}

// Component for displaying the recipe list
export const RecipeList: React.FC<RecipeListProps> = ({ filteredRecipes, selectedRecipe, isLoading, onRecipeSelect }) => {
    return (
        <div className="max-h-[30dvh] md:max-h-[40dvh] overflow-y-auto border-border rounded-lg">
            {isLoading ? (
                <div className="text-center py-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">Loading recipes...</p>
                </div>
            ) : filteredRecipes.length === 0 ? (
                <div className="text-center py-6">
                    <p className="text-sm text-gray-500 dark:text-gray-400">No recipes match your search</p>
                </div>
            ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredRecipes.map((recipe) => (
                        <li
                            key={recipe.id}
                            className={`px-4 py-2 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
                                selectedRecipe === recipe.id ? "bg-emerald-50 dark:bg-emerald-900/20" : ""
                            }`}
                            onClick={() => onRecipeSelect(recipe)}
                        >
                            <div className="flex-1 text-left">
                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 text-left">{recipe.name}</p>
                                <div className="flex items-center gap-2 mt-0.5 text-left">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        v{recipe.version} · {recipe.status}
                                    </span>
                                    {recipe.tags && recipe.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 ml-1">
                                            {recipe.tags.slice(0, 3).map((tag) => (
                                                <Badge
                                                    key={tag}
                                                    variant="outline"
                                                    className="text-[10px] px-1 py-0 h-4 border-gray-200 dark:border-gray-700"
                                                >
                                                    {tag}
                                                </Badge>
                                            ))}
                                            {recipe.tags.length > 3 && (
                                                <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                                    +{recipe.tags.length - 3}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                                {recipe.description && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate max-w-[400px] text-left">
                                        {recipe.description}
                                    </p>
                                )}
                            </div>
                            <div
                                className={`w-5 h-5 rounded-full flex-shrink-0 ml-2 ${
                                    selectedRecipe === recipe.id
                                        ? "bg-emerald-500 border-emerald-500 dark:bg-emerald-600 dark:border-emerald-600 flex items-center justify-center"
                                        : "border border-gray-300 dark:border-gray-600"
                                }`}
                            >
                                {selectedRecipe === recipe.id && <CheckIcon className="h-3 w-3 text-white" />}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

// For backwards compatibility
interface RecipeDisplayProps {
    filteredRecipes: ExtendedRecipeInfo[];
    allTags: string[];
    selectedRecipe: string | null;
    selectedTags: string[];
    searchTerm: string;
    isLoading: boolean;
    onRecipeSelect: (recipe: ExtendedRecipeInfo) => void;
    onToggleTag: (tag: string) => void;
    onSearchChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    onClearFilters: () => void;
}

export const RecipeDisplay: React.FC<RecipeDisplayProps> = (props) => {
    return (
        <div className="space-y-4">
            <RecipeSearchFilters
                allTags={props.allTags}
                selectedTags={props.selectedTags}
                searchTerm={props.searchTerm}
                onToggleTag={props.onToggleTag}
                onSearchChange={props.onSearchChange}
                onClearFilters={props.onClearFilters}
            />
            <RecipeList
                filteredRecipes={props.filteredRecipes}
                selectedRecipe={props.selectedRecipe}
                isLoading={props.isLoading}
                onRecipeSelect={props.onRecipeSelect}
            />
        </div>
    );
};

export default RecipeDisplay;
