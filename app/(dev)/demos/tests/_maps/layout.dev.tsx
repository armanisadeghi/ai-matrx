import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/tests", {
  titlePrefix: "Maps",
  title: "Tests",
  description: "Map component and geolocation tests",
  letter: "MP",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
