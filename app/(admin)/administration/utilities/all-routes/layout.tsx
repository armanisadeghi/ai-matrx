import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "All Routes",
  title: "Admin",
  description: "Browse and inspect all registered application routes",
  letter: "ALR",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
