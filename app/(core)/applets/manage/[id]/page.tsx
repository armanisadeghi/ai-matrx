import { getApplet } from "@/lib/applets/data";
import { AppletOverviewContent } from "@/features/applets/route/AppletOverviewContent";
import { AppletHeader } from "@/features/applets/components/route-header/AppletHeader";

interface AppletPageProps {
  params: Promise<{ id: string }>;
}

export default async function AppletOverviewPage({
  params,
}: AppletPageProps) {
  const { id } = await params;
  // Trigger the data fetch (and notFound on miss). The layout's hydrator
  // owns Redux seeding; this server fetch primarily exists so 404s render
  // as the route's not-found.tsx instead of an empty Redux state.
  const app = await getApplet(id);

  return (
    <>
      <AppletHeader
        appId={app.id}
        appName={app.name}
        initialStatus={app.status}
        initialPublishedToWeb={app.published_to_web}
        active="overview"
      />
      <AppletOverviewContent appId={app.id} />
    </>
  );
}
