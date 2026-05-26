import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Maps",
  title: "Tests",
  description: "Map component and geolocation tests",
  letter: "Mp",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
