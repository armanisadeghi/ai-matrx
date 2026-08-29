/**
 * features/product-capture/pipeline-service.ts
 *
 * Persistence for the listing pipeline (stages, HITL questions, AI payloads,
 * folder-split correction) — direct Supabase, same contracts as service.ts:
 * explicit organization_id on every insert, version-guarded CAS on item
 * writes, and NO client-fired workflows — a stage/status write IS the
 * workflow handoff (workflow.watch_table instruments the item table).
 */

import { createClient } from "@/utils/supabase/client";
import { guardedUpdate } from "@/utils/supabase/guardedUpdate";

import type { CaptureItem } from "./types";
import type {
  PayloadDataByKind,
  PayloadKind,
  PipelinePayload,
  PipelineStage,
} from "./pipeline-types";
import { closeItem, loadItem, reopenItem } from "./service";

function items() {
  return createClient().schema("workbench").from("product_capture_item");
}
function questions() {
  return createClient().schema("workbench").from("product_capture_question");
}
function payloads() {
  return createClient().schema("workbench").from("product_capture_payload");
}

const ITEM_COLUMNS =
  "id, organization_id, code, code_source, notes, folder_path, status, stage, featured_file_id, created_at, version";

// ── Item projections (pipeline-aware superset of CaptureItem) ───────────────

export interface PipelineItem extends CaptureItem {
  stage: PipelineStage;
  featuredFileId: string | null;
}

interface PipelineItemRow {
  id: string;
  organization_id: string;
  code: string | null;
  code_source: string | null;
  notes: string;
  folder_path: string;
  status: string;
  stage: string;
  featured_file_id: string | null;
  created_at: string;
  version: number;
}

function toPipelineItem(row: PipelineItemRow): PipelineItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    code: row.code,
    codeSource: (row.code_source as CaptureItem["codeSource"]) ?? null,
    notes: row.notes,
    folderPath: row.folder_path,
    status: row.status as CaptureItem["status"],
    stage: row.stage as PipelineStage,
    featuredFileId: row.featured_file_id,
    createdAt: row.created_at,
    version: row.version,
  };
}

export async function loadPipelineItem(
  itemId: string,
): Promise<PipelineItem | null> {
  const { data, error } = await items()
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data ? toPipelineItem(data as PipelineItemRow) : null;
}

/** The org's items grouped for the stage stepper (a render list — a short
 *  page per stage is acceptable; management completeness lives on /all). */
export async function listItemsByStage(
  organizationId: string,
  stage: PipelineStage,
  limit = 200,
): Promise<PipelineItem[]> {
  const { data, error } = await items()
    .select(ITEM_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("stage", stage)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as PipelineItemRow[]).map(toPipelineItem);
}

/** Batch item load (the Q&A queue joins questions to their items). */
export async function listItemsByIds(
  ids: string[],
): Promise<Map<string, PipelineItem>> {
  const map = new Map<string, PipelineItem>();
  if (ids.length === 0) return map;
  const { data, error } = await items()
    .select(ITEM_COLUMNS)
    .in("id", ids)
    .is("deleted_at", null);
  if (error) throw error;
  for (const row of (data ?? []) as PipelineItemRow[]) {
    map.set(row.id, toPipelineItem(row));
  }
  return map;
}

/** Per-stage counts for the stepper badges. */
export async function countItemsByStage(
  organizationId: string,
): Promise<Record<string, number>> {
  const { data, error } = await items()
    .select("stage")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ stage: string }>) {
    counts[row.stage] = (counts[row.stage] ?? 0) + 1;
  }
  return counts;
}

/**
 * Move an item to a pipeline stage (guarded CAS). The DB transition fires the
 * registered workflow event trigger for that hop — "send to research",
 * "resubmit with answers", "generate listing" are all exactly this write.
 */
