import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/scopes/context-lab", {
  titlePrefix: "Context Lab",
  title: "Demo",
  description: "Interactive scope and context assignment lab demo.",
  letter: "Dx",
});

export default function ContextLabDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
