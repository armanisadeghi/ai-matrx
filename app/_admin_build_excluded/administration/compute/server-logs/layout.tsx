import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Server Logs",
  title: "Admin",
  description: "Real-time server log viewer and analysis",
  letter: "SL",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
