// app/(ssr)/ssr/header-demo/page.tsx
// Server shell — hands off to the client demo component.

import HeaderDemoClient from "../_components/HeaderDemoClient";

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demos/ssr/header-demo", {
  title: "Header Demo",
  description: "Interactive demo: Header Demo. AI Matrx demo route.",
});

export default function HeaderDemoPage() {
  return <HeaderDemoClient />;
}
