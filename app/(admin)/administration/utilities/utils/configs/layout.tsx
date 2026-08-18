import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Configs",
  title: "Admin",
  description: "System configuration management and editor",
  letter: "UC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
