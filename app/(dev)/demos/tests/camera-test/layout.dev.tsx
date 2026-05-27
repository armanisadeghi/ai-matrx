import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Camera",
  title: "Tests",
  description: "Camera and media capture tests",
  letter: "Ca",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
