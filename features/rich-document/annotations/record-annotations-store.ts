// features/rich-document/annotations/record-annotations-store.ts
//
// Which Notes & comments dock is open, app-wide. Every <RecordAnnotations>
// mount (a note, a chat answer, a saved document in the studio preview)
// registers here with its record key and how many items it holds; at most ONE
// dock is open at a time (Google Docs: one comment rail), so opening another
// record's dock closes the first. The rich-document "Notes & comments" action
// (⋯ menu) reads and toggles it by record key.

export interface DockEntry {
  instance: string;
  /** `${token}:${id}` of the saved record the content is. */
  recordKey: string;
  /** Items the record holds (notes, highlights, comments, links). */
  count: number;
}

const entries = new Map<string, DockEntry>();
let openInstance: string | null = null;
const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  for (const l of [...listeners]) l();
}

export function subscribeDocks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Changes whenever anything in the store changes (useSyncExternalStore snapshot). */
export function docksVersion(): number {
  return version;
}

export function registerDock(instance: string, recordKey: string): () => void {
  entries.set(instance, { instance, recordKey, count: entries.get(instance)?.count ?? 0 });
  emit();
  return () => {
    entries.delete(instance);
    if (openInstance === instance) openInstance = null;
    emit();
  };
}

export function setDockCount(instance: string, count: number) {
  const entry = entries.get(instance);
  if (!entry || entry.count === count) return;
  entries.set(instance, { ...entry, count });
  emit();
}

export function isDockOpen(instance: string): boolean {
  return openInstance === instance;
}

export function openDock(instance: string) {
  if (openInstance === instance || !entries.has(instance)) return;
  openInstance = instance;
  emit();
}

export function closeDock(instance: string) {
  if (openInstance !== instance) return;
  openInstance = null;
  emit();
}

/** The newest mount of a record (a record can render in two places; the ⋯ acts on the latest). */
function latestFor(recordKey: string): DockEntry | null {
  let found: DockEntry | null = null;
  for (const e of entries.values()) if (e.recordKey === recordKey) found = e;
  return found;
}

/** What the ⋯ action shows for a record: null = no dock is mounted for it here. */
export function dockStateFor(recordKey: string): { count: number; open: boolean } | null {
  const entry = latestFor(recordKey);
  if (!entry) return null;
  return { count: entry.count, open: openInstance === entry.instance };
}

export function toggleDockFor(recordKey: string) {
  const entry = latestFor(recordKey);
  if (!entry) return;
  openInstance = openInstance === entry.instance ? null : entry.instance;
  emit();
}

/** Test seam. */
export function resetDocksForTest() {
  entries.clear();
  openInstance = null;
  emit();
}
