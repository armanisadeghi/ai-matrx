import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tools/scanner", {
  title: "Document Scanner",
  description: "Quickly scan documents and convert them to PDF.",
  letter: "DS",
});

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
