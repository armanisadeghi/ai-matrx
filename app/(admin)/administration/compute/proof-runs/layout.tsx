import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Compute" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Proof Runs",
  title: "Compute",
  letter: "PF",
});

export default function AdministrationComputeProofRunsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
