import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Users & Access" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Admins & Levels",
  title: "Users & Access",
  letter: "AD",
});

export default function AdministrationUsersAdminsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
