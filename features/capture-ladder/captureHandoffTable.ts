"use client";

/**
 * features/capture-ladder/captureHandoffTable.ts
 *
 * THE ONE READ of `media.capture_handoff` in this app.
 *
 * 🚨 CLIENTS READ THIS TABLE DIRECTLY (CONTRACT.md §3): supabase-js, RLS-scoped,
 * org-stamped — never through the Python server. That is deliberate and it is
 * what makes the queue work at all: there is no outbound channel from aidream
 * to the extension. WRITES go the other way — through aidream's `/capture/*`
 * endpoints (§4) — so the ladder law, the settings knobs and the Library
 * landing are enforced in one place. Nothing in this module writes.
 *
 * ── Why this file casts the client, and what it does instead of trusting it ──
 *
 * This repo's law is that `types/database.types.ts` is the source of truth and
 * a hand-written row type is a defect. ONE fact makes that impossible today,
 * and it is somebody else's row to close:
 *
 *   `media` is not in the `pnpm db-types` schema list (package.json) — the
 *   generated `Database` type has no `media` key at all, so `.schema("media")`
 *   does not type-check on the generated client. Re-verified 2026-09-17.
 *
 * (The table itself is NO LONGER the problem: `media.capture_handoff` was
 * verified present on the live database on 2026-09-17, column-for-column
 * against `information_schema.columns`. An earlier revision of this file said
 * it did not exist yet; that sentence was true for about four hours.)
 *
 * So the cast is on the CLIENT (one line, here, named), never on the data: every
 * row that comes back is parsed by a Zod schema before any caller sees it, which
 * is the ingress validation the type-safety doctrine actually asks for. A row
 * that does not conform is DROPPED, COUNTED and reported up to the screen —
 * never rendered as if it were fine, and never quietly missing from a list that
 * otherwise looks complete.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createClient } from "@/utils/supabase/client";
import {
  HANDOFF_STATUSES,
  NEEDS_YOU_STATUSES,
  RUNGS,
  type CaptureHandoff,
} from "@/features/capture-ladder/types";

export const CAPTURE_HANDOFF_SCHEMA = "media" as const;
export const CAPTURE_HANDOFF_TABLE = "capture_handoff" as const;

/** PostgREST's code for "that table is not in the schema cache". */
const TABLE_NOT_FOUND = "PGRST205";
/** Postgres' own code for "that relation does not exist". */
const UNDEFINED_TABLE = "42P01";

const rungTrailEntrySchema = z.object({
  rung: z.enum(RUNGS),
  ok: z.boolean(),
  reason: z.string().nullable().default(null),
  note: z.string().nullable().default(null),
  chars: z.number().default(0),
  at: z.string(),
});

/**
 * The ingress parse — shaped by the LIVE column list, not by the contract's
 * prose. Deliberately strict on the fields a SCREEN depends on (id, url, rung,
 * status) and forgiving elsewhere: the NOT NULL text columns are coerced to
 * `""` rather than refused, because a row that reached the database without a
 * sentence is still a page the person's browser has to open, and dropping it
 * would cost them the work to save us an empty paragraph.
 */
const captureHandoffSchema = z.object({
  id: z.string(),
  organization_id: z.string(),
  url: z.string(),
  title: z
    .string()
    .nullable()
    .default("")
    .transform((v) => v ?? ""),
  rung: z.enum(["own_browser", "human_drive"]),
  status: z.enum(HANDOFF_STATUSES),
  reason: z
    .string()
    .nullable()
    .default("")
    .transform((v) => v ?? ""),
  reason_note: z
    .string()
    .nullable()
    .default("")
    .transform((v) => v ?? ""),
  what_to_do: z
    .string()
    .nullable()
    .default("")
    .transform((v) => v ?? ""),
  estimated_seconds: z.number().nullable().default(null),
  rung_trail: z
    .array(rungTrailEntrySchema)
    .nullable()
    .default([])
    .transform((v) => v ?? []),
  batch_id: z.string().nullable().default(null),
  library_id: z.string().nullable().default(null),
  claimed_by: z.string().nullable().default(null),
  claimed_at: z.string().nullable().default(null),
  claim_expires_at: z.string().nullable().default(null),
  attempt_count: z.number().default(0),
  captured_item_id: z.string().nullable().default(null),
  captured_chars: z.number().nullable().default(null),
  captured_at: z.string().nullable().default(null),
  captured_by_rung: z
    .enum(["own_browser", "human_drive"])
    .nullable()
    .default(null),
  final_url: z.string().nullable().default(null),
  failure_note: z.string().nullable().default(null),
  created_by: z.string().nullable().default(null),
  updated_by: z.string().nullable().default(null),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  deleted_at: z.string().nullable().default(null),
  version: z.number().default(1),
  metadata: z
    .record(z.string(), z.unknown())
    .nullable()
    .default({})
    .transform((v) => v ?? {}),
});

