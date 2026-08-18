import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Content Blocks",
  title: "Admin",
  description: "Manage reusable content block definitions and templates",
  letter: "CB",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
