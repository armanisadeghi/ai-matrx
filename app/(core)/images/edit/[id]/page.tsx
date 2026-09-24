import { createClient } from "@/utils/supabase/server";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import EditByIdClient from "./EditByIdClient";

/**
 * /images/edit/[id]
 *
 * Canonical entry for editing a known cloud file. The id IS the source of
 * truth — refresh-safe, share-safe, version-history-safe. Any path that
 * lands here without an id renders the landing page at /images/edit.
 *
 * THE FILE ROW IS THE GATE. The media resolver hands back a URL even for a
 * file that does not exist or that the viewer cannot read, so trusting it
 * opened an empty editor. The row is read here, as the viewer, BY ID (RLS
 * decides; no organization is involved in reading one record); an empty or
 * failed read renders <AccessGate>, which says whether the file is denied,
 * deleted, missing, or the session is signed out.
 *
 * Header + outer chrome are owned by `app/(core)/images/layout.tsx` and the
 * shared shell route menu.
 */

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ folder?: string }>;
}

export default async function EditByIdPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { folder } = await searchParams;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("files")
    .from("files")
    .select("id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      console.error(`[images/edit/${id}] file read failed at SSR:`, error);
    }
    return (
      <div className="h-full w-full overflow-hidden bg-background">
        <AccessGate
          token="file"
          id={id}
          error={error ?? undefined}
          fallbackHref="/images"
          fallbackLabel="Your images"
        />
      </div>
    );
  }

  return <EditByIdClient cloudFileId={id} folder={folder} />;
}
