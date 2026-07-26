import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/administration", {
  titlePrefix: "Content Templates",
  title: "Admin",
  description: "Manage CMS content templates and page structures",
  letter: "CT",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
