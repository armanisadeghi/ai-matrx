/**
 * ensureArtifactPersisted — on-demand materialization for a single artifact.
 *
 * Used when opening canvas or hitting the cloud-sync button BEFORE (or instead
 * of) the full stream-end materialize pass. Returns a real `canvas_items` UUID
 * so Redux/canvas never operates on a raw-content snapshot alone.
 *
 * Idempotent: safe to call repeatedly; upserts on (source_message_id, artifact_index).
 */

import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { getAdapter } from "@/features/canvas/artifact-types/persistence/artifact-adapters";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import type { CanvasArtifactRow } from "@/features/canvas/services/canvasArtifactService";

export interface EnsureArtifactInput {
  canvasType: string;
  title: string;
  /** Raw payload the type's renderer consumes (markdown or JSON string). */
  content: string;
  /** Real message.id — required to create a new row when none exists. */
  messageId?: string | null;
  conversationId?: string | null;
  /** Stable 1-based index within the message (= canvas_items.artifact_index). */
  artifactIndex?: number;
  /** When already materialized, pass the UUID to skip upsert. */
  artifactId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface EnsureArtifactResult {
  ok: boolean;
  artifactId: string | null;
  version: number | null;
  externalSystem: string | null;
  externalId: string | null;
  wasCreated: boolean;
  /** Human-readable trace for admin debug UI. */
  steps: string[];
  errors: string[];
  row: CanvasArtifactRow | null;
}

function isClientTempId(id: string): boolean {
  return id.startsWith("client-") || id.startsWith("temp-");
}

function extractRowPayload(row: CanvasArtifactRow): string {
  const stored = row.content as
    | { data?: unknown; type?: string; metadata?: unknown }
    | string
    | null;
  if (stored && typeof stored === "object" && "data" in stored) {
    return typeof stored.data === "string"
      ? stored.data
      : JSON.stringify(stored.data ?? "");
  }
  if (typeof stored === "string") return stored;
  return "";
}

async function linkDomainRecord(
  row: CanvasArtifactRow,
  input: EnsureArtifactInput,
  steps: string[],
  errors: string[],
): Promise<CanvasArtifactRow> {
  if (row.external_system && row.external_id) {
    steps.push(
      `domain link already set: ${row.external_system} → ${row.external_id}`,
    );
    return row;
  }

  const def = getArtifactDef(input.canvasType);
  const adapter = getAdapter(def?.adapter);
  if (!adapter.onMaterialize) {
    steps.push(`no domain adapter for type "${input.canvasType}"`);
    return row;
  }

  if (!input.messageId) {
    steps.push("skipped domain link — no messageId");
    return row;
  }

  try {
    steps.push(`running ${def?.adapter ?? "unknown"} adapter.onMaterialize…`);
    const link = await adapter.onMaterialize({
      artifactId: row.id,
      canvasType: input.canvasType,
      title: input.title,
      rawContent: input.content || extractRowPayload(row),
      sourceMessageId: input.messageId,
      conversationId: input.conversationId ?? undefined,
    });
    if (link && (link.externalSystem || link.externalId)) {
      await canvasArtifactService.setExternalLink(row.id, link);
      steps.push(
        `domain linked: ${link.externalSystem ?? "?"} → ${link.externalId ?? "?"}`,
      );
      const refreshed = await canvasArtifactService.getById(row.id);
      return refreshed ?? row;
    }
    steps.push("adapter.onMaterialize returned no link");
  } catch (err) {
    errors.push(`domain link failed: ${String(err)}`);
  }
  return row;
}

/**
 * Ensure a persisted canvas_items row exists and return its UUID.
 */
export async function ensureArtifactPersisted(
  input: EnsureArtifactInput,
): Promise<EnsureArtifactResult> {
  const steps: string[] = [];
  const errors: string[] = [];
  const artifactIndex = input.artifactIndex ?? 1;

  // ── 1. Already have a materialized UUID ──────────────────────────────────
  if (isMaterializedArtifactId(input.artifactId)) {
    steps.push(`input artifactId is materialized UUID: ${input.artifactId}`);
    const row = await canvasArtifactService.getById(input.artifactId!);
    if (row) {
      steps.push(`verified row in canvas_items (${row.type} v${row.version})`);
      const linked = await linkDomainRecord(row, input, steps, errors);
      return {
        ok: true,
        artifactId: linked.id,
        version: linked.version,
        externalSystem: linked.external_system,
        externalId: linked.external_id,
        wasCreated: false,
        steps,
        errors,
        row: linked,
      };
    }
    errors.push(`artifactId ${input.artifactId} not found in DB — will upsert`);
  }

  // ── 2. Lookup by message + index / type ───────────────────────────────────
  if (input.messageId && !isClientTempId(input.messageId)) {
    steps.push(`lookup by messageId=${input.messageId}`);
    const existing = await canvasArtifactService.getByMessage(input.messageId);
    const sameType = existing.filter((r) => r.type === input.canvasType);
    if (sameType.length === 1) {
      steps.push(`found existing ${input.canvasType} row: ${sameType[0]!.id}`);
      const linked = await linkDomainRecord(sameType[0]!, input, steps, errors);
      return {
        ok: true,
        artifactId: linked.id,
        version: linked.version,
        externalSystem: linked.external_system,
        externalId: linked.external_id,
        wasCreated: false,
        steps,
        errors,
        row: linked,
      };
    }
    const byIndex = existing.find((r) => r.artifact_index === artifactIndex);
    if (byIndex) {
      steps.push(`found row at artifact_index=${artifactIndex}: ${byIndex.id}`);
      const linked = await linkDomainRecord(byIndex, input, steps, errors);
      return {
        ok: true,
        artifactId: linked.id,
        version: linked.version,
        externalSystem: linked.external_system,
        externalId: linked.external_id,
        wasCreated: false,
        steps,
        errors,
        row: linked,
      };
    }
    if (sameType.length > 1) {
      steps.push(
        `message has ${sameType.length} ${input.canvasType} rows — upserting index ${artifactIndex}`,
      );
    }
  } else if (input.messageId) {
    errors.push(
      `messageId "${input.messageId}" is a client temp id — cannot upsert yet`,
    );
    return {
      ok: false,
      artifactId: null,
      version: null,
      externalSystem: null,
      externalId: null,
      wasCreated: false,
      steps,
      errors,
      row: null,
    };
  }

  // ── 3. Upsert new row ─────────────────────────────────────────────────────
  if (!input.messageId || isClientTempId(input.messageId)) {
    errors.push(
      "cannot create artifact — need a real message.id (wait for message commit or stream end)",
    );
    return {
      ok: false,
      artifactId: null,
      version: null,
      externalSystem: null,
      externalId: null,
      wasCreated: false,
      steps,
      errors,
      row: null,
    };
  }

  steps.push(
    `cx_canvas_upsert(type=${input.canvasType}, index=${artifactIndex})…`,
  );
  const saved = await canvasArtifactService.upsert({
    messageId: input.messageId,
    artifactIndex,
    type: input.canvasType,
    title: input.title,
    content: input.content,
    metadata: input.metadata,
    conversationId: input.conversationId ?? null,
    sourceType: "model_direct",
  });

  if (!saved) {
    errors.push("cx_canvas_upsert returned null");
    return {
      ok: false,
      artifactId: null,
      version: null,
      externalSystem: null,
      externalId: null,
      wasCreated: false,
      steps,
      errors,
      row: null,
    };
  }

  steps.push(
    `created/updated canvas_items row: ${saved.id} (v${saved.version})`,
  );
  const linked = await linkDomainRecord(saved, input, steps, errors);

  try {
    await canvasArtifactService.upsertDiscoveryIndex({
      canvasId: linked.id,
      canvasType: input.canvasType,
      title: input.title ?? null,
      messageId: input.messageId,
      conversationId: input.conversationId ?? null,
    });
    steps.push("cx_artifact discovery index upserted");
  } catch (err) {
    errors.push(`discovery index failed: ${String(err)}`);
  }

  return {
    ok: true,
    artifactId: linked.id,
    version: linked.version,
    externalSystem: linked.external_system,
    externalId: linked.external_id,
    wasCreated: true,
    steps,
    errors,
    row: linked,
  };
}
