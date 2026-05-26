import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Voice",
  title: "Demo",
  description: "Voice, speech, and audio UI component demos",
  letter: "Vo",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
