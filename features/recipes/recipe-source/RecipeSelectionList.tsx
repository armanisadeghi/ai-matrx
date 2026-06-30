"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { RecipeSearchFilters, RecipeList, ExtendedRecipeInfo } from "./RecipeDisplay";
import VersionSelector from "./RecipeVersionSelection";
import RecipeVersionSelectionCard from "./RecipeVersionSelectionCard";
import EmptyStateCard from "@/components/official/cards/EmptyStateCard";
import { BookOpenText } from "lucide-react";
import {
    getCompiledRecipeByVersion,
    checkCompiledRecipeVersionExists,
    getCompiledRecipeByVersionWithNeededBrokers,
    getUserRecipes,
} from "@/lib/redux/app-builder/service/customAppletService";
import { matchesSearch as matchesSearchScoring } from "@/utils/search-scoring";

export type RecipeInfo = {
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

export interface NeededBroker {
    id: string;
    name: string;
    required: boolean;
    dataType: string;
    defaultValue: string;
}

export interface RecipeSourceConfig {
    id: string;
    compiledId: string;
    version: number;
    neededBrokers: NeededBroker[];
}

export interface RecipeConfig {
    sourceType?: "recipe";
    config?: RecipeSourceConfig;
}

interface RecipeDefaultArgOverrides {
    recipe_id?: string;
    version?: number;
    latest_version?: boolean;
}

interface RecipeDefaultDependencies {
    source_broker_id: string;
    target_broker_id?: undefined;
}

export interface RecipeNodeDefaults {
    recipe_name?: string;
    needed_brokers?: NeededBroker[];
    arg_overrides?: RecipeDefaultArgOverrides;
    default_dependencies?: RecipeDefaultDependencies[];
}

export interface InitialConfig {
    recipeId?: string;
    version?: number;
    latestVersion?: boolean;
}

interface RecipeSelectionListProps {
    initialSelectedRecipe?: string | null;
    onRecipeSelected?: (recipeId: string) => void;
    setCompiledRecipeId?: (id: string | null) => void;
    setNewApplet?: React.Dispatch<React.SetStateAction<any>>;
    initialConfig: InitialConfig | null;
    setRecipeSourceConfig?: (sourceConfig: RecipeConfig | null) => void;
    setRecipeNodeDefaults?: (nodeDefaults: RecipeNodeDefaults | null) => void;
    onConfirm?: () => void;
    onCancel?: () => void;
    renderFooter?: (confirmHandler: () => Promise<void>, isConfirmDisabled: boolean) => React.ReactNode;
    versionDisplay?: "card" | "list";
}

export const RecipeSelectionList: React.FC<RecipeSelectionListProps> = ({
    initialSelectedRecipe,
    onRecipeSelected,
    setCompiledRecipeId,
    setNewApplet,
    initialConfig,
    setRecipeSourceConfig,
    setRecipeNodeDefaults,
    onConfirm,
    onCancel,
    renderFooter,
    versionDisplay = "list",
}) => {
    const { toast } = useToast();

    // State
    const [versionSelection, setVersionSelection] = useState<"latest" | "specific">(initialConfig?.version ? "specific" : "latest");

    const [specificVersion, setSpecificVersion] = useState<number>(initialConfig?.version || 1);
    const [isVersionValid, setIsVersionValid] = useState<boolean>(true);
    const [isCheckingVersion, setIsCheckingVersion] = useState<boolean>(false);
    const [searchTerm, setSearchTerm] = useState<string>("");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [userRecipes, setUserRecipes] = useState<RecipeInfo[]>([]);
    const [sourceConfig, setSourceConfig] = useState<RecipeConfig | null>(null);
    const [selectedRecipe, setSelectedRecipe] = useState<string | null>(initialConfig?.recipeId || initialSelectedRecipe || null);

    // Fetch recipes on component mount
    useEffect(() => {
        const fetchRecipes = async () => {
            setIsLoading(true);
            try {
                const recipes = await getUserRecipes();
                setUserRecipes(recipes);
            } catch (error) {
                console.error("Failed to fetch user recipes:", error);
                toast({
                    title: "Error",
                    description: "Failed to load recipes",
                    variant: "destructive",
                });
            } finally {
                setIsLoading(false);
            }
        };
        fetchRecipes();
    }, [toast]);

    // Initialize from initial config if available
    useEffect(() => {
        if (initialConfig?.recipeId) {
            setSelectedRecipe(initialConfig.recipeId);
            if (initialConfig.version) {
                setSpecificVersion(initialConfig.version);
                setVersionSelection("specific");
            } else {
                setVersionSelection("latest");
            }
            setIsVersionValid(true);
        }
    }, [initialConfig]);

    // Process recipes and extract tags
    const extendedRecipes = userRecipes.map((recipe) => ({
        ...recipe,
        originalTags: recipe.tags,
        tags: recipe.tags?.tags || ["recipe", recipe.status].filter(Boolean), // Fallback tags
    })) as ExtendedRecipeInfo[];

    // Get all unique tags
    const allTags = useMemo(() => {
        const tagSet = new Set<string>();
        extendedRecipes.forEach((recipe) => {
            if (recipe.tags) {
                recipe.tags.forEach((tag) => tagSet.add(tag));
            }
        });
        return Array.from(tagSet);
    }, [extendedRecipes]);

    // Filter recipes based on search and tags
    const filteredRecipes = useMemo(() => {
        return extendedRecipes.filter((recipe) => {
            // Search term filter
            const matchesSearch =
                searchTerm === "" ||
                matchesSearchScoring(recipe, searchTerm, [
                    { get: (r) => r.name, weight: "title" },
                    { get: (r) => r.description, weight: "body" },
                ]);
            // Tags filter
            const matchesTags = selectedTags.length === 0 || (recipe.tags && selectedTags.every((tag) => recipe.tags?.includes(tag)));
            return matchesSearch && matchesTags;
        });
    }, [extendedRecipes, searchTerm, selectedTags]);

    // Source config handling
    const handleGetSourceConfig = async (recipeId: string, version?: number) => {
        try {
            const compiledRecipeWithBrokerMapping = (await getCompiledRecipeByVersionWithNeededBrokers(recipeId, version)) as RecipeConfig;
            setSourceConfig(compiledRecipeWithBrokerMapping);
            if (setRecipeSourceConfig) {
                setRecipeSourceConfig(compiledRecipeWithBrokerMapping);
            }
            return compiledRecipeWithBrokerMapping;
        } catch (error) {
            console.error("Error getting source config:", error);
            toast({
                title: "Error",
                description: "Failed to get recipe configuration",
                variant: "destructive",
            });
            return null;
        }
    };

    // Recipe node defaults handling
    const handleSetRecipeNodeDefaults = async (recipeId: string, version?: number) => {
        try {
            // Get the source config first to get needed brokers
            const sourceConfigResult = await handleGetSourceConfig(recipeId, version);
            if (!sourceConfigResult || !sourceConfigResult.config) {
                return null;
            }

            // Get recipe name from userRecipes
            const selectedRecipeInfo = userRecipes.find((recipe) => recipe.id === recipeId);
            const recipeName = selectedRecipeInfo?.name;

            // Create arg overrides
            const argOverrides: RecipeDefaultArgOverrides = {
                recipe_id: recipeId,
                version: version,
                latest_version: !version, // if no version specified, it's latest
            };

            // Create default dependencies from needed brokers
            const defaultDependencies: RecipeDefaultDependencies[] = sourceConfigResult.config.neededBrokers.map((broker) => ({
                source_broker_id: broker.id,
                target_broker_id: undefined,
            }));

            // Create the recipe node defaults
            const recipeNodeDefaults: RecipeNodeDefaults = {
                recipe_name: recipeName,
                needed_brokers: sourceConfigResult.config.neededBrokers,
                arg_overrides: argOverrides,
                default_dependencies: defaultDependencies,
            };

            // Set the recipe node defaults if the setter is provided
            if (setRecipeNodeDefaults) {
                setRecipeNodeDefaults(recipeNodeDefaults);
            }

            return recipeNodeDefaults;
        } catch (error) {
            console.error("Error setting recipe node defaults:", error);
            toast({
                title: "Error",
                description: "Failed to set recipe node defaults",
                variant: "destructive",
            });
            return null;
        }
    };

    // Handle recipe selection
    const handleRecipeSelect = async (recipe: ExtendedRecipeInfo) => {
        setSelectedRecipe(recipe.id);
        if (onRecipeSelected) {
            onRecipeSelected(recipe.id);
        }
        await handleGetSourceConfig(recipe.id);
        await handleSetRecipeNodeDefaults(recipe.id);
        setSpecificVersion(recipe.version);
        setVersionSelection("latest");
        setIsVersionValid(true);
    };

    // Toggle tag selection
    const toggleTag = (tag: string) => {
        setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
    };

    // Clear filters
    const clearFilters = () => {
        setSearchTerm("");
        setSelectedTags([]);
    };

    // Version selection change handler
    const handleVersionSelectionChange = (value: "latest" | "specific") => {
        setVersionSelection(value);
        if (value === "latest" && selectedRecipe) {
            setIsVersionValid(true);
            fetchLatestCompiledRecipe();
        } else if (value === "specific" && selectedRecipe) {
            checkVersionExists();
        }
    };

    // Fetch latest compiled recipe
    const fetchLatestCompiledRecipe = async () => {
        if (!selectedRecipe || !setCompiledRecipeId) return;
        try {
            const id = await getCompiledRecipeByVersion(selectedRecipe);
            setCompiledRecipeId(id);
            await handleGetSourceConfig(selectedRecipe);
            await handleSetRecipeNodeDefaults(selectedRecipe);
        } catch (error) {
            console.error("Error fetching latest compiled recipe:", error);
            toast({
                title: "Error",
                description: "Failed to fetch latest compiled recipe",
                variant: "destructive",
            });
        }
    };

    // Handle specific version input change
    const handleSpecificVersionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = parseInt(e.target.value);
        if (!isNaN(value) && value > 0) {
            setSpecificVersion(value);
        }
    };

    // Check if specific version exists
    const checkVersionExists = async () => {
        if (!selectedRecipe || !setCompiledRecipeId) return;
        setIsCheckingVersion(true);
        await handleGetSourceConfig(selectedRecipe, specificVersion);
        try {
            const exists = await checkCompiledRecipeVersionExists(selectedRecipe, specificVersion);
            setIsVersionValid(exists);
            if (exists) {
                const id = await getCompiledRecipeByVersion(selectedRecipe, specificVersion);
                setCompiledRecipeId(id);
                await handleSetRecipeNodeDefaults(selectedRecipe, specificVersion);
            } else {
                setCompiledRecipeId(null);
            }
        } catch (error) {
            console.error("Error checking version:", error);
            toast({
                title: "Error",
                description: "Failed to check version availability",
                variant: "destructive",
            });
        } finally {
            setIsCheckingVersion(false);
        }
    };

    // Check version when specificVersion changes
    useEffect(() => {
        if (versionSelection === "specific" && selectedRecipe) {
            const timeoutId = setTimeout(() => {
                checkVersionExists();
            }, 500); // Debounce
            return () => clearTimeout(timeoutId);
        }
        return undefined;
    }, [specificVersion, selectedRecipe, versionSelection]);

    // Confirm recipe selection
    const confirmRecipeSelection = async () => {
        if (!selectedRecipe) return;
        try {
            let recipeId: string | null = null;
            let sourceConfigResult: RecipeConfig | null = null;
            let nodeDefaultsResult: RecipeNodeDefaults | null = null;

            if (versionSelection === "latest") {
                recipeId = await getCompiledRecipeByVersion(selectedRecipe);
                sourceConfigResult = await handleGetSourceConfig(selectedRecipe);
                nodeDefaultsResult = await handleSetRecipeNodeDefaults(selectedRecipe);
            } else {
                if (!isVersionValid) {
                    toast({
                        title: "Invalid Version",
                        description: `Version ${specificVersion} does not exist for this recipe`,
                        variant: "destructive",
                    });
                    return;
                }
                recipeId = await getCompiledRecipeByVersion(selectedRecipe, specificVersion);
                sourceConfigResult = await handleGetSourceConfig(selectedRecipe, specificVersion);
                nodeDefaultsResult = await handleSetRecipeNodeDefaults(selectedRecipe, specificVersion);
            }

            if (recipeId) {
                if (setCompiledRecipeId) {
                    setCompiledRecipeId(recipeId);
                }

                if (setNewApplet) {
                    setNewApplet((prev) => ({
                        ...prev,
                        compiledRecipeId: recipeId,
                    }));
                }

                if (setRecipeSourceConfig && sourceConfigResult) {
                    setRecipeSourceConfig(sourceConfigResult);
                }

                if (setRecipeNodeDefaults && nodeDefaultsResult) {
                    setRecipeNodeDefaults(nodeDefaultsResult);
                }

                const recipeName = userRecipes.find((recipe) => recipe.id === selectedRecipe)?.name;
                toast({
                    title: "Recipe Selected",
                    description: `Recipe "${recipeName}" ${
                        versionSelection === "latest" ? "(latest version)" : `(version ${specificVersion})`
                    } has been selected.`,
                });

                if (onConfirm) {
                    onConfirm();
                }
            } else {
                toast({
                    title: "Error",
                    description: "Could not find the compiled recipe",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error confirming recipe selection:", error);
            toast({
                title: "Error",
                description: "Failed to select recipe",
                variant: "destructive",
            });
        }
    };

    // Render the component with new layout
    return (
        <div className="space-y-4">
            {/* Search and Filter Controls at the top */}
            <RecipeSearchFilters
                allTags={allTags}
                selectedTags={selectedTags}
                searchTerm={searchTerm}
                onToggleTag={toggleTag}
                onSearchChange={(e) => setSearchTerm(e.target.value)}
                onClearFilters={clearFilters}
            />

            {/* Recipe List and Version Selection in columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Recipe List */}
                <RecipeList
                    filteredRecipes={filteredRecipes}
                    selectedRecipe={selectedRecipe}
                    isLoading={isLoading}
                    onRecipeSelect={handleRecipeSelect}
                />

                {/* Version Selector Component */}
                {versionDisplay === "card" ? (
                    selectedRecipe ? (
                        <RecipeVersionSelectionCard
                            filteredRecipes={filteredRecipes}
                            selectedRecipe={selectedRecipe}
                            versionSelection={versionSelection}
                            specificVersion={specificVersion}
                            isVersionValid={isVersionValid}
                            isCheckingVersion={isCheckingVersion}
                            onVersionSelectionChange={handleVersionSelectionChange}
                            onSpecificVersionChange={handleSpecificVersionChange}
                            useCardLayout={true}
                        />
                    ) : (
                        <div className="border-border rounded-lg">
                            <EmptyStateCard
                                title="No Recipe Selected"
                                description="Please select a recipe from the list to choose version"
                                icon={BookOpenText}
                            />
                        </div>
                    )
                ) : (
                    <VersionSelector
                        filteredRecipes={filteredRecipes}
                        selectedRecipe={selectedRecipe}
                        versionSelection={versionSelection}
                        specificVersion={specificVersion}
                        isVersionValid={isVersionValid}
                        isCheckingVersion={isCheckingVersion}
                        onVersionSelectionChange={handleVersionSelectionChange}
                        onSpecificVersionChange={handleSpecificVersionChange}
                    />
                )}
            </div>

            {/* Footer */}
            {renderFooter ? (
                renderFooter(confirmRecipeSelection, !selectedRecipe || (versionSelection === "specific" && !isVersionValid))
            ) : (
                <div className="flex justify-end gap-2 mt-4">
                    {onCancel && (
                        <Button
                            variant="outline"
                            onClick={onCancel}
                            className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
                        >
                            Cancel
                        </Button>
                    )}
                    <Button
                        onClick={confirmRecipeSelection}
                        disabled={!selectedRecipe || (versionSelection === "specific" && !isVersionValid)}
                        className="bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white"
                    >
                        Select Recipe
                    </Button>
                </div>
            )}
        </div>
    );
};

export default RecipeSelectionList;
