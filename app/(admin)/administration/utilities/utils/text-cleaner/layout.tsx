import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Text Cleaner",
  title: "Admin",
  description: "Text cleaning and transformation utility tools",
  letter: "TC",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
