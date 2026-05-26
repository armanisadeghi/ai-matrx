import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "TTS With Controls",
  title: "Demo",
  description: "Text-to-speech demo with playback controls and voice settings",
  letter: "Vt",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
