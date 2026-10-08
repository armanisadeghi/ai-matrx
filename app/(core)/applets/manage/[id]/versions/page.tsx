import { getApplet, getAppletVersions } from "@/lib/applets/data";
import { AppletHeader } from "@/features/applets/components/route-header/AppletHeader";
import { AppletVersionsContent } from "@/features/applets/route/AppletVersionsContent";

interface VersionsPageProps {
  params: Promise<{ id: string }>;
}

export default async function AppletVersionsPage({
  params,
}: VersionsPageProps) {
  const { id } = await params;
  const app = await getApplet(id);
  const versions = await getAppletVersions(app.id);

  return (
    <>
      <AppletHeader
        appId={app.id}
        appName={app.name}
        initialStatus={app.status}
        initialPublishedToWeb={app.published_to_web}
        active="versions"
      />
      <AppletVersionsContent
        appId={app.id}
        versions={versions}
        currentVersion={app.content_version}
        applet={{ status: app.status, published_to_web: app.published_to_web, deleted_at: app.deleted_at }}
      />
    </>
  );
}
