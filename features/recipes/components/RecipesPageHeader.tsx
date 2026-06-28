"use client";

import { ChefHat } from "lucide-react";
import { PageSpecificHeader } from "@/components/layout/new-layout/PageSpecificHeaderPortal";

/**
 * RecipesPageHeader
 *
 * Clean, centered header for the recipes page.
 * Actions are handled by the UnifiedActionBar (mobile/desktop).
 */
export function RecipesPageHeader() {
  return (
    <PageSpecificHeader>
      <div className="flex items-center justify-center w-full">
        <ChefHat className="h-5 w-5 text-primary" />
        <h1 className="text-base font-bold ml-2">AI Recipes</h1>
      </div>
    </PageSpecificHeader>
  );
}
