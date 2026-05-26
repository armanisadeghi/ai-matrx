import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "SMS",
  title: "Tests",
  description: "SMS messaging integration tests",
  letter: "Sm",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
