import { getApplet } from "@/lib/applets/data";
import { AppletHeader } from "@/features/applets/components/route-header/AppletHeader";
import { AppletSettingsContent } from "@/features/applets/route/AppletSettingsContent";

interface SettingsPageProps {
  params: Promise<{ id: string }>;
}

export default async function AppletSettingsPage({
  params,
}: SettingsPageProps) {
  const { id } = await params;
  const app = await getApplet(id);

  return (
    <>
      <AppletHeader
        appId={app.id}
        appName={app.name}
        initialStatus={app.status}
        initialPublishedToWeb={app.published_to_web}
        active="settings"
      />
      <AppletSettingsContent appId={app.id} />
    </>
  );
}
