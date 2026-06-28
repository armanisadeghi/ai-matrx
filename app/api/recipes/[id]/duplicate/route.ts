import { createClient } from "@/utils/supabase/server";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import { NextRequest, NextResponse } from "next/server";

// POST /api/recipes/[id]/duplicate - Duplicate a recipe
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;

  try {
    const supabase = await createClient();

    // Get authenticated user
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch the recipe to duplicate
    const { data: recipe, error: fetchError } = await graveyardDb(supabase)
      .from("recipe")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !recipe) {
      console.error("Error fetching recipe:", fetchError);
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    // Create a duplicate recipe
    const { data: newRecipe, error: insertError } = await graveyardDb(supabase)
      .from("recipe")
      .insert({
        name: `${recipe.name} (Copy)`,
        description: recipe.description,
        tags: recipe.tags,
        sample_output: recipe.sample_output,
        is_public: false, // Always make copies private
        status: recipe.status,
        version: 1, // Start with version 1 for the copy
        post_result_options: recipe.post_result_options,
        user_id: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error duplicating recipe:", insertError);
      return NextResponse.json(
        { error: insertError.message || "Failed to duplicate recipe" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      recipe: newRecipe,
    });
  } catch (error) {
    console.error("Error in duplicate recipe route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
