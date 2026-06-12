import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/cms", {
  title: "Content",
  description: "Manage websites, pages, and CMS content.",
  letter: "Cn",
});

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
