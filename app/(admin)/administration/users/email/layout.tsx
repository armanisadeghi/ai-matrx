import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Users & Access" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Email",
  title: "Users & Access",
  letter: "EM",
});

export default function AdministrationUsersEmailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
