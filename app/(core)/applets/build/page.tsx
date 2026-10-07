import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AppletBuilder } from "@/features/applets-host/builder/AppletBuilder";

/**
 * /applets/build — describe what you want, get an Applet on your own tables (AP-0 lane D, G5).
 * Pressing Build creates the draft Applet and the address becomes /applets/build/<id>; changing an
 * existing app opens that same address (`?applet=<id>` is forwarded there).
 */
export default async function BuildAppletPage({ searchParams }: { searchParams: Promise<{ applet?: string }> }) {
  const { isAuthenticated } = await getSessionVerdict();
  if (!isAuthenticated) redirect("/applets");
  const { applet } = await searchParams;
  if (applet) redirect(`/applets/build/${encodeURIComponent(applet)}`);
  return (
    <>
      <RecordPageHeader backHref="/applets" parents={[{ label: "Applets", href: "/applets" }]} record={{ name: "Build an Applet" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <AppletBuilder appletId={null} routed />
      </div>
    </>
  );
}
