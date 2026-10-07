import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createClient } from "@/utils/supabase/server";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AppletBuilder } from "@/features/applets-host/builder/AppletBuilder";

/**
 * /applets/build/<id> — ONE build, at its own address. The id is the draft Applet the build writes
 * (born the moment Build is pressed); a refresh or a later visit reopens it with its preview, its
 * request history and the live run (`features/applets-host/builder/build-session.ts`).
 */
export default async function AppletBuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await getSessionVerdict();
  const { id } = await params;
  if (!isAuthenticated) redirect("/applets");
  // The header names the app when it can; the builder itself says plainly when the app cannot be read.
  const supabase = await createClient();
  const { data } = await supabase.schema("app").from("definition").select("name").eq("id", id).maybeSingle();
  return (
    <>
      <RecordPageHeader backHref="/applets" parents={[{ label: "Applets", href: "/applets" }]} record={{ name: data?.name ?? "Build an app" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <AppletBuilder appletId={id} routed />
      </div>
    </>
  );
}
