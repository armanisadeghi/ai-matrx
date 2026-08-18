// Minimal layout.tsx component for next.js

import { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/contact", {
  title: "Contact",
  description: "Contact AI Matrx for product, account, and business questions.",
  canonicalPath: "/contact",
});

export default function Layout({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}
