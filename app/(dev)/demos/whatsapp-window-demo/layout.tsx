import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Demos",
  title: "WhatsApp Window",
  description:
    "WhatsApp UI clone rendered as a draggable, resizable WindowPanel.",
  letter: "Ww",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
