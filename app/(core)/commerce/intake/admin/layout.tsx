import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Intake Capture" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/commerce/intake", {
  titlePrefix: "Admin",
  title: "Intake Capture",
  letter: "AD",
});

export default function CommerceIntakeAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
