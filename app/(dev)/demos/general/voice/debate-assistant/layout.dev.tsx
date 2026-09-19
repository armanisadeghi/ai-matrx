import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Debate Assistant",
  title: "Demo",
  description: "AI debate assistant voice demo",
  letter: "DBT",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
