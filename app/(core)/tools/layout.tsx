import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tools/pdf-extractor", {
  title: "PDF Extractor",
  description: "Extract, annotate, and work with PDF documents.",
  letter: "E",
});

export default function ToolsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
