import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Wake Word Debug",
  title: "Demo",
  description: "Wake word detection debug and testing demo",
  letter: "WW",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
