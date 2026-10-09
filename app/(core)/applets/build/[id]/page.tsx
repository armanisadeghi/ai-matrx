import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionVerdict } from "@/utils/supabase/sessionVerdict";
import { createClient } from "@/utils/supabase/server";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AppletBuilder } from "@/features/applets-host/builder/AppletBuilder";
import { RECORD_COLUMNS, toRecord, type RecordRow } from "@/features/applets-host/builder/build-session";

/**
 * /applets/build/<id> — ONE build, at its own address. The id is the draft Applet the build writes
 * (born the moment Build is pressed); a refresh or a later visit reopens it with its preview, its
 * request history and the live run (`features/applets-host/builder/build-session.ts`).
 */
// Tab titles, one rule for every Applet page: most specific first — "<what> | <whose> — AI Matrx".
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.schema("app").from("definition").select("name").eq("id", id).maybeSingle();
  return { title: `Build | ${data?.name?.trim() || "Applet"}` };
}

export default async function AppletBuildPage({ params }: { params: Promise<{ id: string }> }) {
  const { isAuthenticated } = await getSessionVerdict();
  const { id } = await params;
  if (!isAuthenticated) redirect("/applets");
  // The header names the Applet when it can; the builder itself says plainly when it cannot be read.
  // The build's record (its requests, a run still open) is read HERE, so the first paint already shows
  // what she asked and that it is building — never the empty start screen while the page boots (audit9 B1).
  const supabase = await createClient();
  const { data } = await supabase.schema("app").from("definition").select(RECORD_COLUMNS).eq("id", id).maybeSingle();
  const initialRecord = data ? toRecord(data as RecordRow) : null;
  return (
    <>
      <RecordPageHeader backHref="/applets" parents={[{ label: "Applets", href: "/applets" }]} record={{ name: data?.name ?? "Build an Applet" }} />
      <div className="flex h-full flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
        <AppletBuilder appletId={id} routed initialRecord={initialRecord} />
      </div>
    </>
  );
}
