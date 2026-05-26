import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Voice Assistant 2",
  title: "Demo",
  description: "Alternate voice assistant layout and interaction experiment",
  letter: "V2",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
