import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Components",
  title: "Admin",
  description: "Official component library and design system reference",
  letter: "OC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
