import { RecipeReview } from "@/features/hindsight/recipes/RecipeReview";

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <RecipeReview id={id} />;
}
