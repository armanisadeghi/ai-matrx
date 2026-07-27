import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/feature-tests/microphone-icon-button", {
  title: "Feature Tests Microphone Icon Button",
  description: "Interactive demo: Feature Tests Microphone Icon Button. AI Matrx demo route.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
