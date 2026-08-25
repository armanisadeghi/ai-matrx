import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Documentation",
  description: "Browse feature documentation and codebase guidance.",
  letter: "DO",
  canonicalPath: "/administration/documentation",
});

export default function DocumentationAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
