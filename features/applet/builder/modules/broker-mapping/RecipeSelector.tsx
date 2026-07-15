"use client";
import React, { useState } from "react";
import { BrainCog, TagIcon, ChevronRight, Cable } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextIconButton } from "@/components/official/TextIconButton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { RecipeInfo } from "@/features/recipes/types";
import { RecipeSelectDialog } from "@/features/applet/builder/modules/recipe-source/RecipeSelectDialog";
import { AppletSourceConfig } from "@/types/customAppTypes";
import { isRecipeAppletSourceConfig } from "@/features/applet/builder/utils/sourceConfigGuards";

/* For reference only (For a recipe, this is the AppletSourceConfig)

interface AppletSourceConfig {
    sourceType: "recipe";
    config: {
        id: string;
        compiledId: string;
        version: number;
        neededBrokers: NeededBroker[];
    }
}
    
*/

interface RecipeSelectorProps {
    onRecipeSelect: (compiledRecipeId: string) => void;
    className?: string;
    onGetSourceConfig: (mapping: AppletSourceConfig | null) => void;
    sourceConfig: AppletSourceConfig | null;
}

export const RecipeSelector: React.FC<RecipeSelectorProps> = ({
    onRecipeSelect,
    className,
    onGetSourceConfig,
    sourceConfig,
}) => {
    const { toast } = useToast();
    const [showRecipeDialog, setShowRecipeDialog] = useState(false);
    const initialRecipeSource = isRecipeAppletSourceConfig(sourceConfig) ? sourceConfig : null;
    const [selectedRecipe, setSelectedRecipe] = useState<RecipeInfo | null>(
        initialRecipeSource ? {
            id: initialRecipeSource.config.id,
            name: "Selected Recipe",
            version: initialRecipeSource.config.version,
            status: "selected",
        } : null
    );
    const [isLoading, setIsLoading] = useState(false);
    const [activeSourceConfig, setActiveSourceConfig] = useState<AppletSourceConfig | null>(sourceConfig);

    // Get the compiledId from the source config if available
    const activeRecipeSource = isRecipeAppletSourceConfig(activeSourceConfig) ? activeSourceConfig : null;
    const hasRecipeSelected = activeRecipeSource !== null;
    const activeCompiledId = activeRecipeSource?.config.compiledId ?? null;
        
    // Get the version from the source config if available
    const recipeVersion = hasRecipeSelected
        ? activeRecipeSource.config.version
        : selectedRecipe?.version;

    const handleSetSourceConfig = (sourceConfig: AppletSourceConfig | null) => {
        setActiveSourceConfig(sourceConfig);
        onGetSourceConfig(sourceConfig);
        
        if (isRecipeAppletSourceConfig(sourceConfig)) {
            onRecipeSelect(sourceConfig.config.compiledId);
        }
    };

    return (
        <div className={`${className}`}>
            <div className="space-y-3 pt-2">
                {!hasRecipeSelected ? (
                    <Button
                        variant="outline"
                        onClick={() => setShowRecipeDialog(true)}
                        className="w-full group border border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-750 h-14 transition-all duration-200"
                        disabled={isLoading}
                    >
                        <div className="flex items-center justify-center gap-2 text-gray-600 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                            <BrainCog className="h-5 w-5" />
                            <span className="font-medium">Select AI Recipe</span>
                            <ChevronRight className="h-4 w-4 opacity-70" />
                        </div>
                    </Button>
                ) : (
                    <div className="pt-3 px-3 bg-gray-50 dark:bg-gray-800 border-border rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 relative">
                        <div className="flex items-start">
                            <div className="mr-3 mt-0.5">
                                <BrainCog className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start">
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                                        {selectedRecipe ? selectedRecipe.name : "Recipe selected"}
                                    </p>
                                </div>
                                <div className="flex flex-col items-start">
                                    <div className="flex items-center gap-2 mb-1">
                                        {recipeVersion !== undefined && (
                                            <Badge
                                                variant="secondary"
                                                className="text-xs px-2 py-0 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                            >
                                                v{recipeVersion}
                                            </Badge>
                                        )}
                                        {selectedRecipe?.status && (
                                            <Badge
                                                variant="outline"
                                                className="text-xs px-2 py-0 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300"
                                            >
                                                {selectedRecipe.status}
                                            </Badge>
                                        )}
                                        <TextIconButton
                                            variant="ghost"
                                            size="sm"
                                            icon={<Cable />}
                                            iconPosition="right"
                                            tooltip="Change the recipe or the selected version"
                                            showTooltipOnDisabled={true}
                                            disabledTooltip="Cannot change recipe"
                                            onClick={() => setShowRecipeDialog(true)}
                                            className="text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-transparent"
                                        >
                                            Change Recipe
                                        </TextIconButton>
                                    </div>

                                    {selectedRecipe?.tags?.tags && selectedRecipe.tags.tags.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <TagIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                                            <div className="flex flex-wrap gap-1">
                                                {selectedRecipe.tags.tags.map((tag) => (
                                                    <Badge
                                                        key={tag}
                                                        variant="outline"
                                                        className="text-xs px-1.5 py-0 h-5 border-blue-200 dark:border-blue-700 bg-textured/60 text-blue-600 dark:text-blue-300"
                                                    >
                                                        {tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {activeCompiledId && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-mono">
                                            Compiled ID: {activeCompiledId}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            <RecipeSelectDialog
                showRecipeDialog={showRecipeDialog}
                setShowRecipeDialog={setShowRecipeDialog}
                initialSelectedRecipe={selectedRecipe?.id || null}
                initialSourceConfig={activeSourceConfig}
                setRecipeSourceConfig={handleSetSourceConfig}
                setCompiledRecipeId={(id) => {
                    if (id) onRecipeSelect(id);
                }}
                onRecipeSelected={(recipeId) => {
                    setSelectedRecipe(prev => prev?.id === recipeId ? prev : null);
                }}
            />
        </div>
    );
};

export default RecipeSelector;
