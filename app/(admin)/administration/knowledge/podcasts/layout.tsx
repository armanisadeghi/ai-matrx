import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Podcasts",
  title: "Admin",
  description: "Podcast content management and publishing tools",
  letter: "APO",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
