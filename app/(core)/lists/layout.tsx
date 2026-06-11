import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/lists", {
  title: "Picklists",
  description:
    "Create and manage reusable option sets for dropdowns, dependent pickers, and forms.",
  letter: "Li",
});

export default function ListsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
