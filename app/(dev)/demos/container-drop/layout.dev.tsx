import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Container Drop",
  title: "Demo",
  description: "SSR container drop interaction demo",
  letter: "CDP",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
