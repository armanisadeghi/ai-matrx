import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/trash", {
  title: "Trash",
  description: "Restore recently deleted work across AI Matrx.",
});

export default function TrashLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
