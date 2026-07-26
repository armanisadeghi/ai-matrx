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
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      {children}
    </div>
  );
}
