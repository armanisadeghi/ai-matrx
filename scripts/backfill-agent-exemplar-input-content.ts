/**
 * Recover the complete first user turn for borrowed agent exemplars created
 * before metadata.input_content became part of the sample contract.
 *
 * Dry-run by default:
 *   pnpm tsx -r dotenv/config scripts/backfill-agent-exemplar-input-content.ts
 * Apply:
 *   pnpm tsx -r dotenv/config scripts/backfill-agent-exemplar-input-content.ts --apply
 *
 * This is intentionally evidence-only: rows without source_conversation_id are
 * reported as unrecoverable and never guessed. Existing input_content is never
 * overwritten. Every update repeats the row's explicit organization_id and is
 * guarded by version so concurrent edits cannot be lost.
 */

import { createClient } from "@supabase/supabase-js";
import { mergeJsonColumn, readAllRows } from "@ai-matrx/data/db";
import type { Database } from "@/types/database.types";
import { isJsonObject } from "@/types/json";
import {
  parseMessageContent,
  type MessagePart,
} from "@/types/python-generated/stream-events";

const INPUT_CONTENT_KEY = "input_content";
const apply = process.argv.includes("--apply");

type ExemplarRow = Pick<
  Database["agent"]["Tables"]["exemplar"]["Row"],
  "id" | "metadata" | "organization_id" | "source_conversation_id" | "version"
>;

type RecoverableExemplar = ExemplarRow & { source_conversation_id: string };

type MessageRow = Pick<
  Database["chat"]["Tables"]["message"]["Row"],
  "conversation_id" | "content" | "id" | "position"
>;

type VersionedExemplarMetadata = Pick<
  Database["agent"]["Tables"]["exemplar"]["Row"],
  "id" | "metadata" | "version"
>;

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment value: ${name}`);
  return value;
}

function hasCapturedInput(row: ExemplarRow): boolean {
  return isJsonObject(row.metadata) && INPUT_CONTENT_KEY in row.metadata;
}

function firstMessagesByConversation(
  rows: readonly MessageRow[],
): Map<string, MessagePart[]> {
  const sorted = [...rows].sort(
    (a, b) => a.position - b.position || a.id.localeCompare(b.id),
  );
  const result = new Map<string, MessagePart[]>();
  for (const row of sorted) {
    if (result.has(row.conversation_id)) continue;
    if (!Array.isArray(row.content)) {
      throw new Error(`User message ${row.id} has non-array content`);
    }
    result.set(row.conversation_id, parseMessageContent(row.content));
  }
  return result;
}

async function main(): Promise<void> {
  const supabase = createClient<Database>(
    requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requiredEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const exemplars = await readAllRows(
    ({ from, to }) =>
      supabase
        .schema("agent")
        .from("exemplar")
        .select(
          "id, metadata, organization_id, source_conversation_id, version",
          { count: "exact" },
        )
        .is("deleted_at", null)
        .not("source_conversation_id", "is", null)
        .range(from, to),
    { label: "agent exemplar input-content backfill" },
  );
  const recoverable = exemplars.filter(
    (row): row is RecoverableExemplar =>
      row.source_conversation_id !== null && !hasCapturedInput(row),
  );
  const conversationIds = [
    ...new Set(recoverable.map((row) => row.source_conversation_id)),
  ];

  const messages =
    conversationIds.length === 0
      ? []
      : await readAllRows(
          ({ from, to }) =>
            supabase
              .schema("chat")
              .from("message")
              .select("id, conversation_id, content, position", {
                count: "exact",
              })
              .in("conversation_id", conversationIds)
              .eq("role", "user")
              .is("deleted_at", null)
              .range(from, to),
          { label: "source conversation first-user-message backfill" },
        );
  const inputs = firstMessagesByConversation(messages);

  let saved = 0;
  let missingSourceMessage = 0;
  for (const exemplar of recoverable) {
    const parts = inputs.get(exemplar.source_conversation_id);
    if (!parts) {
      missingSourceMessage += 1;
      continue;
    }
    if (!apply) continue;

    const result = await mergeJsonColumn<VersionedExemplarMetadata>({
      fetchCurrent: () =>
        supabase
          .schema("agent")
          .from("exemplar")
          .select("id, metadata, version")
          .eq("id", exemplar.id)
          .eq("organization_id", exemplar.organization_id)
          .is("deleted_at", null)
          .maybeSingle(),
      readColumn: (row) => row.metadata,
      merge: (current) => {
        if (INPUT_CONTENT_KEY in current) return current;
        return { ...current, [INPUT_CONTENT_KEY]: parts };
      },
      applyUpdate: ({ value, expectedVersion, nextVersion }) =>
        supabase
          .schema("agent")
          .from("exemplar")
          .update({
            metadata: value,
            organization_id: exemplar.organization_id,
            version: nextVersion,
          })
          .eq("id", exemplar.id)
          .eq("organization_id", exemplar.organization_id)
          .eq("version", expectedVersion)
          .select("id, metadata, version")
          .maybeSingle(),
    });
    if (result.status !== "saved") {
      throw new Error(
        `Failed to backfill exemplar ${exemplar.id}: ${result.status}`,
      );
    }
    saved += 1;
  }

  console.log(
    JSON.stringify({
      mode: apply ? "apply" : "dry-run",
      candidates: recoverable.length,
      saved,
      missingSourceMessage,
    }),
  );
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
