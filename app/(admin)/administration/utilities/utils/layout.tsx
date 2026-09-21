import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Utils",
  title: "Admin",
  description: "Administrative utility tools and helpers",
  letter: "UU",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
