import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Database Admin",
  title: "Admin",
  description: "Advanced database administration and direct query tools",
  letter: "DA",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
