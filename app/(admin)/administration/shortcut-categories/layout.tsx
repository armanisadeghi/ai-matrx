import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Shortcuts",
  title: "Admin",
  description: "Manage keyboard shortcut categories and bindings",
  letter: "SK",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
