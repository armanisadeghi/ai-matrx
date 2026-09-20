import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/approvals", {
  title: "Approvals",
  description: "Review work that needs your decision and complete the next step.",
  letter: "AV",
});

export default function ApprovalsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
