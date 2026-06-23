import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/voice", {
  titlePrefix: "Tester",
  title: "Voice",
  description:
    "Side-by-side TTS comparison with latency metrics, buffer tuning, and preset scripts.",
  letter: "Vt",
});

export default function VoiceTesterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
