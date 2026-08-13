import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { createClient } from "@/utils/supabase/server";
import { webDb } from "@/utils/supabase/webDb";

/**
 * Canonical entry for a page by its id alone: /marketing/pages/[pageId].
 *
 * Two lanes, decided by what the caller can actually read (SHARING_MODEL law
 * 2: a page grant says nothing about the site or brand above it):
 *
 * 1. The caller can read the page AND its site AND its brand → redirect into
 *    the full nested workspace route (which needs brandId + siteId in the
 *    path). This is the owner/org/site-grantee lane and the historical
 *    behavior of this short link.
 * 2. The caller can read the page but NOT both parents (a page-only grant) →
 *    render a standalone page view right here, with zero parent data. The
 *    nested workspace gates its whole tree on the site and brand reads, so
 *    sending a page-only grantee there hands them an AccessGate for a SITE
 *    they were never given — defeating page-level sharing. Pattern copied
 *    from /marketing/snapshots/[snapshotId].
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MarketingPageShortLink({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  // A malformed id would reach Postgres as a uuid parse error (500) — reject
  // it as a plain 404 instead.
  if (!UUID_RE.test(pageId)) notFound();
  const supabase = await createClient();
  // web.* has no anonymous grants — an anon query errors (42501) rather than
  // returning empty. Send signed-out visitors to login and back here.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/marketing/pages/${pageId}`);
  const db = webDb(supabase);
  const pageResponse = await db
    .from("page")
    .select(
      "id, site_id, url, path, status, target_keyword, http_status_last, first_seen, last_seen, latest_snapshot_id",
    )
    .eq("id", pageId)
    .is("deleted_at", null)
    .maybeSingle();
  if (pageResponse.error || !pageResponse.data) {
    // Denied, deleted, missing, or a stale session — the gate resolves which
    // and offers the way forward. Never guess.
    return (
      <AccessGate
        token="web_page"
        id={pageId}
        error={pageResponse.error}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
      />
    );
  }
  const page = pageResponse.data;

  // Probe the parents. These reads are RLS-filtered under the caller's JWT —
  // a page-only grantee gets zero rows (or a denial error), and nothing from
  // them is ever rendered in that lane, so access is not widened.
  const siteResponse = await db
    .from("site")
    .select("id, brand_id")
    .eq("id", page.site_id)
    .maybeSingle();
  const brandId = siteResponse.error ? null : siteResponse.data?.brand_id;
  if (brandId) {
    const brandResponse = await db
      .from("brand")
      .select("id")
      .eq("id", brandId)
      .maybeSingle();
    if (!brandResponse.error && brandResponse.data) {
      // Full parent access — the nested workspace will not gate them out.
      redirect(
        `/marketing/brands/${brandId}/sites/${page.site_id}/pages/${pageId}`,
      );
    }
  }

  // Page-only lane: the standalone view. Snapshots are structural children of
  // the page, so the same grant that opened the page opens them.
  const snapshots = await db
    .from("snapshot")
    .select("id, captured_at, http_status, word_count, final_url")
    .eq("page_id", pageId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false })
    .limit(25);
  if (snapshots.error) throw snapshots.error;

  return (
    <main className="h-full overflow-y-auto bg-textured p-4 sm:p-6">
      <div className="mx-auto grid max-w-4xl gap-4">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Web page
              </p>
              <h1 className="truncate text-xl font-semibold">{page.url}</h1>
              {page.path ? (
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                  {page.path}
                </p>
              ) : null}
            </div>
            <ShareButton
              resourceType="web_page"
              resourceId={page.id}
              resourceName={page.url}
            />
          </header>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Status</dt>
              <dd>{page.status}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Target keyword</dt>
              <dd>{page.target_keyword ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last HTTP</dt>
              <dd>{page.http_status_last ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Last seen</dt>
              <dd>{new Date(page.last_seen).toLocaleString()}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Snapshots</h2>
          {snapshots.data?.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {snapshots.data.map((snapshot) => (
                <Link
                  key={snapshot.id}
                  href={`/marketing/snapshots/${snapshot.id}`}
                  className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <p className="truncate font-medium">
                    {snapshot.final_url ?? page.url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(snapshot.captured_at).toLocaleString()}
                    {snapshot.http_status != null
                      ? ` · HTTP ${snapshot.http_status}`
                      : ""}
                    {snapshot.word_count != null
                      ? ` · ${snapshot.word_count.toLocaleString()} words`
                      : ""}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              No snapshots have been captured for this page yet.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
