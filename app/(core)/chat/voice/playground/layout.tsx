import { createRouteMetadata } from "@/utils/route-metadata";

// One tab of the "Voice" tab shell — it names itself, so the browser tab and
// its badge change as a person switches tabs (scripts/check-tab-shell-titles.ts).
export const metadata = createRouteMetadata("/chat", {
  titlePrefix: "Playground",
  title: "Voice",
  letter: "PL",
});

export default function ChatVoicePlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