/**
 * Parse one wire row. Returns `null` — and says why on the console — when the
 * row cannot be rendered honestly. Never throws: one malformed row must not
 * take the whole tray down.
 */
export function parseCaptureHandoff(row: unknown): CaptureHandoff | null {
  const parsed = captureHandoffSchema.safeParse(row);
  if (parsed.success) return parsed.data;
  console.error(
    "[capture-ladder] a media.capture_handoff row did not match the contract and was dropped",
    parsed.error.issues,
  );
  return null;
}

/**
 * Parse a page of rows. Returns the good ones AND how many were dropped,
 * because a list that silently shrinks is the same lie as a list that is
 * silently empty — the caller shows the number.
 */
export function parseCaptureHandoffs(rows: readonly unknown[]): {
  handoffs: CaptureHandoff[];
  dropped: number;
} {
  const handoffs: CaptureHandoff[] = [];
  let dropped = 0;
  for (const row of rows) {
    const parsed = parseCaptureHandoff(row);
    if (parsed) handoffs.push(parsed);
    else dropped += 1;
  }
  return { handoffs, dropped };
}

/**
 * THE ONE CAST. `media` has no key on the generated `Database` type (see the
 * file header), so the typed client cannot name the schema. Everything that
 * comes back through it is parsed above before any caller sees it.
 */
function captureHandoffTable() {
  const client = createClient() as unknown as SupabaseClient;
  return client.schema(CAPTURE_HANDOFF_SCHEMA).from(CAPTURE_HANDOFF_TABLE);
}

/**
 * What a read can end in. `not_provisioned` is a first-class outcome, not an
 * error swallowed into an empty list: if this app ever runs against a database
 * without the table, the screen says so in plain words instead of showing a
 * serene, lying zero.
 */
export type CaptureHandoffReadResult =
  | { kind: "ok"; handoffs: CaptureHandoff[]; dropped: number }
  | { kind: "not_provisioned"; sentence: string }
  | { kind: "failed"; sentence: string };

const NOT_PROVISIONED_SENTENCE =
  "The capture queue is not set up on this database, so there is nothing to show. Nothing for you to do — this one is ours to fix.";

function isMissingTable(error: { code?: string | null } | null): boolean {
  return error?.code === TABLE_NOT_FOUND || error?.code === UNDEFINED_TABLE;
}

/** The sentence for dropped rows, or `null` when none were dropped. */
export function droppedRowsSentence(dropped: number): string | null {
  if (dropped <= 0) return null;
  return dropped === 1
    ? "One page in this queue came back in a shape we could not read, so it is not in the list below. It is still in the queue and your extension can still see it."
    : `${dropped} pages in this queue came back in a shape we could not read, so they are not in the list below. They are still in the queue and your extension can still see them.`;
}

/**
 * Every handoff in this organization that still needs a person or their
 * browser — `status in ('waiting','needs_drive')`, CONTRACT.md §8.1.
 *
 * Org-scoped explicitly. RLS scopes it too, but a bare RLS read blends every
 * org a person belongs to into one undifferentiated list (THE VIEW LAW), and
 * a handoff belongs to exactly one org (§9, no cross-org reach).
 */
export async function fetchNeedsYouHandoffs(
  organizationId: string,
): Promise<CaptureHandoffReadResult> {
  const { data, error } = await captureHandoffTable()
    .select("*")
    .eq("organization_id", organizationId)
    .in("status", NEEDS_YOU_STATUSES as readonly string[])
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    if (isMissingTable(error)) {
      return { kind: "not_provisioned", sentence: NOT_PROVISIONED_SENTENCE };
    }
    return {
      kind: "failed",
      sentence: `We could not read the pages waiting for your browser: ${error.message}`,
    };
  }

  const { handoffs, dropped } = parseCaptureHandoffs(data ?? []);
  return { kind: "ok", handoffs, dropped };
}
