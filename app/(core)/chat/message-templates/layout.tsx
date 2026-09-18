import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/chat", {
  title: "Message Templates",
  description: "Create and manage reusable messages for chat and agents.",
  letter: "CMT",
});

export default function MessageTemplatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
