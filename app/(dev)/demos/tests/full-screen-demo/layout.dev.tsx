import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Full Screen",
  title: "Tests",
  description: "Full-screen layout and viewport tests",
  letter: "FS",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
