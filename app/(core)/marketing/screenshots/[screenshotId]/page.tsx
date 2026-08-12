import Link from "next/link";
import { notFound } from "next/navigation";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { webDb } from "@/utils/supabase/webDb";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MarketingScreenshotPage({
  params,
}: {
  params: Promise<{ screenshotId: string }>;
}) {
  const { screenshotId } = await params;
  if (!UUID_RE.test(screenshotId)) notFound();

  const supabase = await createClient();
  const response = await webDb(supabase)
    .from("screenshot")
    .select("id, kind, file_id, captured_at, width, height")
    .eq("id", screenshotId)
    .is("deleted_at", null)
    .maybeSingle();

  if (response.error || !response.data) {
    return (
      <AccessGate
        token="web_screenshot"
        id={screenshotId}
        error={response.error}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
      />
    );
  }

  const screenshot = response.data;
  const name = `${screenshot.kind.replaceAll("_", " ")} screenshot`;
  return (
    <main className="h-full overflow-y-auto bg-textured p-4 sm:p-6">
      <section className="mx-auto grid max-w-3xl gap-5 rounded-xl border border-border bg-card p-5 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Web screenshot</p>
            <h1 className="text-2xl font-semibold capitalize">{name}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{screenshot.id}</p>
          </div>
          <ShareButton resourceType="web_screenshot" resourceId={screenshot.id} resourceName={name} />
        </header>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Captured</dt><dd>{new Date(screenshot.captured_at).toLocaleString()}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Dimensions</dt><dd>{screenshot.width && screenshot.height ? `${screenshot.width} × ${screenshot.height}` : "Not recorded"}</dd></div>
        </dl>
        <Button asChild className="w-fit"><Link href={`/files/f/${screenshot.file_id}`}>Open screenshot image</Link></Button>
        <p className="text-sm text-muted-foreground">
          Notes and supplemental files attached to this screenshot inherit this screenshot's viewer access.
        </p>
      </section>
    </main>
  );
}
