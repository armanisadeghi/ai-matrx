import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Windows",
  title: "Tests",
  description: "Window panel and overlay tests",
  letter: "Wi",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
