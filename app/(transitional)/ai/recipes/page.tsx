import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LayoutPanelTop } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { RecipesGridUnified } from "@/features/recipes/components/RecipesGridUnified";
import { RecipesPageHeader } from "@/features/recipes/components/RecipesPageHeader";

export default async function RecipesPage() {
    const supabase = await createClient();

    // Get the authenticated user (middleware ensures user exists)
    const {
        data: { user },
    } = await supabase.auth.getUser();

    // Fetch user's recipes with all relevant fields
    const { data: recipes, error } = await supabase
        .from("recipe")
        .select("id, name, description, tags, status")
        .eq("user_id", user!.id)
        .order("name", { ascending: true });

    if (error) {
        console.error("Error fetching recipes:", error);
        throw new Error("Failed to fetch recipes");
    }

    // Note: Recipe templates don't exist yet, so we skip that logic
    // This is a placeholder for future implementation

    return (
        <>
            <RecipesPageHeader />

            <div className="h-page w-full overflow-auto">
                <div className="container mx-auto px-4 sm:px-6 md:px-8 lg:px-12 py-4 sm:py-6 max-w-[1800px]">
                    <RecipesGridUnified recipes={recipes || []} />
                </div>
            </div>
        </>
    );
}

