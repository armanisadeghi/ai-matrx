import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Voice Assistant",
  title: "Demo",
  description:
    "Voice assistant demo — speech, playback, and conversational UI patterns",
  letter: "VAS",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
