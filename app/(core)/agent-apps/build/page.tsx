import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AppletBuilder } from "@/features/applets-host/builder/AppletBuilder";

/** /agent-apps/build — describe what you want, get an Applet on your own tables (AP-0 lane D, G5). */
export default async function BuildAppletPage({ searchParams }: { searchParams: Promise<{ applet?: string }> }) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/agent-apps");
  const { applet } = await searchParams;
  return (
    <>
      <RecordPageHeader backHref="/agent-apps" parents={[{ label: "Agent Apps", href: "/agent-apps" }]} record={{ name: applet ? "Change app" : "Build an app" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <AppletBuilder appletId={applet ?? null} />
      </div>
    </>
  );
}
