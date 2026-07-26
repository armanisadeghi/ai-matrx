import type { Metadata } from "next";
import { getAppData } from "@/utils/server/appDataCache";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; appletSlug: string }>;
}): Promise<Metadata> {
  const { slug, appletSlug } = await params;
  try {
    const data = await getAppData(slug);
    if (!data?.app_config) {
      return createDynamicRouteMetadata("/apps", {
        title: "Applet not found",
        description: "The requested application could not be found.",
        letter: "Ay", // Custom applet (runtime)
      });
    }
    const app = data.app_config;
    const applet = data.applets.find((a) => a.slug === appletSlug);
    if (!applet) {
      return createDynamicRouteMetadata("/apps", {
        titlePrefix: "Missing applet",
        title: app.name || "App",
        description: "The requested applet could not be found.",
        letter: "Ay",
      });
    }
    const baseDescription =
      applet.description || app.description || "Interactive applet";
    const creator = applet.creator || app.creator;
    const description = (
      creator ? `${baseDescription} | Created by ${creator}` : baseDescription
    ).slice(0, 120);

    return createDynamicRouteMetadata("/apps", {
      titlePrefix: applet.name?.trim() || "Applet",
      title: app.name?.trim() || "App",
      description,
      letter: "Ay", // Custom applet view
    });
  } catch {
    return createDynamicRouteMetadata("/apps", {
      title: "Applet",
      description: "Interactive applet",
      letter: "Ay",
    });
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <div className="h-full w-full overflow-auto">{children}</div>;
}
