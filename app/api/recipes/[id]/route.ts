import { createClient } from "@/utils/supabase/server";
import { graveyardDb } from "@/utils/supabase/graveyardDb";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/recipes/[id] - Delete a recipe
export async function DELETE(
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

    // Delete the recipe (RLS will ensure user owns it)
    const { error } = await graveyardDb(supabase)
      .from("recipe")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("Error deleting recipe:", error);
      return NextResponse.json(
        { error: error.message || "Failed to delete recipe" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in delete recipe route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
