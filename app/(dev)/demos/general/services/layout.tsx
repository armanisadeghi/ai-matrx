import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Services",
  title: "Demo",
  description: "Service layer and callback pattern demos",
  letter: "Sv",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
