import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration/feature-docs", {
  titlePrefix: "Feature Docs",
  title: "View",
  letter: "Fd",
});

export default function FeatureDocsViewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
