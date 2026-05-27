import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Voice Assistant CDN",
  title: "Demo",
  description: "Voice assistant demo loading assets and scripts from CDN",
  letter: "Vc",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
