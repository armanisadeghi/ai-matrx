import { createRouteMetadata } from "@/utils/route-metadata";

// Force dynamic rendering for all test pages to avoid build timeouts
export const dynamic = "force-dynamic";

export const metadata = createRouteMetadata("/demos/tests", {
  title: "Tests",
  description: "Internal test and experimental routes for development",
  letter: "Tx",
});

// EntityPack wrapper removed during entity-isolation Phase 3 — the
// `(legacy)/layout.tsx` group layout now mounts EntityProviders (which
// includes EntityPack) for the whole legacy branch.
export default function TestsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
