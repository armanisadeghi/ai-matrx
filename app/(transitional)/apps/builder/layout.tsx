import { createRouteMetadata } from "@/utils/route-metadata";

// Force dynamic rendering for all builder pages to avoid build timeouts
export const dynamic = "force-dynamic";

export const metadata = createRouteMetadata("/apps", {
  titlePrefix: "Builder",
  title: "Apps",
  description: "Legacy builder modules, library, and field experiments.",
  letter: "Bd", // Builder modules
});

export default function BuilderLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
