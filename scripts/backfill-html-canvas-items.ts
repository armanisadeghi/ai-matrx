/**
 * Backfill: chat pages that were never materialised (rendered-output standard,
 * ruling 1 — common-docs/projects/rendered-output-standard/PLAN.md).
 *
 * An assistant `chat.message` that carries a ```html block but no `html`
 * canvas item has no version chain, so its card had nothing to publish. This
 * runs the REAL planner + `materializeBlocks` (the same numbering, splitter and
 * id-bearing rewrite the browser runs) for each such message, AS THE MESSAGE'S
 * OWNER: every write goes through the owner-checked `cx_canvas_upsert` and
 * `cx_message_set_content` (plus the owner's RLS for the discovery index)
 * inside a transaction that carries the owner's claims and the `authenticated`
 * role — the mechanism aidream's `acting_as_user` / matrx-orm `rls_session`
 * uses. Nothing bypasses an owner check.
 *
 * Publishing is the server's one writer (`publish_canvas_version`), so the
 * html domain step is run afterwards by
 * `aidream/scripts/publish_html_canvas_versions.py --message <id>...`, also as
 * the owner.
 *
 * Idempotent by message id: a message already holding an html canvas item is
 * not a candidate; re-running a half-done message re-upserts the same
 * (message, artifact_index) rows and writes the rewrite once.
 *
 *   pnpm tsx --env-file=.env.local scripts/backfill-html-canvas-items.ts            # dry run
 *   pnpm tsx --env-file=.env.local scripts/backfill-html-canvas-items.ts --apply    # write
 *   ... --message <uuid>   (repeatable) limit to named messages
 */
import process from "node:process";
import type pg from "pg";
import type { CxContentBlock } from "@ai-matrx/chat/public-chat/types/cx-tables";
import { planMaterialization } from "@/features/canvas/materialization/planMaterialization";
import {
  materializeBlocks,
  type MaterializeWriter,
} from "@/features/canvas/materialization/materializeBlocks";
import { canvasTypeToArtifactType } from "@/features/canvas/services/canvasArtifactService";
import type { CanvasArtifactRow } from "@/features/canvas/services/canvasArtifactService";
import { connectDirect, loadDbEnv } from "./lib/direct-db";

const APPLY = process.argv.includes("--apply");
const ONLY = process.argv.flatMap((a, i, all) =>
  a === "--message" && all[i + 1] ? [all[i + 1]!] : [],
);

interface Candidate {
  id: string;
  conversation_id: string;
  owner: string;
  content: CxContentBlock[];
}

const CANDIDATES_SQL = `
  select m.id, m.conversation_id, c.created_by as owner, m.content
  from chat.message m
  join chat.conversation c on c.id = m.conversation_id and c.deleted_at is null
  where m.role = 'assistant'
    and m.deleted_at is null
    and m.content::text ~ '\`\`\`html'
    and coalesce((c.metadata->>'surface_owns_output')::boolean, false) = false
    and not exists (
      select 1 from canvas.canvas_items ci
      where ci.source_message_id = m.id and ci.type = 'html' and ci.deleted_at is null)
    and ($1::uuid[] is null or m.id = any($1::uuid[]))
  order by m.created_at`;

/** Run `fn` in one transaction carrying `owner`'s claims as `authenticated`. */
async function asOwner<T>(
  db: pg.Client,
  owner: string,
  fn: () => Promise<T>,
): Promise<T> {
  await db.query("begin");
  try {
    // Claims first (still privileged), role last — the rls_session order.
    await db.query(
      "select set_config('request.jwt.claims', $1, true), set_config('role', 'authenticated', true)",
      [JSON.stringify({ sub: owner, role: "authenticated" })],
    );
    const out = await fn();
    await db.query("commit");
    return out;
  } catch (err) {
    await db.query("rollback");
    throw err;
  }
}

