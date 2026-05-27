import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "OAuth",
  title: "Tests",
  description: "OAuth flow and authentication tests",
  letter: "Oa",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
