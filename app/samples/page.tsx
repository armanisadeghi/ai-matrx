import { MonitorPlay } from "lucide-react";
import { StaticFilesIndexPage } from "@/components/ssr/StaticFilesIndexPage";

export const metadata = {
  title: "Samples",
  description: "Static HTML animation and design samples.",
};

export default function SamplesPage() {
  return (
    <StaticFilesIndexPage
      publicSubdir="samples"
      basePath="/samples"
      title="Samples"
      description="Static HTML prototypes and animation studies."
      icon={MonitorPlay}
      stripExtension={true}
    />
  );
}
