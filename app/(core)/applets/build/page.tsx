import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { loginHref } from "@/utils/auth/auth-destination";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AppletBuilder } from "@/features/applets-host/builder/AppletBuilder";

/**
 * /applets/build — describe what you want, get an Applet on your own tables (AP-0 lane D, G5).
 * Pressing Build creates the draft Applet and the address becomes /applets/build/<id>; changing an
 * existing app opens that same address (`?applet=<id>` is forwarded there).
 */
export const metadata: Metadata = { title: "Build | Applets" };

export default async function BuildAppletPage({ searchParams }: { searchParams: Promise<{ applet?: string }> }) {
  const { isAuthenticated } = await getSessionVerdict();
  const { applet } = await searchParams;
  // A signed-out person who followed a build link signs in and lands back here (audit9 G6), never on the landing.
  if (!isAuthenticated) redirect(loginHref(applet ? `/applets/build/${encodeURIComponent(applet)}` : "/applets/build"));
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
