// features/scopes/service/templateAudience.ts
//
// THE SEAM FOR REC-64: `context.templates.is_personal` BECOMES `audience`.
//
// `w1_org_audience_is_a_word_on_main.sql` replaces the boolean with a word —
// `audience ∈ {individual, organization}` — because the boolean's two states were
// the same two facts wearing a name that could not grow: a third audience is a third
// word here and was a second boolean there.
//
// WHY THIS FILE. The migration runs unattended inside the 1-4 AM Pacific window and
// the deployed bundle does not change at the moment it commits, so the served code
// must name `is_personal` before the file lands and `audience` after it, with no
// redeploy in between. That is the safe-cutover rule: read the new column when
// present, the old when not.
//
// ONE READER, NOT TEN. Almost everything that wants a template's audience goes
// through `public.list_templates`, which KEEPS emitting the `is_personal` boolean as
// a derived value (`audience = 'individual'`) and keeps its signature — so
// `templatesSlice`, `p_personal_only` and both TemplateGalleryDrawer components need
// nothing. `scopesService.listTemplates` is the one place that reads the TABLE
// directly, and this is the one place that knows the column moved.
//
// WHY A SEPARATE QUERY RATHER THAN A DYNAMIC SELECT LIST. `listTemplates` fetches a
// nested join whose select string is a literal — that literal is what gives the rows
// their types. Splicing a runtime column name into it would turn the whole result
// untyped to carry one boolean. Thirty-four rows of `(id, audience)` is a second
// round trip and nothing else is given up. A first-class dynamic select belongs in
// the query layer, not in a cutover.

import type { SupabaseClient } from "@supabase/supabase-js";

/** `true` when the template is for an individual (what `is_personal` meant). */
export type TemplateIsPersonalById = ReadonlyMap<string, boolean>;

/** PostgreSQL `undefined_column` / PostgREST's schema-cache form of the same. */
function meansColumnAbsent(error: { code?: string | null } | null): boolean {
  const code = error?.code ?? "";
  return code === "42703" || code === "PGRST204";
}

/**
 * Every template's audience, keyed by id, on whichever side of REC-64 the database
 * is on. Asks for `audience` first — the end state — and falls back to the boolean
 * only when the column is genuinely not there yet.
 *
 * Returns `null` when NEITHER could be read. That is not "nothing is personal": the
 * caller keeps whatever it already had rather than silently re-labelling every
 * template as an organization template, and says so in the log.
 */
export async function readTemplateIsPersonal(
  supabase: SupabaseClient,
): Promise<TemplateIsPersonalById | null> {
  const db = supabase.schema("context") as unknown as {
    from(table: string): {
      select(columns: string): Promise<{
        data: Record<string, unknown>[] | null;
        error: { code?: string | null; message?: string | null } | null;
      }>;
    };
  };

  const byWord = await db.from("templates").select("id, audience");
  if (!byWord.error) {
    return new Map(
      (byWord.data ?? []).map((row) => [
        String(row["id"]),
        row["audience"] === "individual",
      ]),
    );
  }
  if (!meansColumnAbsent(byWord.error)) {
    console.error(
      `[scopes/templateAudience] LOUD: could not read context.templates.audience — ` +
        `${byWord.error.code ?? "no code"}: ${byWord.error.message ?? "no message"}. ` +
        "Nothing was assumed about any template's audience.",
    );
    return null;
  }

  // REC-64 has not landed on this database yet; the boolean is still the truth.
  const byBoolean = await db.from("templates").select("id, is_personal");
  if (byBoolean.error) {
    console.error(
      `[scopes/templateAudience] LOUD: context.templates has neither \`audience\` nor ` +
        `\`is_personal\` that we can read — ${byBoolean.error.code ?? "no code"}: ` +
        `${byBoolean.error.message ?? "no message"}. Nothing was assumed.`,
    );
    return null;
  }
  return new Map(
    (byBoolean.data ?? []).map((row) => [
      String(row["id"]),
      row["is_personal"] === true,
    ]),
  );
}
