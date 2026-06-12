import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agent-context", {
  titlePrefix: "Templates",
  title: "Agent Context",
  description: "Context item templates.",
  letter: "Te",
});

export default function ContextTemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
