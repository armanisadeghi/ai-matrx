import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Experimental",
  title: "Admin",
  description: "Experimental and preview feature routes",
  letter: "Ex",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
