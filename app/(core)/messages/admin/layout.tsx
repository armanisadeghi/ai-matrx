import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Messages" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/messages", {
  titlePrefix: "Admin",
  title: "Messages",
  letter: "AD",
});

export default function MessagesAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
