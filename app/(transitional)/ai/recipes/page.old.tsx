import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, ChefHat } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { RecipesGrid } from "@/features/recipes/components/RecipesGrid";

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

    return (
        <div className="h-full w-full overflow-auto">
            <div className="container mx-auto px-6 py-6 max-w-[1800px]">
                {/* Header */}
                <div className="mb-6">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                        <div className="flex items-start sm:items-center gap-3">
                            <div className="p-3 bg-purple-100 dark:bg-purple-900 rounded-lg flex-shrink-0">
                                <ChefHat className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div>
                                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                                    Recipes
                                </h1>
                                <p className="text-gray-600 dark:text-gray-400 mt-1">
                                    Manage and convert your AI recipes
                                </p>
                            </div>
                        </div>
                        <Link href="/ai/recipes/new" className="w-full sm:w-auto">
                            <Button className="w-full sm:w-auto bg-purple-500 hover:bg-purple-600 dark:bg-purple-600 dark:hover:bg-purple-700 text-white">
                                <Plus className="h-4 w-4 mr-2" />
                                New Recipe
                            </Button>
                        </Link>
                    </div>
                </div>

                <RecipesGrid recipes={recipes || []} />
            </div>
        </div>
    );
}
