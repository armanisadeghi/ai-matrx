import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Compute" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Sandbox Infra",
  title: "Compute",
  letter: "SI",
});

export default function AdministrationComputeSandboxInfraLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
