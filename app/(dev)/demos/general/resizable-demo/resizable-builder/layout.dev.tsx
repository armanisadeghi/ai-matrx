import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Resizable Builder",
  title: "Demo",
  description: "Build and tune resizable split panes and drag handles",
  letter: "Rb",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
