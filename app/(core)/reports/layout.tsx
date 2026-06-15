import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/reports", {
  title: "Reports",
  description: "Operational reports and analytics for your workspace.",
});

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
