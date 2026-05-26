import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "React Live",
  title: "Demo",
  description: "Live React code preview and execution playground",
  letter: "RL",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
