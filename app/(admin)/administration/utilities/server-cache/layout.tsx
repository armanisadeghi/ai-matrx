import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Server Cache",
  title: "Admin",
  description: "Server-side cache inspection and invalidation tools",
  letter: "SC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
