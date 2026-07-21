import { headers } from "next/headers";
import { getMarketingRouteMetadata } from "@/features/marketing/lib/route-metadata";

export async function generateMetadata() {
  const pathname = (await headers()).get("x-pathname") ?? "/marketing";
  return getMarketingRouteMetadata(pathname);
}

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
