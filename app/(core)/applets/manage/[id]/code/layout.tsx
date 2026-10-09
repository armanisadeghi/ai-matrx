import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getApplet } from "@/lib/applets/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const app = await getApplet(id).catch(() => null);
  const name = app?.name?.trim() || "Applet";
  return createDynamicRouteMetadata("/applets", {
    titlePrefix: "Change with AI",
    title: name,
    description: `Edit code for ${name}`,
    letter: "CO",
  });
}

export default function CodeLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
