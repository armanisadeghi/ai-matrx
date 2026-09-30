import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Chat" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/chat", {
  titlePrefix: "New Chat",
  title: "Chat",
  letter: "NC",
});

export default function ChatNewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
