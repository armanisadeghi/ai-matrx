import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Bridge",
  title: "Extension Bridge",
  description:
    "End-to-end visual test harness for the matrx-extend Chrome extension bridge",
  letter: "EB",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
