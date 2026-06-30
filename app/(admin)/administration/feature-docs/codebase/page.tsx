import { createRouteMetadata } from "@/utils/route-metadata";
import FeatureDocsShell from "@/features/feature-docs/components/FeatureDocsShell";
import FeatureDocsTable from "@/features/feature-docs/components/FeatureDocsTable";

export const metadata = createRouteMetadata(
  "/administration/feature-docs/codebase",
  {
    titlePrefix: "Feature Docs",
    title: "Codebase",
    letter: "Fd",
  },
);

export default function FeatureDocsCodebasePage() {
  return (
    <FeatureDocsShell
      zone="codebase"
      title="Codebase"
      subtitle="app/, features/, components/, and other product markdown — excludes docs/ and tooling dirs"
    >
      <FeatureDocsTable zone="codebase" />
    </FeatureDocsShell>
  );
}
