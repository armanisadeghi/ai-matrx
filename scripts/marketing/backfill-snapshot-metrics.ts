/**
 * Backfill: stamp seo_metrics + audit_metrics on web.snapshot rows that
 * predate crawl-time stamping. Uses the SAME deterministic TS evaluators the
 * scraper's Python twin mirrors, so payloads are identical to what a fresh
 * crawl would write (source: "client" marks backfill provenance). Only NULL
 * columns are filled — scraper-stamped values are never overwritten.
 *
 * web.snapshot is UPDATE-immutable by design (_reject_immutable_fact_mutation).
 * Run the backfill inside a trigger window, migration-style:
 *   1. alter table web.snapshot disable trigger _reject_immutable_fact_mutation;
 *   2. npx tsx scripts/marketing/backfill-snapshot-metrics.ts
 *   3. alter table web.snapshot enable trigger _reject_immutable_fact_mutation;
 * (Steps 1/3 via the Supabase MCP — app roles cannot toggle triggers.)
 * Safe to re-run any time; idempotent by construction.
 */
import { readFileSync } from "fs";

// Run from the repo root (`npx tsx scripts/marketing/...`) so these resolve.
for (const f of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^"|"$/g, "");
      }
    }
  } catch {}
}

async function main() {
  const { createAdminClient } = await import(
    "@/utils/supabase/adminClient"
  );
  const { buildStoredSeoMetrics } = await import(
    "@/features/seo/serp/metrics"
  );
  const { buildStoredAuditMetrics, socialInputFromRawTags } = await import(
    "@/features/seo/audit/stored"
  );
  const { headingInputsFromRaw } = await import(
    "@/features/seo/audit/headings"
  );

  const supabase = createAdminClient();
  const db = supabase.schema("web");

  const isRecord = (v: unknown): v is Record<string, unknown> =>
    Boolean(v) && typeof v === "object" && !Array.isArray(v);
  const str = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;

  let updated = 0;
  let failed = 0;
  for (let offset = 0; ; offset += 200) {
    const { data, error } = await db
      .from("snapshot")
      .select(
        "id, head_tags, headings, extracted, http_status, final_url, seo_metrics, audit_metrics",
      )
      .or("seo_metrics.is.null,audit_metrics.is.null")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(0, 199); // always page 0: rows leave the filter as they're updated
    if (error) throw error;
    if (!data || data.length === 0) break;

    for (const row of data) {
      const headTags = isRecord(row.head_tags) ? row.head_tags : {};
      const headings = isRecord(row.headings) ? row.headings : {};
      const extracted = isRecord(row.extracted) ? row.extracted : {};
      const og = isRecord(headTags.og) ? headTags.og : {};
      const twitter = isRecord(headTags.twitter) ? headTags.twitter : {};
      const redirectChain = Array.isArray(extracted.redirect_chain)
        ? (extracted.redirect_chain as unknown[]).flatMap((hop) =>
            isRecord(hop) && typeof hop.url === "string"
              ? [
                  {
                    url: hop.url,
                    status: typeof hop.status === "number" ? hop.status : null,
                  },
                ]
              : [],
          )
        : [];

      const patch: { seo_metrics?: unknown; audit_metrics?: unknown } = {};
      if (row.seo_metrics === null) {
        patch.seo_metrics = buildStoredSeoMetrics(
          str(headTags.title) ?? "",
          str(headTags.meta_description) ?? "",
          "client",
        );
      }
      if (row.audit_metrics === null) {
        patch.audit_metrics = buildStoredAuditMetrics(
          {
            social: socialInputFromRawTags(og, twitter),
            headings: headingInputsFromRaw(headings.all),
            indexability: {
              httpStatus: typeof row.http_status === "number" ? row.http_status : null,
              metaRobots: str(headTags.meta_robots),
              canonicalUrl: str(headTags.canonical_url),
              redirectChain,
              finalUrl: typeof row.final_url === "string" ? row.final_url : null,
            },
          },
          "client",
        );
      }
      if (Object.keys(patch).length === 0) continue;
      const { error: updateError } = await db
        .from("snapshot")
        .update(patch)
        .eq("id", row.id);
      if (updateError) {
        failed += 1;
        console.error("FAILED", row.id, updateError.message);
      } else {
        updated += 1;
      }
    }
    console.log(`progress: updated=${updated} failed=${failed}`);
    if (data.length < 200) break;
  }
  console.log(`DONE: updated=${updated} failed=${failed}`);
  if (failed > 0) process.exit(1);
}

void main();
