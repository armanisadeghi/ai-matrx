import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/notifications", {
  title: "Notifications",
  description: "Review updates, assignments, and messages that need your attention.",
  letter: "NF",
});

export default function NotificationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
