"use client";
import React from "react";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import { DbFunctionNode } from "@/features/workflows/types";
import { NodeDefinitionType } from "../custom-node-definitions";
import { EnrichedBroker } from '@/features/workflows/utils/data-flow-manager';

interface RecipeOption {
    value: string;
    label: string;
}

interface RecipeCardSelectorProps {
    nodeData: DbFunctionNode;
    nodeDefinition: NodeDefinitionType;
    onConfirm: (updatedNodeData: DbFunctionNode) => void;
    onCancel: () => void;
    open: boolean;
    quickReferenceSelectOptions: RecipeOption[];
    onRecipeSelect: (recipeId: string) => void;
    enrichedBrokers: EnrichedBroker[];
}

const RecipeCardSelector: React.FC<RecipeCardSelectorProps> = ({
    nodeData,
    nodeDefinition,
    onConfirm,
    onCancel,
    open,
    quickReferenceSelectOptions,
    onRecipeSelect,
    enrichedBrokers
}) => {
    if (!open) return null;



    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <Card className="w-full max-w-4xl max-h-[90dvh] flex flex-col  py-4">
                <CardHeader className="flex flex-row items-center justify-between flex-shrink-0">
                    <div className="space-y-1 px-4">
                        <CardTitle>Select a Recipe</CardTitle>
                        <p className="text-sm text-muted-foreground">Choose a recipe to configure your node</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={onCancel}>
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {quickReferenceSelectOptions.map((recipe) => (
                            <Card
                                key={recipe.value}
                                className="cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] border-2 bg-gradient-to-br from-blue-50 to-blue-100 hover:from-blue-100 hover:to-blue-200 border-blue-200 hover:border-blue-300 dark:from-blue-950/30 dark:to-blue-900/30 dark:border-blue-800 dark:hover:border-blue-700"
                                onClick={() => onRecipeSelect(recipe.value)}
                            >
                                <CardContent className="p-4">
                                    <div className="space-y-2">
                                        <h3 className="font-medium text-md leading-tight line-clamp-2 text-slate-800 dark:text-slate-200">
                                            {recipe.label}
                                        </h3>
                                        <p className="text-[10px] text-muted-foreground font-mono leading-tight break-all">
                                            {recipe.value}
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    {quickReferenceSelectOptions.length === 0 && (
                        <div className="flex items-center justify-center p-8 text-muted-foreground">
                            <p>No recipes available</p>
                        </div>
                    )}
                </CardContent>
                <CardFooter className="flex justify-end space-x-2 flex-shrink-0 pt-4 pr-4">
                    <Button variant="outline" onClick={onCancel}>
                        <X className="mr-2 h-4 w-4" />
                        Cancel
                    </Button>
                </CardFooter>
            </Card>
        </div>
    );
};

export default RecipeCardSelector;