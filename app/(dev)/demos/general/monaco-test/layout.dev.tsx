import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Monaco",
  title: "Demo",
  description: "Monaco code editor embedding, themes, and language features",
  letter: "Mn",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
