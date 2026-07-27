import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Demos",
  title: "WhatsApp Clone",
  description: "Pixel-faithful WhatsApp UI clone wired to AI Matrx messaging.",
  letter: "Wa",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
