import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/seo", {
  title: "SEO",
  description: "Free SEO tools for checking and improving public web pages.",
  canonicalPath: "/seo",
});

export default function SeoLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full flex-col overflow-y-auto overflow-x-hidden">
      {children}
    </div>
  );
}
