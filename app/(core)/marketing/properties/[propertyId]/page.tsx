import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { AccessGate } from "@/features/access-gate/components/AccessGate";
import { PropertyKindMark, propertyPublicUrl } from "@/features/marketing/components/shared/PropertyKindMark";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/server";
import { webDb } from "@/utils/supabase/webDb";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function MarketingPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>;
}) {
  const { propertyId } = await params;
  if (!UUID_RE.test(propertyId)) notFound();

  const supabase = await createClient();
  const response = await webDb(supabase)
    .from("property")
    .select("id, kind, display_name, handle, url, status, updated_at")
    .eq("id", propertyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (response.error || !response.data) {
    return (
      <AccessGate
        token="web_property"
        id={propertyId}
        error={response.error}
        fallbackHref="/marketing"
        fallbackLabel="Marketing"
      />
    );
  }

  const property = response.data;
  const name =
    property.display_name || property.handle || `${property.kind} property`;
  const publicUrl = propertyPublicUrl(property);

  return (
    <main className="h-full overflow-y-auto bg-textured p-4 sm:p-6">
      <section className="mx-auto grid max-w-3xl gap-4 rounded-xl border border-border bg-card p-5 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <PropertyKindMark kind={property.kind} size={48} />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Marketing property · {property.kind.replaceAll("_", " ")}
              </p>
              <h1 className="truncate text-2xl font-semibold">{name}</h1>
              {property.handle ? (
                <p className="text-sm text-muted-foreground">{property.handle}</p>
              ) : null}
            </div>
          </div>
          <ShareButton
            resourceType="web_property"
            resourceId={property.id}
            resourceName={name}
          />
        </header>

        <dl className="grid gap-3 rounded-lg border border-border/70 bg-muted/20 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="font-medium">{property.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Updated</dt>
            <dd className="font-medium">
              {new Date(property.updated_at).toLocaleString()}
            </dd>
          </div>
        </dl>

        {publicUrl ? (
          <Button asChild className="w-fit">
            <Link href={publicUrl} target="_blank" rel="noreferrer">
              Open public profile <ExternalLink className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            No public profile URL is stored for this property.
          </p>
        )}
      </section>
    </main>
  );
}
