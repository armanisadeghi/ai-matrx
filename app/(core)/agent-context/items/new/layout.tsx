import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/agent-context", {
  titlePrefix: "New Item",
  title: "Agent Context",
  description: "Create a new context item.",
  letter: "X",
});

export default function NewContextItemLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
