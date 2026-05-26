import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Matrx Table",
  title: "Tests",
  description: "Matrx table component tests",
  letter: "Ma",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
