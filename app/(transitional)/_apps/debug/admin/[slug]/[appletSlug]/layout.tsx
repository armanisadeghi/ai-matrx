import type { Metadata } from "next";
import { fetchAppAndAppletConfig } from "@/utils/supabase/fetchAppAndAppletConfig";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; appletSlug: string }>;
}): Promise<Metadata> {
  const { slug, appletSlug } = await params;
  const config = await fetchAppAndAppletConfig(null, slug);

  if (!config?.app_config) {
    return createDynamicRouteMetadata("/apps", {
      title: "App not found",
      description: "Debug applet viewer",
      letter: "Dz", // Debug applet admin
    });
  }

  const appConfig = config.app_config;
  const currentApplet = config.applets?.find((a) => a.slug === appletSlug);

  if (!currentApplet) {
    return createDynamicRouteMetadata("/apps", {
      titlePrefix: "Missing applet",
      title: appConfig.name || "App",
      description: "The requested applet could not be found.",
      letter: "Dz",
    });
  }

  const description = (
    currentApplet.description || "Custom applet debug view"
  ).slice(0, 120);

  return createDynamicRouteMetadata("/apps", {
    titlePrefix: currentApplet.name?.trim() || "Applet",
    title: appConfig.name?.trim() || "App",
    description,
    letter: "Dz", // Debug applet admin
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full overflow-auto">{children}</div>;
}
