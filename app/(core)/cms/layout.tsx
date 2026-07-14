import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/cms", {
  title: "Content",
  description: "Manage websites, pages, and CMS content.",
  letter: "Cm",
});

export default function CmsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
