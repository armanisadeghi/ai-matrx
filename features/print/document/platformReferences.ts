// features/print/document/platformReferences.ts
//
// The platform's citation-key resolver for @ai-matrx/print/document (RC-B10).
// A document can cite the sources the platform already holds, without typing
// a reference into its frontmatter:
//
//   [@research:<rs_source id>]   a research source (web page found by a topic)
//   [@file:<files.files id>]     a file (title/author/date from its metadata)
//
// Rows are read as the signed-in person, so RLS decides what may be cited; a
// key the person cannot read stays unresolved and the document says so.

import { supabase } from "@/utils/supabase/client";
import type { CslItem } from "@ai-matrx/print/document";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function dateParts(value: unknown): CslItem["issued"] {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const m = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(value));
  if (!m) return undefined;
  return { "date-parts": [[Number(m[1]), ...(m[2] ? [Number(m[2])] : []), ...(m[3] ? [Number(m[3])] : [])]] };
}

function names(value: unknown): CslItem["author"] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\s*(?:;|\band\b)\s*/) : [];
  const out = list
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter(Boolean)
    .map((n) => {
      if (n.includes(",")) {
        const [family, given] = n.split(",").map((x) => x.trim());
        return { family, given };
      }
      const parts = n.split(/\s+/);
      return parts.length > 1 ? { family: parts[parts.length - 1], given: parts.slice(0, -1).join(" ") } : { literal: n };
    });
  return out.length ? out : undefined;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export async function resolvePlatformReferences(keys: string[]): Promise<CslItem[]> {
  const ids = (prefix: string) =>
    keys.filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)).filter((id) => UUID.test(id));
  const researchIds = ids("research:");
  const fileIds = ids("file:");
  const out: CslItem[] = [];

  const [research, files] = await Promise.all([
    researchIds.length
      ? supabase
          .schema("research")
          .from("rs_source")
          .select("id, url, title, hostname, page_age, discovered_at, source_type")
          .is("deleted_at", null)
          .in("id", researchIds)
      : Promise.resolve({ data: [], error: null }),
    fileIds.length
      ? supabase
          .schema("files")
          .from("files")
          .select("id, file_name, metadata, created_at")
          .is("deleted_at", null)
          .in("id", fileIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (research.error) console.error("[print] research sources could not be read for citations", research.error);
  if (files.error) console.error("[print] files could not be read for citations", files.error);

  for (const row of (research.data ?? []) as Array<Record<string, unknown>>) {
    out.push({
      id: `research:${row.id as string}`,
      type: row.source_type === "video" ? "motion_picture" : "webpage",
      title: str(row.title) ?? str(row.url),
      "container-title": str(row.hostname),
      URL: str(row.url),
      issued: dateParts(row.page_age) ?? dateParts(row.discovered_at),
    });
  }
  for (const row of (files.data ?? []) as Array<Record<string, unknown>>) {
    const meta = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<string, unknown>;
    out.push({
      id: `file:${row.id as string}`,
      type: str(meta.csl_type) ?? "document",
      title: str(meta.title) ?? str(row.file_name)?.replace(/\.[a-z0-9]+$/i, ""),
      author: names(meta.author ?? meta.authors ?? meta.creator),
      publisher: str(meta.publisher),
      DOI: str(meta.doi),
      URL: str(meta.url),
      issued: dateParts(meta.date ?? meta.year ?? meta.published) ?? dateParts(row.created_at),
    });
  }
  return out;
}
