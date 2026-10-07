import { getApplet } from "@/lib/applets/data";
import { createDynamicRouteMetadata } from "@/utils/route-metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { id, version } = await params;
  const app = await getApplet(id);
  return createDynamicRouteMetadata("/applets", {
    titlePrefix: `v${version}`,
    title: app.name,
    description: `Version ${version} of ${app.name}.`,
    letter: "VR",
  });
}

export default function AppletVersionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
