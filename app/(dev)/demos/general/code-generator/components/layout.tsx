import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Code Components",
  title: "Demo",
  description: "Code generator component library demo",
  letter: "CC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
