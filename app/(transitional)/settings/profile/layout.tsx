import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Settings" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/settings", {
  titlePrefix: "Profile",
  title: "Settings",
  letter: "PO",
});

export default function SettingsProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
