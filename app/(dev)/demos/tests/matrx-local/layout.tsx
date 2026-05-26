import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Matrx Local",
  title: "Tests",
  description: "Matrx local storage and offline tests",
  letter: "ML",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
