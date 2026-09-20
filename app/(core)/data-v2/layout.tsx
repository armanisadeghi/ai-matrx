import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/data-v2", {
  title: "Data",
  description: "Work with your organization's shared records, tables, and assigned actions.",
  letter: "D2",
});

export default function UnifiedDataLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
