// No metadata export — title and favicon set by parent ai/recipes/layout.tsx.
// If per-recipe titles are needed in future, add generateMetadata using createDynamicRouteMetadata.
import { ReactNode } from "react";

export default function RecipeDetailLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}
