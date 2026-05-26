import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Invitations",
  title: "Admin",
  description: "Manage user invitation requests and access grants",
  letter: "IR",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
