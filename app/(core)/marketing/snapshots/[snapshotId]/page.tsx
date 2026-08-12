import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { webDb } from "@/utils/supabase/webDb";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MarketingSnapshotPage({
  params,
}: {
  params: Promise<{ snapshotId: string }>;
}) {
  const { snapshotId } = await params;
  if (!UUID_RE.test(snapshotId)) notFound();

  const supabase = await createClient();
  const db = webDb(supabase);
  const response = await db
    .from("snapshot")
    .select(
      "id, captured_at, final_url, http_status, word_count, content_hash, body_file_id, markdown_file_id",
    )
    .eq("id", snapshotId)
    .is("deleted_at", null)
    .maybeSingle();

  if (response.error || !response.data) {
    return (
      <AccessGate
        token="web_snapshot"
        id={snapshotId}
        error={response.error}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
      />
    );
  }

  const snapshot = response.data;
  const screenshots = await db
    .from("screenshot")
    .select("id, kind, file_id, captured_at, width, height")
    .eq("snapshot_id", snapshotId)
    .is("deleted_at", null)
    .order("captured_at", { ascending: false });
  if (screenshots.error) throw screenshots.error;

  return (
    <main className="h-full overflow-y-auto bg-textured p-4 sm:p-6">
      <div className="mx-auto grid max-w-4xl gap-4">
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <header className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Immutable web snapshot
              </p>
              <h1 className="truncate text-xl font-semibold">
                {snapshot.final_url || snapshot.id}
              </h1>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {snapshot.id}
              </p>
            </div>
            <ShareButton
              resourceType="web_snapshot"
              resourceId={snapshot.id}
              resourceName={snapshot.final_url || `Snapshot ${snapshot.id.slice(0, 8)}`}
            />
          </header>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-muted-foreground">Captured</dt><dd>{new Date(snapshot.captured_at).toLocaleString()}</dd></div>
            <div><dt className="text-xs text-muted-foreground">HTTP</dt><dd>{snapshot.http_status ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Words</dt><dd>{snapshot.word_count?.toLocaleString() ?? "—"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Hash</dt><dd className="font-mono text-xs">{snapshot.content_hash?.slice(0, 16) ?? "—"}</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild variant="outline"><Link href={`/files/f/${snapshot.body_file_id}`}>Open stored body</Link></Button>
            {snapshot.markdown_file_id ? (
              <Button asChild variant="outline"><Link href={`/files/f/${snapshot.markdown_file_id}`}>Open Markdown</Link></Button>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Contained screenshots</h2>
          {screenshots.data?.length ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {screenshots.data.map((screenshot) => (
                <Link
                  key={screenshot.id}
                  href={`/marketing/screenshots/${screenshot.id}`}
                  className="rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                >
                  <p className="font-medium">{screenshot.kind.replaceAll("_", " ")}</p>
                  <p className="text-xs text-muted-foreground">
                    {screenshot.width && screenshot.height
                      ? `${screenshot.width} × ${screenshot.height} · `
                      : ""}
                    {new Date(screenshot.captured_at).toLocaleString()}
                  </p>
                </Link>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">No screenshots belong to this snapshot.</p>
          )}
        </section>
      </div>
    </main>
  );
}
