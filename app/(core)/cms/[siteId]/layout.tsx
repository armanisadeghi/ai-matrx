import SiteLayoutClient from "./SiteLayoutClient";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const { siteId } = await params;
  const shortLabel = siteId.length > 16 ? `${siteId.slice(0, 10)}…` : siteId;

  return createDynamicRouteMetadata("/cms", {
    title: shortLabel,
    description: "Manage pages, components, and settings for this CMS site.",
    letter: "Si",
  });
}

export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SiteLayoutClient>{children}</SiteLayoutClient>;
}
