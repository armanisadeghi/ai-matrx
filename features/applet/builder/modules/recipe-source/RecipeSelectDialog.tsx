'use client';
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { RecipeSelectionList } from '@/features/applet/builder/modules/recipe-source/RecipeSelectionList';
import { 
  AppletSourceConfig 
} from '@/types/customAppTypes';

interface RecipeSelectDialogProps {
  // Dialog specific props
  showRecipeDialog: boolean;
  setShowRecipeDialog: (show: boolean) => void;
  
  // RecipeSelectionList compatible props
  initialSelectedRecipe?: string | null;
  onRecipeSelected?: (recipeId: string) => void;
  setCompiledRecipeId?: (id: string | null) => void;
  setNewApplet?: React.Dispatch<React.SetStateAction<any>>;
  initialSourceConfig?: AppletSourceConfig | null;
  setRecipeSourceConfig?: (sourceConfig: AppletSourceConfig | null) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  renderFooter?: (confirmHandler: () => Promise<void>, isConfirmDisabled: boolean) => React.ReactNode;
  versionDisplay?: "card" | "list";
}

export const RecipeSelectDialog: React.FC<RecipeSelectDialogProps> = ({
  // Dialog specific props
  showRecipeDialog,
  setShowRecipeDialog,
  
  // RecipeSelectionList compatible props
  initialSelectedRecipe = null,
  onRecipeSelected,
  setCompiledRecipeId,
  setNewApplet,
  initialSourceConfig = null,
  setRecipeSourceConfig,
  onConfirm,
  onCancel,
  renderFooter,
  versionDisplay = "list"
}) => {
  // Define the default dialog footer if no custom renderFooter is provided
  const defaultFooter = (confirmHandler: () => Promise<void>, isConfirmDisabled: boolean) => (
    <DialogFooter>
      <Button
        variant="outline"
        onClick={() => {
          if (onCancel) onCancel();
          setShowRecipeDialog(false);
        }}
        className="border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100"
      >
        Cancel
      </Button>
      <Button
        onClick={async () => {
          await confirmHandler();
          if (onConfirm) onConfirm();
          setShowRecipeDialog(false);
        }}
        disabled={isConfirmDisabled}
        className="bg-emerald-500 hover:bg-emerald-600 dark:bg-emerald-600 dark:hover:bg-emerald-700 text-white"
      >
        Select Recipe
      </Button>
    </DialogFooter>
  );

  return (
    <Dialog open={showRecipeDialog} onOpenChange={setShowRecipeDialog}>
      <DialogContent className="sm:max-w-xl md:max-w-3xl lg:max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Select a Recipe</DialogTitle>
          <DialogDescription>
            Choose a recipe and version to use for this applet
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 max-h-[70dvh] overflow-y-auto">
          <RecipeSelectionList
            initialSelectedRecipe={initialSelectedRecipe}
            onRecipeSelected={onRecipeSelected}
            setCompiledRecipeId={setCompiledRecipeId}
            setNewApplet={setNewApplet}
            initialSourceConfig={initialSourceConfig}
            setRecipeSourceConfig={setRecipeSourceConfig}
            versionDisplay={versionDisplay}
            renderFooter={renderFooter || defaultFooter}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RecipeSelectDialog;