// The topical map's ID DOOR: /marketing/topical-maps/[mapId].
//
// This is the value of `platform.shareable_resource_registry.url_path_template`
// for `seo_topical_map`, and the one `entityRegistry.hrefFor` and the permission
// registry point at. Every major marketing record already has one
// (`plan_node`, `web_page`, `web_site`).
//
// Two lanes, decided by what the caller can actually read — the shape
// `/marketing/pages/[pageId]` documents (SHARING_MODEL law 2: a grant on the
// map says nothing about the brand above it):
//
// 1. The caller can read the map AND its brand → redirect into the nested
//    workspace, which needs the brand segment in the path.
// 2. The caller can read the map but NOT the brand (a record-only grant, which
//    is exactly what sharing a map with a client produces) → render the map
//    standalone here. Sending them into the nested route would hand them an
//    AccessGate for a BRAND they were never given, defeating the share.

import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { marketingSeg } from "@/features/marketing/lib/keys";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { TopicalMapDoorBody } from "@/features/marketing/seo/topical-map/door/TopicalMapDoorBody";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { createClient } from "@/utils/supabase/server";
import { webDb } from "@/utils/supabase/webDb";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TopicalMapDoor({
  params,
  searchParams,
}: {
  params: Promise<{ mapId: string }>;
  /** `?topic=<slug>` arrives from the topic door and rides into the workspace. */
  searchParams: Promise<{ topic?: string }>;
}) {
  const { mapId } = await params;
  const { topic } = await searchParams;
  // A malformed id would reach Postgres as a uuid parse error (500) — reject it
  // as a plain 404 instead.
  if (!UUID_RE.test(mapId)) notFound();

  const supabase = await createClient();
  // seo.* has no anonymous grants — an anon query errors (42501) rather than
  // returning empty. Send signed-out visitors to login and back here, carrying
  // their destination (THE auth doctrine: a bounced user never loses it).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?redirectTo=/marketing/topical-maps/${mapId}`);

  const mapResponse = await supabase
    .schema("seo")
    .from("topical_map")
    .select("id, name, description, status, brand_id")
    .eq("id", mapId)
    .is("deleted_at", null)
    .maybeSingle();

  if (mapResponse.error || !mapResponse.data) {
    // Denied, deleted, missing, or a stale session — the gate resolves which
    // and offers the way forward. Never guess.
    return (
      <AccessGate
        token="seo_topical_map"
        id={mapId}
        error={mapResponse.error}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
      />
    );
  }
  const map = mapResponse.data;

  // Probe the parent. RLS-filtered under the caller's JWT — a map-only grantee
  // gets zero rows (or a denial), and nothing from it is rendered in that lane,
  // so access is not widened.
  const brandResponse = await webDb(supabase)
    .from("brand")
    .select("id, slug")
    .eq("id", map.brand_id)
    .maybeSingle();

  if (!brandResponse.error && brandResponse.data) {
    const workspace = marketingRoutes.brandTopicalMap(
      marketingSeg(brandResponse.data),
      map.id,
    );
    redirect(
      topic ? `${workspace}?topic=${encodeURIComponent(topic)}` : workspace,
    );
  }

  // Record-only lane: the standalone read-only view (R7). The REAL workspace
  // views render here, brand-free (`MapLinkProvider brand={null}` inside the
  // adapter) and read-only (every write control absent). The topics come from
  // the same `seo.*` reads the brand workspace uses — each access-checked on
  // the map itself, so the grant that opened this page opens them.
  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-textured pt-[var(--shell-header-h)]">
      <section className="mx-4 mt-4 rounded-xl border border-border bg-card p-4 shadow-sm sm:mx-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Topical map · read-only
            </p>
            <h1 className="truncate text-xl font-semibold">{map.name}</h1>
            {map.description ? (
              <p className="mt-1 text-sm text-muted-foreground">{map.description}</p>
            ) : null}
            <p className="mt-1 text-xs text-muted-foreground">
              Status: {map.status}. You can read this map but not the brand it belongs to, so
              nothing here can be changed — editing lives in the brand&apos;s workspace.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ShareButton
              resourceType="seo_topical_map"
              resourceId={map.id}
              resourceName={map.name}
              variant="outline"
              size="sm"
            />
            <Link href="/marketing" className="text-sm underline">
              Marketing
            </Link>
          </div>
        </div>
      </section>
      <div className="mx-4 mb-4 mt-3 min-h-0 flex-1 rounded-xl border border-border bg-card shadow-sm sm:mx-6 sm:mb-6">
        <TopicalMapDoorBody mapId={map.id} revealSlug={topic ?? null} />
      </div>
    </main>
  );
}