export async function setItemStage(
  item: PipelineItem,
  stage: PipelineStage,
): Promise<PipelineItem> {
  const result = await guardedUpdate<PipelineItemRow & { version: number }>({
    expectedVersion: item.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      items()
        .update({ stage, version: nextVersion })
        .eq("id", item.id)
        .eq("version", expectedVersion)
        .select(ITEM_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      items().select(ITEM_COLUMNS).eq("id", item.id).maybeSingle(),
  });
  if (result.status === "saved") return toPipelineItem(result.row);
  if (result.status === "conflict") {
    // Retry once onto the row that landed — a stage hop is idempotent intent.
    const current = toPipelineItem(result.currentRow);
    if (current.stage === stage) return current;
    return setItemStage(current, stage);
  }
  throw new Error("This item no longer exists.");
}

/** Designate (or clear) the featured image. */
export async function setFeaturedFile(
  item: PipelineItem,
  fileId: string | null,
): Promise<PipelineItem> {
  const result = await guardedUpdate<PipelineItemRow & { version: number }>({
    expectedVersion: item.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      items()
        .update({ featured_file_id: fileId, version: nextVersion })
        .eq("id", item.id)
        .eq("version", expectedVersion)
        .select(ITEM_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      items().select(ITEM_COLUMNS).eq("id", item.id).maybeSingle(),
  });
  if (result.status === "saved") return toPipelineItem(result.row);
  if (result.status === "conflict")
    return setFeaturedFile(toPipelineItem(result.currentRow), fileId);
  throw new Error("This item no longer exists.");
}

// ── Payloads (one document per item per kind) ───────────────────────────────

const PAYLOAD_COLUMNS = "id, item_id, kind, data, updated_at, version";

interface PayloadRow {
  id: string;
  item_id: string;
  kind: string;
  data: unknown;
  updated_at: string;
  version: number;
}

function toPayload(row: PayloadRow): PipelinePayload {
  const data = row.data;
  return {
    id: row.id,
    itemId: row.item_id,
    kind: row.kind as PayloadKind,
    // Defensive: a payload is agent-written jsonb — never trust its shape.
    data: (data && typeof data === "object" && !Array.isArray(data)
      ? data
      : {}) as PipelinePayload["data"],
    updatedAt: row.updated_at,
    version: row.version,
  };
}

export async function listPayloads(
  itemId: string,
): Promise<Partial<Record<PayloadKind, PipelinePayload>>> {
  const { data, error } = await payloads()
    .select(PAYLOAD_COLUMNS)
    .eq("item_id", itemId);
  if (error) throw error;
  const out: Partial<Record<PayloadKind, PipelinePayload>> = {};
  for (const row of (data ?? []) as PayloadRow[]) {
    out[row.kind as PayloadKind] = toPayload(row);
  }
  return out;
}

/**
 * Write a payload document (human edits from the workspace). Upserts the
 * (item, kind) row; concurrent edits ride the CAS with a retry that REPLACES
 * — payload editing is a single-editor surface, and agents rewrite whole
 * documents on their own passes anyway.
 */
export async function savePayload<K extends PayloadKind>(
  // Identity + org only — the INSTANT lane writes its run pointer from a plain
  // `CaptureItem` (no stage/featured columns loaded) the instant the run's
  // conversation exists, and must not pay for a pipeline re-read to do it.
  item: Pick<PipelineItem, "id" | "organizationId">,
  kind: K,
  data: Partial<PayloadDataByKind[K]>,
  existing?: PipelinePayload<K>,
): Promise<PipelinePayload<K>> {
  if (!existing) {
    const { data: inserted, error } = await payloads()
      .insert({
        item_id: item.id,
        organization_id: item.organizationId,
        kind,
        data: data as never,
      })
      .select(PAYLOAD_COLUMNS)
      .single();
    if (!error) return toPayload(inserted as PayloadRow) as PipelinePayload<K>;
    // Unique (item, kind) race — an agent wrote first. Re-read and update.
    const { data: raced, error: readErr } = await payloads()
      .select(PAYLOAD_COLUMNS)
      .eq("item_id", item.id)
      .eq("kind", kind)
      .maybeSingle();
    if (readErr || !raced) throw error;
    existing = toPayload(raced as PayloadRow) as PipelinePayload<K>;
  }

  const existingRow = existing;
  const result = await guardedUpdate<PayloadRow & { version: number }>({
    expectedVersion: existingRow.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      payloads()
        .update({ data: data as never, version: nextVersion })
        .eq("id", existingRow.id)
        .eq("version", expectedVersion)
        .select(PAYLOAD_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      payloads().select(PAYLOAD_COLUMNS).eq("id", existingRow.id).maybeSingle(),
  });
  if (result.status === "saved")
    return toPayload(result.row) as PipelinePayload<K>;
  if (result.status === "conflict") {
    return savePayload(
      item,
      kind,
      data,
      toPayload(result.currentRow) as PipelinePayload<K>,
    );
  }
  throw new Error("The payload row no longer exists.");
}

// ── Questions (the HITL queue) ──────────────────────────────────────────────

export type QuestionKind = "text" | "choice" | "boolean";
export type QuestionStatus = "open" | "answered" | "deferred" | "resolved";
export type QuestionSource = "analysis" | "research" | "finalize" | "human";

export interface PipelineQuestion {
  id: string;
  itemId: string;
  prompt: string;
  context: string | null;
  kind: QuestionKind;
  options: Array<{ value: string; label: string }>;
  source: QuestionSource;
  status: QuestionStatus;
  answer: string | null;
  answeredAt: string | null;
  deferredReason: string | null;
  skipCount: number;
  priority: number;
  createdAt: string;
  version: number;
}

const QUESTION_COLUMNS =
  "id, item_id, prompt, context, kind, options, source, status, answer, answered_at, deferred_reason, skip_count, priority, created_at, version";

interface QuestionRow {
  id: string;
  item_id: string;
  prompt: string;
  context: string | null;
  kind: string;
  options: unknown;
  source: string;
  status: string;
  answer: string | null;
  answered_at: string | null;
  deferred_reason: string | null;
  skip_count: number;
  priority: number;
  created_at: string;
  version: number;
}

function toQuestion(row: QuestionRow): PipelineQuestion {
  const options = Array.isArray(row.options)
    ? (row.options as Array<{ value?: unknown; label?: unknown }>)
        .filter((o) => o && typeof o === "object")
        .map((o) => ({
          value: String(o.value ?? ""),
          label: String(o.label ?? o.value ?? ""),
        }))
    : [];
  return {
    id: row.id,
    itemId: row.item_id,
    prompt: row.prompt,
    context: row.context,
    kind: (["text", "choice", "boolean"].includes(row.kind)
      ? row.kind
      : "text") as QuestionKind,
    options,
    source: (["analysis", "research", "finalize", "human"].includes(row.source)
      ? row.source
      : "research") as QuestionSource,
    status: (["open", "answered", "deferred", "resolved"].includes(row.status)
      ? row.status
      : "open") as QuestionStatus,
    answer: row.answer,
    answeredAt: row.answered_at,
    deferredReason: row.deferred_reason,
    skipCount: row.skip_count,
    priority: row.priority,
    createdAt: row.created_at,
    version: row.version,
  };
}

/** Questions of one item (all statuses — the workspace shows history too). */
export async function listItemQuestions(
  itemId: string,
): Promise<PipelineQuestion[]> {
  const { data, error } = await questions()
    .select(QUESTION_COLUMNS)
    .eq("item_id", itemId)
    .order("status", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as QuestionRow[]).map(toQuestion);
}

/** The org-wide quick-answer queue: OPEN questions, skipped ones last. */
export async function listOpenQuestions(
  organizationId: string,
  limit = 100,
): Promise<PipelineQuestion[]> {
  const { data, error } = await questions()
    .select(QUESTION_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("status", "open")
    .order("skip_count", { ascending: true })
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return ((data ?? []) as QuestionRow[]).map(toQuestion);
}

/** Open-question counts per item (stage-list badges). */
export async function countOpenQuestionsByItem(
  organizationId: string,
): Promise<Map<string, number>> {
  const { data, error } = await questions()
    .select("item_id")
    .eq("organization_id", organizationId)
    .eq("status", "open");
  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ item_id: string }>) {
    map.set(row.item_id, (map.get(row.item_id) ?? 0) + 1);
  }
  return map;
}

/** A human adds their own question/note-to-agents from the workspace. */
export async function createQuestion(args: {
  item: PipelineItem;
  prompt: string;
  context?: string;
  kind?: QuestionKind;
  options?: Array<{ value: string; label: string }>;
  source?: QuestionSource;
  priority?: number;
}): Promise<PipelineQuestion> {
  const { data, error } = await questions()
    .insert({
      item_id: args.item.id,
      organization_id: args.item.organizationId,
      prompt: args.prompt,
      context: args.context ?? null,
      kind: args.kind ?? "text",
      options: (args.options ?? []) as never,
      source: args.source ?? "human",
      priority: args.priority ?? 0,
    })
    .select(QUESTION_COLUMNS)
    .single();
  if (error) throw error;
  return toQuestion(data as QuestionRow);
}

async function guardedQuestionWrite(
  question: PipelineQuestion,
  patch: Record<string, unknown>,
): Promise<PipelineQuestion> {
  const result = await guardedUpdate<QuestionRow & { version: number }>({
    expectedVersion: question.version,
    applyUpdate: ({ expectedVersion, nextVersion }) =>
      questions()
        .update({ ...patch, version: nextVersion })
        .eq("id", question.id)
        .eq("version", expectedVersion)
        .select(QUESTION_COLUMNS)
        .maybeSingle(),
    fetchCurrent: () =>
      questions().select(QUESTION_COLUMNS).eq("id", question.id).maybeSingle(),
  });
  if (result.status === "saved") return toQuestion(result.row);
  if (result.status === "conflict")
    return guardedQuestionWrite(toQuestion(result.currentRow), patch);
  throw new Error("This question no longer exists.");
}

export async function answerQuestion(
  question: PipelineQuestion,
  answer: string,
): Promise<PipelineQuestion> {
  return guardedQuestionWrite(question, {
    status: "answered",
    answer,
    answered_at: new Date().toISOString(),
  });
}

/** Skip → back of the quick-answer queue (never immediately reappears). */
export async function skipQuestion(
  question: PipelineQuestion,
): Promise<PipelineQuestion> {
  return guardedQuestionWrite(question, {
    skip_count: question.skipCount + 1,
  });
}

/** "Not a quick answer" — routed out of the quick flow (physical testing…). */
export async function deferQuestion(
  question: PipelineQuestion,
  reason?: string,
): Promise<PipelineQuestion> {
  return guardedQuestionWrite(question, {
    status: "deferred",
    deferred_reason: reason ?? null,
  });
}

/** Reopen a deferred/answered question back into the queue. */
export async function reopenQuestion(
  question: PipelineQuestion,
): Promise<PipelineQuestion> {
  return guardedQuestionWrite(question, {
    status: "open",
    deferred_reason: null,
  });
}

// ── Folder-split correction (composition = "mixed") ─────────────────────────

export interface SplitGroupInput {
  label: string;
  fileIds: string[];
}

/**
 * Correct a mis-grouped folder: keep the FIRST group on the original item and
 * peel every other group off into a new item, re-pointing the file links.
 * Every affected item is then re-closed (capturing → captured), which
 * re-fires the intake analysis trigger — the corrected items run back
 * through the pipeline separately, exactly as the analysis output intended.
 *
 * Files stay in the original item's cloud folder (folder_path is set once,
 * never renamed — the DB link rows are the linkage of record).
 */
export async function splitItem(
  original: PipelineItem,
  groups: SplitGroupInput[],
): Promise<{ original: PipelineItem; created: PipelineItem[] }> {
  if (groups.length < 2) {
    throw new Error("A split needs at least two groups.");
  }
  const created: PipelineItem[] = [];

  for (const group of groups.slice(1)) {
    if (group.fileIds.length === 0) continue;
    const id = crypto.randomUUID();
    const { data, error } = await items()
      .insert({
        id,
        organization_id: original.organizationId,
        // Keep filing under the original folder — DB links are the linkage.
        folder_path: original.folderPath,
        notes: `Split from ${original.code ?? original.id} (${group.label}).`,
        status: "capturing",
        stage: "intake",
      })
      .select(ITEM_COLUMNS)
      .single();
    if (error) throw error;
    const newItem = toPipelineItem(data as PipelineItemRow);

    const { error: moveErr } = await createClient()
      .schema("workbench")
      .from("product_capture_file")
      .update({ item_id: newItem.id })
      .eq("item_id", original.id)
      .in("file_id", group.fileIds);
    if (moveErr) throw moveErr;

    // capturing → captured fires the intake trigger for the new item.
    created.push({
      ...(await closeItem(newItem as CaptureItem)),
      stage: newItem.stage,
      featuredFileId: newItem.featuredFileId,
    } as PipelineItem);
  }

  // The original's analysis is stale — bounce its status to re-fire intake.
  const fresh = await loadItem(original.id);
  if (fresh) {
    const reopened = await reopenItem(fresh);
    await closeItem(reopened);
  }
  const reloaded = await loadPipelineItem(original.id);
  return { original: reloaded ?? original, created };
}
