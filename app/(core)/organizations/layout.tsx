import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/organizations", {
  title: "Organizations",
  description: "Your personal workspace and team organizations.",
  letter: "O",
});

export default function OrganizationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
