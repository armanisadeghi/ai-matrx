import type { Metadata } from "next";
import { fetchAppBySlug } from "@/utils/supabase/fetchAppAndAppletConfig";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

type LayoutProps = {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  try {
    const appConfig = await fetchAppBySlug(slug);
    const name = appConfig?.name?.trim() || "App";
    const description = (
      appConfig?.description || "Debug view of custom app configuration"
    ).slice(0, 120);
    return createDynamicRouteMetadata("/apps", {
      titlePrefix: "Debug",
      title: name,
      description,
      letter: "Ds", // Debug app admin
    });
  } catch {
    return createDynamicRouteMetadata("/apps", {
      titlePrefix: "Debug",
      title: "App",
      description: "Custom application debug viewer",
      letter: "Ds",
    });
  }
}

export default async function Layout({ children }: LayoutProps) {
  return (
    <div className="h-full w-full bg-textured transition-colors">
      <div className="h-full w-full">{children}</div>
    </div>
  );
}
