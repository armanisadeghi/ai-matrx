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
    titlePrefix: "Run",
    title: app.name,
    description: `Run ${app.name}.`,
    letter: "AR",
  });
}

export default function AppletRunLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
