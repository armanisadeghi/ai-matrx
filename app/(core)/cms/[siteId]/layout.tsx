import SiteLayoutClient from "./SiteLayoutClient";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  await params;

  return createDynamicRouteMetadata("/cms", {
    // The authenticated client resolves the owned site's real name and the
    // current page name. Never expose a UUID in the browser tab while loading.
    title: "Website",
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
