import { createClient } from "@/utils/supabase/server";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RecipeViewContent } from "@/features/recipes/components/RecipeViewContent";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();

  const { data: recipe } = await supabase
    .from("recipe")
    .select("name, description")
    .eq("id", id)
    .single();

  const name = recipe?.name?.trim() || "Recipe";
  const description =
    recipe?.description?.slice(0, 120) ||
    "View your recipe details and configuration";

  return createDynamicRouteMetadata("/ai/recipes", {
    title: name,
    description,
    letter: "RV",
  });
}

export default async function ViewRecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Fetch recipe and compiled versions
  const [recipeResult, versionsResult] = await Promise.all([
    supabase
      .from("recipe")
      .select("id, name, description")
      .eq("id", id)
      .eq("user_id", user!.id)
      .single(),
    supabase
      .from("compiled_recipe")
      .select("id, recipe_id, version, compiled_recipe, created_at, updated_at")
      .eq("recipe_id", id)
      .eq("user_id", user!.id)
      .order("version", { ascending: false }),
  ]);

  const { data: recipe, error: recipeError } = recipeResult;
  const { data: compiledVersions, error: versionsError } = versionsResult;

  // Handle not found or access denied
  if (
    recipeError ||
    !recipe ||
    versionsError ||
    !compiledVersions ||
    compiledVersions.length === 0
  ) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <div className="max-w-md w-full p-8 text-center">
          <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full inline-block mb-4">
            <AlertCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Recipe Not Found
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {!recipe
              ? "This recipe either doesn't exist or you don't have permission to access it."
              : "No compiled versions found for this recipe."}
          </p>
          <Link href="/ai/recipes">
            <Button className="bg-purple-500 hover:bg-purple-600 text-white">
              Back to Recipes
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <RecipeViewContent
      recipeId={id}
      recipeName={recipe.name}
      compiledVersions={compiledVersions}
    />
  );
}
