import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Window",
  title: "Demo",
  description: "SSR floating window panels demo",
  letter: "Wm",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
