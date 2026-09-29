import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { getServerAuth } from "@/utils/supabase/getServerAuth";
import type { SupabaseClient } from "@supabase/supabase-js";
import { oldTypeSlug, type StoreScopeRow } from "@/features/scopes/service/storeScopeAdapter";
import { scopeHref, scopeSeg } from "@/features/scopes/lib/scopeRoutes";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * Short-link resolver for a scope: /scopes/s/[scopeId] → the canonical
 * org-scoped workspace route, in its CANONICAL slug form
 * (/organizations/{org-slug}/scopes/{type-slug}/{scope-slug}, each falling back
 * to its id).
 *
 * THE DOOR LAW: a scope is named all over the app — assigned-scope chips, the
 * scopes hub, association cards, agent context — and every one of those places
 * knows the scope's id but NOT its organization or scope type, which the real
 * route needs in the path. Without this resolver `scope` could not have an
 * `hrefFor` at all, so every one of those names was plain text.
 *
 * Same pattern (and same reason) as /marketing/pages/[pageId].
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ScopeShortLink({
  params,
}: {
  params: Promise<{ scopeId: string }>;
}) {
  const { scopeId } = await params;
  // A malformed id would reach Postgres as a uuid parse error (500) — reject
  // it as a plain 404 instead.
  if (!UUID_RE.test(scopeId)) notFound();

  const supabase = await createClient();
  // The store's scope doors answer nobody signed out. Send signed-out visitors
  // to login and back here.
  const { user, authUnavailable } = await getServerAuth();
  if (!user && authUnavailable) {
    console.warn(
      "[scopes/s/[scopeId]] identity could not be verified — showing the retry notice, NOT redirecting to /login.",
    );
    return (
      <div className="p-4 text-sm text-muted-foreground">
        We could not verify who you are on this request, so this page is not
        loading. You have not been signed out — reload in a moment.
        <ErrorAlchemyMenu />
      </div>
    );
  }
  if (!user) redirect(`/login?next=/scopes/s/${scopeId}`);

  // The scope, read from the record store where it lives (lane SCOPES-READS-WEB): the store's
  // `custom.context_scopes` door finds its organization from the object itself and decides on the
  // one ladder — a scope this person may not open is absent, which is a 404 here, as before.
  const { data: rows, error } = await (supabase as unknown as SupabaseClient)
    .schema("custom")
    .rpc("context_scopes", { p_scope_ids: [scopeId] });
  if (error) throw error;
  const data = (Array.isArray(rows) ? (rows as StoreScopeRow[]) : [])[0];
  if (!data) notFound();

  // Land on the CANONICAL address, not an id one. A short link that redirected
  // to ids handed every visitor the non-canonical URL and left the client-side
  // canonicalizer to rewrite it a moment later — a visible second navigation on
  // every share of a scope. Resolve the org + type slugs here instead.
  //
  // The organization read is decoration, never a gate: a null row (RLS, a race,
  // a row without a slug) falls back to the id segment, which the routes resolve
  // exactly as before. Only the SCOPE read above decides 404.
  const { data: org } = await supabase
    .schema("iam")
    .from("organizations")
    .select("id, slug")
    .eq("id", data.organization_id)
    .maybeSingle();
  const typeSlug = oldTypeSlug(data.scope_type?.slug ?? null);
  const scopeType = typeSlug ? { id: data.scope_type_id, slug: typeSlug } : { id: data.scope_type_id };

  redirect(
    scopeHref(
      scopeSeg(org ?? { id: data.organization_id }),
      scopeType,
      { id: data.id, slug: data.slug ?? null },
    ),
  );
}
