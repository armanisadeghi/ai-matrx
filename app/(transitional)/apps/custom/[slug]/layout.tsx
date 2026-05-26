import type { Metadata } from "next";
import { getAppData } from "@/utils/server/appDataCache";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";
import CustomAppSlugLayoutClient from "./CustomAppSlugLayoutClient";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const data = await getAppData(slug);
    if (!data?.app_config) {
      return createDynamicRouteMetadata("/apps", {
        title: "App not found",
        description: "The requested application could not be found.",
        letter: "Cx", // Custom app by slug
      });
    }
    const app = data.app_config;
    const baseDescription = app.description || "Interactive Matrx application";
    const description = app.creator
      ? `${baseDescription} | Created by ${app.creator}`.slice(0, 120)
      : baseDescription.slice(0, 120);

    return createDynamicRouteMetadata("/apps", {
      title: app.name?.trim() || "Custom App",
      description,
      letter: "Cx", // Custom app by slug
    });
  } catch {
    return createDynamicRouteMetadata("/apps", {
      title: "Custom App",
      description: "Interactive application platform",
      letter: "Cx",
    });
  }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <CustomAppSlugLayoutClient>{children}</CustomAppSlugLayoutClient>;
}
