import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Animations",
  title: "Tests",
  description: "Animation and transition tests",
  letter: "An",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
