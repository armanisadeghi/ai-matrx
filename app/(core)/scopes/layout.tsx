import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/scopes", {
  title: "Scopes",
  description:
    "Define the dimensions your team works in — clients, products, teams, repos, and more.",
  letter: "Sc",
});

export default function ScopesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
