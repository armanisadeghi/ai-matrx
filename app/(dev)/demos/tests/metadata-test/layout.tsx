import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Metadata",
  title: "Tests",
  description: "Metadata and SEO tests",
  letter: "Md",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
