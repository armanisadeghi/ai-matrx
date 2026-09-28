import type { EducationLibraryKind, EducationLibraryRow } from "@/features/education/library/types";

const LIBRARY_KINDS: readonly EducationLibraryKind[] = ["fc_set", "assessment", "study_media", "note"];

export interface ManualKitArtifactRef {
  kind: EducationLibraryKind;
  id: string;
}

export interface RecoveredManualKitDraft {
  title: string;
  source: { id: string; name: string } | null;
  selected: EducationLibraryRow[];
  restored: boolean;
}

type RecoveryDependencies = {
  resolveSource: (sourceId: string) => Promise<{ name: string }>;
  resolveRows: (refs: readonly ManualKitArtifactRef[]) => Promise<EducationLibraryRow[]>;
};

type RecoveryOptions = {
  sourceIdOverride?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isLibraryKind(value: string): value is EducationLibraryKind {
  return (LIBRARY_KINDS as readonly string[]).includes(value);
}

function artifactRefs(value: unknown): ManualKitArtifactRef[] {
  if (!Array.isArray(value)) return [];
  const refs = new Map<string, ManualKitArtifactRef>();
  for (const raw of value) {
    const record = asRecord(raw);
    const kind = text(record?.kind);
    const id = text(record?.id);
    if (!kind || !id || !isLibraryKind(kind)) continue;
    refs.set(`${kind}:${id}`, { kind, id });
  }
  return [...refs.values()];
}

/**
 * Draft storage contains only identities. Restore current, authorized rows so
 * a stale session value never becomes an artifact passed to the kit writer.
 */
export async function recoverManualKitDraft(
  raw: string,
  { resolveSource, resolveRows }: RecoveryDependencies,
  { sourceIdOverride }: RecoveryOptions = {},
): Promise<RecoveredManualKitDraft | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const draft = asRecord(parsed);
  if (!draft) return null;

  const title = typeof draft.title === "string" ? draft.title : "";
  const sourceId = sourceIdOverride === undefined ? text(draft.sourceId) : text(sourceIdOverride);
  const refs = artifactRefs(draft.selected);
  const [sourceResult, rowsResult] = await Promise.allSettled([
    sourceId ? resolveSource(sourceId) : Promise.resolve(null),
    refs.length ? resolveRows(refs) : Promise.resolve([]),
  ]);
  const source = sourceId && sourceResult.status === "fulfilled" && sourceResult.value
    ? { id: sourceId, name: sourceResult.value.name }
    : null;
  const requested = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`));
  const selected = rowsResult.status === "fulfilled"
    ? rowsResult.value.filter((row) => requested.has(`${row.kind}:${row.id}`))
    : [];

  return { title, source, selected, restored: Boolean(title || source || selected.length) };
}
