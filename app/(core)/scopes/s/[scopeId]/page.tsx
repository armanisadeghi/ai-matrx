import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { contextDb } from "@/utils/supabase/contextDb";
import { scopeHref, scopeSeg } from "@/features/scopes/lib/scopeRoutes";

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
  // context.* has no anonymous grants — an anon query errors rather than
  // returning empty. Send signed-out visitors to login and back here.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/scopes/s/${scopeId}`);

  const { data, error } = await contextDb(supabase)
    .from("scopes")
    .select("id, slug, organization_id, scope_type_id")
    .eq("id", scopeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();

  // Land on the CANONICAL address, not an id one. A short link that redirected
  // to ids handed every visitor the non-canonical URL and left the client-side
  // canonicalizer to rewrite it a moment later — a visible second navigation on
  // every share of a scope. Resolve the org + type slugs here instead.
  //
  // These two reads are decoration, never gates: a null row (RLS, a race, a
  // row without a slug) falls back to the id segment, which the routes resolve
  // exactly as before. Only the SCOPE read above decides 404.
  const [{ data: scopeType }, { data: org }] = await Promise.all([
    contextDb(supabase)
      .from("scope_types")
      .select("id, slug")
      .eq("id", data.scope_type_id)
      .maybeSingle(),
    supabase
      .schema("iam")
      .from("organizations")
      .select("id, slug")
      .eq("id", data.organization_id)
      .maybeSingle(),
  ]);

  redirect(
    scopeHref(
      scopeSeg(org ?? { id: data.organization_id }),
      scopeType ?? { id: data.scope_type_id },
      data,
    ),
  );
}
