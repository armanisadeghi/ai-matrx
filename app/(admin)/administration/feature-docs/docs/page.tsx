import { createRouteMetadata } from "@/utils/route-metadata";
import FeatureDocsShell from "@/features/feature-docs/components/FeatureDocsShell";
import FeatureDocsTable from "@/features/feature-docs/components/FeatureDocsTable";

export const metadata = createRouteMetadata(
  "/administration/feature-docs/docs",
  {
    titlePrefix: "Feature Docs",
    title: "Docs",
    letter: "Fd",
  },
);

export default function FeatureDocsDocsPage() {
  return (
    <FeatureDocsShell
      zone="docs"
      title="Docs"
      subtitle="Root docs/ directory only"
    >
      <FeatureDocsTable zone="docs" />
    </FeatureDocsShell>
  );
}
