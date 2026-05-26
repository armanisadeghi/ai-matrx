import { ReactNode } from "react";
import { createClient } from "@/utils/supabase/server";
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
    recipe?.description?.slice(0, 120) || "Edit and customize your AI recipe";

  return createDynamicRouteMetadata("/ai/recipes", {
    titlePrefix: "Edit",
    title: name,
    description,
    letter: "RE",
  });
}

export default function EditRecipeLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
