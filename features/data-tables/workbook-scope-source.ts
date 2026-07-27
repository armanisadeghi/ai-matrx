// features/data-tables/workbook-scope-source.ts
//
// Live bridge from the mounted `WorkbookEditor` to the `matrx-user/workbooks`
// surface emitter on `/workbooks/[id]`.
//
// Why a module slot rather than props: the page owns the workbook row and
// mounts `<SurfaceRuntimeProvider>`, but the sheets / snapshot / save status
// live inside the editor (Univer refs + local state), one level DOWN. Pushing
// them up as state would re-render the editor on every keystroke; a
// registered getter is read once, at Run time, when the user actually
// launches an agent.
//
// Exactly one editor is mounted at a time (one workbook per route), so a
// single slot keyed by workbookId is enough. The getter returns null when the
// editor has not booted — callers omit the values, they never fake them.

export interface WorkbookLiveScope {
  sheets: Array<{ id: string; name: string; index: number }>;
  activeSheetId: string | null;
  activeSheetName: string | null;
  snapshot: Record<string, unknown> | null;
  bootState: "booting" | "ready" | "load_error";
  loadError: string | null;
  saveStatus: string;
  collab: {
    enabled: boolean;
    is_host: boolean;
    self_uid: string;
    remote_peers: number;
  };
}

interface Registration {
  workbookId: string;
  read: () => WorkbookLiveScope | null;
}

let current: Registration | null = null;

/** Called by `WorkbookEditor` while mounted. Returns an unregister. */
export function registerWorkbookScopeSource(
  registration: Registration,
): () => void {
  current = registration;
  return () => {
    if (current === registration) current = null;
  };
}

/**
 * Read the live editor state for `workbookId`. Returns null when no editor is
 * mounted, when a different workbook is mounted, or when Univer has not
 * booted yet — never a fabricated shape.
 */
export function readWorkbookScopeSource(
  workbookId: string,
): WorkbookLiveScope | null {
  if (!current || current.workbookId !== workbookId) return null;
  return current.read();
}
