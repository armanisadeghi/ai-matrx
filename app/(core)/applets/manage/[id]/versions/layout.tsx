import { getApplet } from "@/lib/applets/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getApplet(id);
  return createDynamicRouteMetadata("/applets", {
    titlePrefix: "Versions",
    title: app.name,
    description: `Version history for ${app.name}.`,
    letter: "VS",
  });
}

export default function AppletVersionsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
