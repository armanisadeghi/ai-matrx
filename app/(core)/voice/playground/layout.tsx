import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/voice", {
  titlePrefix: "Playground",
  title: "Voice",
  description:
    "Browse the voice catalog, tune speed and emotion, and stream live TTS previews.",
  letter: "Vp",
});

export default function VoicePlaygroundLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
