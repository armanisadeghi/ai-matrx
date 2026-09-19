import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Sandbox",
  title: "Admin",
  description: "Admin sandbox for testing and experimentation",
  letter: "ASB",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
