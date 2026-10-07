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
    titlePrefix: "Settings",
    title: app.name,
    description: `Settings for ${app.name}.`,
    letter: "SE",
  });
}

export default function AppletSettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
