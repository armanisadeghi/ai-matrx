// features/rich-document/annotations/record-annotations-store.ts
//
// Which Notes & comments dock is open, app-wide. Every <RecordAnnotations>
// mount (a note, a chat answer, a saved document in the studio preview)
// registers here with its record key and how many items it holds; at most ONE
// dock is open at a time (Google Docs: one comment rail), so opening another
// record's dock closes the first. The rich-document "Notes & comments" action
// (⋯ menu) reads and toggles it by record key. On desktop an open dock is the
// record's `comment-thread` canvas tab (canvas/commentThreadKind.ts).

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
/** Told when the PERSON closes a dock (its close button, the ⋯ toggle) — not when another record's dock takes over. */
const closeListeners = new Map<string, Set<() => void>>();

function closedByPerson(instance: string) {
  for (const l of [...(closeListeners.get(instance) ?? [])]) l();
}

/** The dock's host hears the person close it (the canvas tab it shows in closes with it). */
export function onDockClosedByPerson(instance: string, listener: () => void): () => void {
  const set = closeListeners.get(instance) ?? new Set();
  set.add(listener);
  closeListeners.set(instance, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) closeListeners.delete(instance);
  };
}
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
  closedByPerson(instance);
}

/** Opens the newest mount of a record's dock; false when the record is not rendered here. */
export function openDockFor(recordKey: string): boolean {
  const entry = latestFor(recordKey);
  if (!entry) return false;
  openDock(entry.instance);
  return true;
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
  const closing = openInstance === entry.instance;
  openInstance = closing ? null : entry.instance;
  emit();
  if (closing) closedByPerson(entry.instance);
}

/** Test seam. */
export function resetDocksForTest() {
  entries.clear();
  closeListeners.clear();
  openInstance = null;
  emit();
}
