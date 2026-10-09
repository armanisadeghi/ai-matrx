import { getApplet } from "@/lib/applets/data";
import { AppletHeader } from "@/features/applets/components/route-header/AppletHeader";
import { AppletHostMount } from "@/features/applets-host/AppletHostMount";

interface RunPageProps {
  params: Promise<{ id: string }>;
}

/**
 * /applets/manage/[id]/run — runs the user's actual Applet inside the management
 * shell, through the same Applet host as `/applets/<slug>`,
 * framed by the sub-route header so the user can flip back to Code or Settings.
 */
export default async function AppletRunPage({ params }: RunPageProps) {
  const { id } = await params;
  const app = await getApplet(id);

  return (
    <>
      <AppletHeader
        appId={app.id}
        appName={app.name}
        initialStatus={app.status}
        initialPublishedToWeb={app.published_to_web}
        active="run"
      />
      {/* Below the header, never under it: the Applet's own page tabs sat behind the header bar (audit M9).
          Embedded: its pages change in place, so Run never leaves the manage page for the public address. */}
      <div className="h-full min-h-0 overflow-auto pt-[var(--shell-header-h)]">
        <AppletHostMount appletId={app.id} slug={app.slug} embedded />
      </div>
    </>
  );
}