function ownerWriter(db: pg.Client, owner: string): MaterializeWriter {
  return {
    async isReadableById(canvasId) {
      try {
        return await asOwner(db, owner, async () => {
          const r = await db.query(
            "select 1 from canvas.canvas_items where id = $1 and deleted_at is null",
            [canvasId],
          );
          return r.rowCount === 1;
        });
      } catch (err) {
        console.error("  isReadableById failed:", err);
        return null;
      }
    },
    async upsertForSource(input) {
      if (input.source.system !== "cx_message") return null;
      try {
        return await asOwner(db, owner, async () => {
          const r = await db.query<{ row: CanvasArtifactRow }>(
            `select to_jsonb(public.cx_canvas_upsert(
               p_user_id => $1, p_message_id => $2, p_artifact_index => $3::smallint,
               p_type => $4, p_title => $5, p_content => $6::jsonb,
               p_source_type => $7)) as row`,
            [
              owner,
              input.source.id,
              input.artifactIndex,
              input.type,
              input.title,
              JSON.stringify({
                data: input.structured ?? input.content,
                type: input.type,
                metadata: input.metadata ?? {},
              }),
              input.sourceType ?? "model_direct",
            ],
          );
          return r.rows[0]?.row ?? null;
        });
      } catch (err) {
        console.error("  cx_canvas_upsert failed:", err);
        return null;
      }
    },
    async setExternalLink(canvasId, link) {
      await asOwner(db, owner, async () => {
        await db.query(
          "update canvas.canvas_items set external_system = $2, external_id = $3 where id = $1",
          [canvasId, link.externalSystem ?? null, link.externalId ?? null],
        );
      });
    },
    async upsertDiscoveryIndex(input) {
      const artifactType = canvasTypeToArtifactType(input.canvasType);
      if (!artifactType || !input.conversationId) return null;
      return asOwner(db, owner, async () => {
        const existing = await db.query<{ id: string }>(
          "select id from chat.artifact where canvas_item_id = $1",
          [input.canvasId],
        );
        if (existing.rows[0]) return { id: existing.rows[0].id };
        const conv = await db.query<{ organization_id: string | null; task_id: string | null }>(
          "select organization_id, task_id from chat.conversation where id = $1 and deleted_at is null",
          [input.conversationId],
        );
        const scope = conv.rows[0];
        if (!scope?.organization_id) return null;
        const created = await db.query<{ id: string }>(
          `insert into chat.artifact (canvas_item_id, message_id, conversation_id, source_system,
             source_id, artifact_index, artifact_type, status, title, organization_id, task_id,
             external_system, external_id, external_url, description, thumbnail_url, metadata)
           values ($1, $2, $3, 'cx_message', $2, $4, $5, 'published', $6, $7, $8,
             null, null, null, null, null, '{}'::jsonb)
           on conflict do nothing returning id`,
          [
            input.canvasId,
            input.source.id,
            input.conversationId,
            input.artifactIndex,
            artifactType,
            input.title ?? null,
            scope.organization_id,
            scope.task_id,
          ],
        );
        if (created.rows[0]) return { id: created.rows[0].id };
        const keyed = await db.query<{ id: string; canvas_item_id: string | null }>(
          `select id, canvas_item_id from chat.artifact
           where source_system = 'cx_message' and source_id = $1 and artifact_index = $2
             and artifact_type = $3 and external_system is null and conversation_id = $4`,
          [input.source.id, input.artifactIndex, artifactType, input.conversationId],
        );
        const row = keyed.rows[0];
        if (!row) return null;
        if (!row.canvas_item_id) {
          await db.query("update chat.artifact set canvas_item_id = $2 where id = $1", [
            row.id,
            input.canvasId,
          ]);
        }
        return { id: row.id };
      });
    },
  };
}

async function main() {
  const env = loadDbEnv();
  if ("missing" in env) throw new Error(`database variables missing: ${env.missing.join(", ")}`);
  const db = await connectDirect(env, "backfill-html-canvas-items");
  try {
    const { rows } = await db.query<Candidate>(CANDIDATES_SQL, [ONLY.length ? ONLY : null]);
    console.log(`${rows.length} candidate message(s)${APPLY ? "" : " — DRY RUN (pass --apply to write)"}`);

    let refused = 0;
    let done = 0;
    let noPage = 0;
    for (const m of rows) {
      const content = Array.isArray(m.content) ? m.content : [];
      const plan = planMaterialization(content);
      const taken = await db.query<{ artifact_index: number; id: string; type: string }>(
        `select artifact_index, id, type from canvas.canvas_items
         where source_message_id = $1 and deleted_at is null and artifact_index is not null`,
        [m.id],
      );
      // A NEW artifact may only land on an index no row holds — or one held by
      // a row the content does NOT reference (a prior partial run of the same
      // block, which the idempotent upsert re-lands). An index held by a row
      // the content already references is a collision: the upsert would
      // overwrite that other block's row.
      const referenced = new Set(plan.materializedArtifactIds);
      const collisions = plan.artifacts.filter((a) =>
        taken.rows.some((t) => t.artifact_index === a.artifactIndex && referenced.has(t.id)),
      );
      console.log(
        `\n${m.id}  owner=${m.owner}  existing=${taken.rows.length}  refs=${referenced.size}`,
      );
      for (const a of plan.artifacts) {
        console.log(
          `  #${a.artifactIndex} ${a.canvasType} "${a.title}" (${a.content.length} chars)` +
            (collisions.includes(a) ? "  << COLLIDES" : ""),
        );
      }
      if (!plan.artifacts.some((a) => a.canvasType === "html")) {
        // ```html named in prose (inline code, a quoted instruction) — the
        // planner sees no page, so there is nothing to materialise.
        console.log("  -- no html page in this message (the planner finds none) — nothing to do");
        noPage += 1;
        continue;
      }
      if (collisions.length) {
        console.log("  !! index collision — refused");
        refused += 1;
        continue;
      }
      if (!APPLY) continue;

      const res = await materializeBlocks({
        source: { system: "cx_message", id: m.id, conversationId: m.conversation_id },
        content,
        writer: ownerWriter(db, m.owner),
        runDomainAdapters: false,
        persistRewrite: async (rewritten) => {
          try {
            await asOwner(db, m.owner, () =>
              db.query("select 1 from public.cx_message_set_content($1, $2::jsonb)", [
                m.id,
                JSON.stringify(rewritten),
              ]),
            );
            return { ok: true };
          } catch (err) {
            return { ok: false, error: err instanceof Error ? err.message : String(err) };
          }
        },
      });
      console.log(
        `  -> materialized ${res.materializedCount}, rewritten=${res.rewrittenContent ? "yes" : "no"}` +
          (res.errors.length ? `, errors: ${res.errors.join(" | ")}` : ""),
      );
      if (res.rewrittenContent && res.errors.length === 0) done += 1;
      else refused += 1;
    }
    console.log(
      `\n${APPLY ? `applied ${done}` : `would apply ${rows.length - noPage - refused}`}; ` +
        `no page ${noPage}; refused/failed ${refused}`,
    );
    if (refused) process.exitCode = 1;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
