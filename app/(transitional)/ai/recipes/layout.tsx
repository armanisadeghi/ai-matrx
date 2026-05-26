import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/ai/recipes", {
  title: "Recipes",
  description: "Browse and manage AI recipe templates",
});

export default function RecipesLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
