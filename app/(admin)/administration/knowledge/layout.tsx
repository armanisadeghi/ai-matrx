import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Knowledge",
  description:
    "Manage research, podcasts, knowledge graphs, and content systems.",
  letter: "KN",
  canonicalPath: "/administration/knowledge",
});

export default function KnowledgeAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
