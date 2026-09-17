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

  // Record-only lane: the standalone read-only view. The topics come from
  // `seo.map_outline`, which is access-checked on the map itself — the same
  // grant that opened this page opens it.
  const outline = await supabase
    .schema("seo")
    .rpc("map_outline", { p_map_id: mapId, p_overrides: {} });

  return (
    <main className="h-full overflow-y-auto bg-textured p-4 sm:p-6">
      <div className="mx-auto grid max-w-4xl gap-4">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Topical map
              </p>
              <h1 className="truncate text-xl font-semibold">{map.name}</h1>
              {map.description ? (
                <p className="mt-1 text-sm text-muted-foreground">
                  {map.description}
                </p>
              ) : null}
            </div>
            <ShareButton
              resourceType="seo_topical_map"
              resourceId={map.id}
              resourceName={map.name}
            />
          </header>
          <p className="mt-4 text-sm text-muted-foreground">
            Status: {map.status}. You can read this map but not the brand it
            belongs to, so this is the standalone view — editing lives in the
            brand&apos;s workspace.
          </p>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Topics</h2>
          {outline.error ? (
            // The function's own sentence, unaltered: these refusals are written
            // for the person reading them.
            <p role="alert" className="mt-2 whitespace-pre-wrap text-sm text-destructive">
              {outline.error.message}
            </p>
          ) : outline.data && String(outline.data).trim() ? (
            <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/40 p-3 font-mono text-xs">
              {String(outline.data)}
            </pre>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              This map has no topics yet, so there is nothing to show.
            </p>
          )}
        </section>

        <p className="text-sm">
          <Link href="/marketing" className="underline">
            Back to Marketing
          </Link>
        </p>
      </div>
    </main>
  );
}
