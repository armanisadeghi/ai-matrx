"use client";

import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast-service";
import { UnifiedListLayout } from "@/components/official/unified-list/UnifiedListLayout";
import type { UnifiedListLayoutConfig } from "@/components/official/unified-list/types";
import { recipesConfig, Recipe } from "../config/recipes-config";
import { RecipeCardUnified } from "./RecipeCardUnified";

interface RecipesGridUnifiedProps {
  recipes: Recipe[];
}

/**
 * RecipesGridUnified
 *
 * Recipes grid component using the UnifiedListLayout system.
 *
 * Features:
 * - Mobile-first design with floating action bar
 * - Desktop search bar with voice input
 * - Dynamic filtering and sorting
 * - Navigation state management
 * - Delete confirmations
 * - All the features from the prompts implementation
 */
export function RecipesGridUnified({ recipes }: RecipesGridUnifiedProps) {
  const router = useRouter();

  // Override config actions with actual implementations
  const config: UnifiedListLayoutConfig<Recipe> = {
    ...recipesConfig,
    page: {
      ...recipesConfig.page,
      emptyAction: {
        label: "Create Recipe",
        onClick: () => router.push("/ai/recipes/new"),
      },
    },
    actions: recipesConfig.actions.map((action) => ({
      ...action,
      onClick: () => {
        if (action.id === "new") {
          router.push("/ai/recipes/new");
        }
      },
    })),
    itemActions: {
      ...recipesConfig.itemActions,
      onView: (id: string) => `/ai/recipes/${id}`,
      onEdit: (id: string) => `/ai/recipes/${id}/edit`,
      onDelete: async (id: string) => {
        try {
          const response = await fetch(`/api/recipes/${id}`, {
            method: "DELETE",
          });

          if (!response.ok) {
            throw new Error("Failed to delete recipe");
          }

          router.refresh();
          toast.success("Recipe deleted successfully!");
        } catch (error) {
          console.error("Error deleting recipe:", error);
          toast.error("Failed to delete recipe. Please try again.");
          throw error; // Re-throw to keep deleting state
        }
      },
      onDuplicate: async (id: string) => {
        try {
          const response = await fetch(`/api/recipes/${id}/duplicate`, {
            method: "POST",
          });

          if (!response.ok) {
            throw new Error("Failed to duplicate recipe");
          }

          router.refresh();
          toast.success("Recipe duplicated successfully!");
        } catch (error) {
          console.error("Error duplicating recipe:", error);
          toast.error("Failed to duplicate recipe. Please try again.");
          throw error; // Re-throw to keep duplicating state
        }
      },
      customActions: recipesConfig.itemActions?.customActions?.map(
        (action) => ({
          ...action,
          onClick: (recipe: Recipe) => {
            if (action.id === "convert") {
              // The conversion dialog is handled in RecipeCardUnified
              // This is just a placeholder
            }
          },
        }),
      ),
    },
  };

  return (
    <UnifiedListLayout<Recipe>
      config={config}
      items={recipes}
      renderCard={(recipe, actions) => (
        <RecipeCardUnified recipe={recipe} actions={actions} />
      )}
    />
  );
}
