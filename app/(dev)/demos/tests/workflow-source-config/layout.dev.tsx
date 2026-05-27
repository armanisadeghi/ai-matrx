import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/tests", {
  titlePrefix: "Workflow Config",
  title: "Tests",
  description: "Workflow source configuration tests",
  letter: "WC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
