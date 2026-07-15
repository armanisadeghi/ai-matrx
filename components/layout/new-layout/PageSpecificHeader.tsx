"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { ModulePage } from "@/components/matrx/navigation/types";
import { PageSpecificHeader } from "./PageSpecificHeaderPortal";

export { PageSpecificHeader } from "./PageSpecificHeaderPortal";

interface RecipeViewHeaderProps {
  recipeId: string;
}

export function RecipeViewHeader(props: RecipeViewHeaderProps) {
  const pathname = usePathname();
  const [RecipeViewHeaderCompact, setRecipeViewHeaderCompact] =
    useState<any>(null);

  const isRecipeView =
    !!pathname?.includes("/ai/recipes/") && !pathname?.includes("/edit");

  useEffect(() => {
    if (!isRecipeView) return;
    import("@/features/recipes/components/RecipeViewHeaderCompact").then(
      (module) => {
        setRecipeViewHeaderCompact(() => module.RecipeViewHeaderCompact);
      },
    );
  }, [isRecipeView]);

  if (!isRecipeView || !RecipeViewHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <RecipeViewHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface RecipeEditHeaderProps {
  recipeId: string;
  isDirty: boolean;
  isSaving: boolean;
  onSave: () => void;
  onSettingsClick: () => void;
  nextVersion: number;
}

export function RecipeEditHeader(props: RecipeEditHeaderProps) {
  const pathname = usePathname();
  const [RecipeEditHeaderCompact, setRecipeEditHeaderCompact] =
    useState<any>(null);

  const isRecipeEdit =
    !!pathname?.includes("/ai/recipes/") && !!pathname?.includes("/edit");

  useEffect(() => {
    if (!isRecipeEdit) return;
    import("@/features/recipes/components/RecipeEditHeaderCompact").then(
      (module) => {
        setRecipeEditHeaderCompact(() => module.RecipeEditHeaderCompact);
      },
    );
  }, [isRecipeEdit]);

  if (!isRecipeEdit || !RecipeEditHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <RecipeEditHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface AppletHeaderProps {
  appId?: string;
  isDemo?: boolean;
  isDebug?: boolean;
  activeAppletSlug?: string;
  isCreator?: boolean;
  isAdmin?: boolean;
  isPreview?: boolean;
}

export function AppletHeader(props: AppletHeaderProps) {
  const pathname = usePathname();
  const [AppletHeaderCompact, setAppletHeaderCompact] = useState<any>(null);

  useEffect(() => {
    if (!pathname?.includes("/apps/custom/")) return;
    // Applet header component not yet implemented
  }, [pathname]);

  if (!pathname?.includes("/apps/custom/") || !AppletHeaderCompact) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <AppletHeaderCompact {...props} />
    </PageSpecificHeader>
  );
}

interface ModuleHeaderProps {
  pages: ModulePage[];
  currentPath: string;
  moduleHome: string;
  moduleName?: string;
  className?: string;
}

export function ModuleHeader(props: ModuleHeaderProps) {
  // Dynamically import the component to avoid SSR issues
  const [ResponsiveModuleHeaderContent, setResponsiveModuleHeaderContent] =
    useState<any>(null);

  useEffect(() => {
    import("@/components/matrx/navigation/ResponsiveModuleHeaderContent").then(
      (module) => {
        setResponsiveModuleHeaderContent(() => module.default);
      },
    );
  }, []);

  if (!ResponsiveModuleHeaderContent) {
    return null;
  }

  return (
    <PageSpecificHeader>
      <ResponsiveModuleHeaderContent {...props} />
    </PageSpecificHeader>
  );
}
