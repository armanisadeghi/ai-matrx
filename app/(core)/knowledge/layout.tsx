import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/knowledge", {
  title: "Knowledge",
  description:
    "Keep, organize and search everything you know — Sources, chats, notes, projects and more.",
  letter: "K",
});

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
