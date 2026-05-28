// app/(ssr)/ssr/header-demo/layout.tsx
// Imports the header-variants CSS once for the entire demo route.

import "@/features/shell/components/header/variants/header-variants.css";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo", {
  titlePrefix: "Header",
  title: "Demo",
  description: "SSR shell header variants demo",
  letter: "HD",
});

export default function HeaderDemoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
