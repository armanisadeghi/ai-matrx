import { notFound, redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { contextDb } from "@/utils/supabase/contextDb";

/**
 * Short-link resolver for a scope: /scopes/s/[scopeId] → the canonical
 * org-scoped workspace route
 * (/organizations/{orgId}/scopes/{typeId}/{scopeId}).
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
    .select("id, organization_id, scope_type_id")
    .eq("id", scopeId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();

  redirect(
    `/organizations/${data.organization_id}/scopes/${data.scope_type_id}/${data.id}`,
  );
}
