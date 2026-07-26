import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Research System",
  title: "Admin",
  description: "Research pipeline configuration and data management",
  letter: "RS",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
