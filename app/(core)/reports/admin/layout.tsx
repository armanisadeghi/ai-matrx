import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/reports", {
  titlePrefix: "Admin",
  title: "Reports",
  description: "Reports feature map and admin resources.",
  letter: "Ra",
});

export default function ReportsAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
