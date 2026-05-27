import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Server Token",
  title: "Demo",
  description: "Server-issued token flow for secured voice and realtime demos",
  letter: "Vs",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
