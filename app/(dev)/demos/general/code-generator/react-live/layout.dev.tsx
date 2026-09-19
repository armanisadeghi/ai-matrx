import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "React Live",
  title: "Demo",
  description: "Live React code preview and execution playground",
  letter: "RLV",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
