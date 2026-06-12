import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { SurfaceAdminDetailPage } from "@/features/surfaces/admin-detail/SurfaceAdminDetailPage";
import { Loader2 } from "lucide-react";

interface Props {
  /** Surface names contain slashes (`matrx-user/transcripts-cleanup`), so
   * the route is a catch-all and segments are re-joined with "/". */
  params: Promise<{ name: string[] }>;
}

export default async function SurfaceAdminDetailRoute({ params }: Props) {
  const { name } = await params;
  const surfaceName = name.map((s) => decodeURIComponent(s)).join("/");

  const supabase = await createClient();
  const { data: surface, error } = await supabase
    .from("ui_surface")
    .select("*")
    .eq("name", surfaceName)
    .maybeSingle();
  if (error || !surface) notFound();

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-[calc(100dvh-var(--header-height))] gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading surface…
        </div>
      }
    >
      <SurfaceAdminDetailPage initialSurface={surface} />
    </Suspense>
  );
}
