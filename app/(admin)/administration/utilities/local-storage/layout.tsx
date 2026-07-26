import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Local Storage",
  title: "Admin",
  description: "Inspect and manage local storage and cache data",
  letter: "LS",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
