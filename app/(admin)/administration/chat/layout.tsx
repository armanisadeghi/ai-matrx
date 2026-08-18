import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  title: "Chat",
  description:
    "Inspect conversations, requests, errors, usage, and chat system health.",
  letter: "CH",
  canonicalPath: "/administration/chat",
});

export default function ChatAdministrationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
