import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Speaker",
  title: "Demo",
  description: "SSR TTS and speaker controls demo",
  letter: "Sp",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
