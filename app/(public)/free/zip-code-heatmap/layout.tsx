import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/free/zip-code-heatmap", {
  titlePrefix: "Zip Heatmap",
  title: "Free Tools",
  description: "Visualize zip-code data on an interactive US map.",
  letter: "Zh",
});

export default function ZipCodeHeatmapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-[calc(100dvh-2.5rem)] flex-col overflow-y-auto overflow-x-hidden">
      {children}
    </div>
  );
}
