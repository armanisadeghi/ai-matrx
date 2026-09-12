import { createSelector } from "@reduxjs/toolkit";
import type { RootState } from "@/lib/redux/store";
import { selectCodeTabs, selectRecentTabIds } from "../redux/tabsSlice";
import {
  selectAllDiagnostics,
  type EditorDiagnostic,
} from "../redux/diagnosticsSlice";
import type { EditorFile } from "../types";
import { isPreviewTab } from "../types";
import { tabToFileIdentity } from "../utils/fileIdentity";

/**
 * Editor → Agent Context Bridge
 *
 * Wire format consumed by the Python agent's `ctx_get` primitive. Each open
 * editor tab contributes a row to the summary entry, plus the **active tab
 * only** ships its full content payload. Non-active text tabs are listed as
 * metadata so the agent knows what's open and can opt-in via tools.
 *
 *   editor.tabs              — { tabs: [{ id, path, language, dirty }, …], activeId }
 *   editor.activeFile        — { id, path, name, language, dirty } | null
 *   editor.tab.<activeId>    — { id, path, name, language, content, dirty,
 *                                pristineContent, remoteUpdatedAt? }
 *   editor.recentFiles       — [{ id, path, name, language }] — MRU stack,
 *                              dropped down to last RECENT_FILES_CAP entries.
 *   editor.selection.<id>    — { id, path, language, selection: { startLine,
 *                                endLine, startColumn, endColumn }, text }
 *
 * What this DOES NOT advertise (intentionally — would bloat context and
 * is the wrong layer to own these claims):
 *   - Workspace root / cwd / any path claim. Authoritative answers come
 *     from the server-side fs/shell tools (e.g. `shell_execute pwd`).
 *   - Tool names / availability. Lives on the agent's tool descriptors
 *     and matrx-ai's registry — duplicating it here risked drift.
 *
 * The summary stays compact (no buffer content) so an agent can do
 * `ctx_get("editor.tabs")` to see what's open without dragging buffers
 * through the prompt; it then reads any non-active file via its
 * fs_read tool.
 */

export const EDITOR_TABS_KEY = "editor.tabs";
export const EDITOR_ACTIVE_FILE_KEY = "editor.activeFile";
export const EDITOR_RECENT_FILES_KEY = "editor.recentFiles";
export const EDITOR_DIAGNOSTICS_KEY = "editor.diagnostics";
export const editorTabKey = (tabId: string) => `editor.tab.${tabId}`;
export const editorSelectionKey = (tabId: string) =>
  `editor.selection.${tabId}`;

export interface EditorTabsSummary {
  tabs: Array<{
    identity: ReturnType<typeof tabToFileIdentity>;
    readOnly: boolean;
    id: string;
    path: string;
    name: string;
    language: string;
    dirty: boolean;
  }>;
  activeId: string | null;
}

export interface EditorTabContextValue {
  identity: ReturnType<typeof tabToFileIdentity>;
  readOnly: boolean;
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  pristineContent: string;
  dirty: boolean;
  remoteUpdatedAt?: string;
}

export interface EditorActiveFileValue {
  identity: ReturnType<typeof tabToFileIdentity>;
  readOnly: boolean;
  id: string;
  path: string;
  name: string;
  language: string;
  dirty: boolean;
}

export interface EditorRecentFileValue {
  id: string;
  path: string;
  name: string;
  language: string;
  /** True when the file is still open in a tab; false if it was closed
   *  but stayed in the MRU stack. */
  open: boolean;
}

/**
 * Diagnostics payload — one entry per Monaco marker for the **active tab
 * only**, plus a top-level summary so an agent doesn't have to re-count.
 *
 * Mirrors `EditorDiagnostic[]` from `diagnosticsSlice` with a small
 * counts header so the agent can see "5 errors, 12 warnings" without
 * scanning the list.
 */
export interface EditorDiagnosticsValue {
  tabId: string | null;
  counts: {
    error: number;
    warning: number;
    info: number;
    hint: number;
    total: number;
  };
  diagnostics: EditorDiagnostic[];
}

export interface EditorContextEntryInput {
  key: string;
  value: unknown;
  label: string;
  type: "json" | "text";
}

function summarizeTab(tab: EditorFile) {
  return {
    id: tab.id,
    path: tab.path,
    name: tab.name,
    language: tab.language,
    dirty: !!tab.dirty,
    identity: tabToFileIdentity(tab),
    readOnly: !!tab.readOnly || isPreviewTab(tab.kind),
  };
}

export function tabPayload(tab: EditorFile): EditorTabContextValue {
  return {
    id: tab.id,
    path: tab.path,
    name: tab.name,
    language: tab.language,
    content: tab.content,
    pristineContent: tab.pristineContent,
    dirty: !!tab.dirty,
    remoteUpdatedAt: tab.remoteUpdatedAt,
    identity: tabToFileIdentity(tab),
    readOnly: !!tab.readOnly,
  };
}

/**
 * Selector that builds the full editor-context entry list for the current
 * open tabs + workspace. Re-runs only when its inputs change references —
 * which is roughly: tab opens/closes, content edits (debounced upstream),
 * tab activation, MRU touches, or filesystem swap.
 *
 * Per the agreed strategy:
 *   - **Active tab** ships full content via `editor.tab.<id>`.
 *   - **Non-active tabs** are listed in `editor.tabs` as metadata only.
 *     The agent reads them on demand via its filesystem tools (sandbox
 *     mode) or via Python-side fetch (cloud mode).
 *   - **Binary previews** never carry content and never appear as a
 *     `editor.tab.<id>` entry; they still show up in the summary so the
 *     agent knows which images/PDFs the user has on screen.
 */
export const selectEditorContextEntries = createSelector(
  [selectCodeTabs, selectRecentTabIds, selectAllDiagnostics],
  (tabsState, recentTabIds, diagnosticsByTabId): EditorContextEntryInput[] => {
    const entries: EditorContextEntryInput[] = [];
    const allTabs = tabsState.order
      .map((id) => tabsState.byId[id])
      .filter((tab): tab is EditorFile => Boolean(tab));
    const activeTab = tabsState.activeId
      ? tabsState.byId[tabsState.activeId]
      : null;

    // ── editor.tabs (summary, all open tabs incl. binary) ──────────────────
    const summary: EditorTabsSummary = {
      tabs: allTabs.map(summarizeTab),
      activeId: tabsState.activeId,
    };
    // Skip when nothing is open. An empty `editor.tabs` entry just clutters
    // the agent's "Available Context" manifest with a key that resolves to
    // {tabs: [], activeId: null} — it answers no question the agent has.
    if (allTabs.length > 0) {
      entries.push({
        key: EDITOR_TABS_KEY,
        value: summary,
        label: "Open editor tabs",
        type: "json",
      });
    }

    // ── editor.activeFile (lightweight, no content) ────────────────────────
    // Same reasoning — skip when no tab is active. The agent can `ctx_get`
    // the key explicitly if it really wants to confirm "nothing open".
    if (activeTab) {
      entries.push({
        key: EDITOR_ACTIVE_FILE_KEY,
        value: summarizeTab(activeTab) satisfies EditorActiveFileValue,
        label: "Active editor file",
        type: "json",
      });
    }

    // ── editor.tab.<active> (full content, ACTIVE ONLY) ────────────────────
    // Other text tabs deliberately do NOT carry content — see header.
    // Preview tabs (binary / cloud-file) have no editable buffer.
    if (activeTab && !isPreviewTab(activeTab.kind)) {
      entries.push({
        key: editorTabKey(activeTab.id),
        value: tabPayload(activeTab),
        label: `Editor: ${activeTab.name}`,
        type: "json",
      });
    }

    // ── editor.diagnostics (active tab only, with a counts header) ─────────
    // Skip entirely when there's no active tab OR when the active tab has
    // zero diagnostics — an empty list is the default and just clutters
    // the manifest. The agent can still `ctx_get` the key to confirm.
    if (activeTab) {
      const activeDiagnostics = diagnosticsByTabId[activeTab.id] ?? [];
      if (activeDiagnostics.length > 0) {
        const counts = activeDiagnostics.reduce(
          (acc, d) => {
            acc[d.severity] += 1;
            acc.total += 1;
            return acc;
          },
          { error: 0, warning: 0, info: 0, hint: 0, total: 0 },
        );
        entries.push({
          key: EDITOR_DIAGNOSTICS_KEY,
          value: {
            tabId: activeTab.id,
            counts,
            diagnostics: activeDiagnostics,
          } satisfies EditorDiagnosticsValue,
          label: "Editor diagnostics",
          type: "json",
        });
      }
    }

    // ── editor.recentFiles (MRU, metadata only) ────────────────────────────
    const recentFiles: EditorRecentFileValue[] = recentTabIds
      .map((id) => {
        const tab = tabsState.byId[id];
        if (!tab) {
          // Tab was closed since it was last touched. We still surface it
          // so the agent knows the user was looking at it recently — but
          // we can only resolve metadata that lives in the id. The id
          // shape is `<filesystemId>:<path>`; split once and fall back to
          // the basename for `name`.
          // Adapter IDs may themselves contain colons (sandbox:<uuid>).
          // Only recover an actual absolute path; a closed Library UUID
          // cannot tell us its former display path and must not masquerade as one.
          const colon = id.indexOf(":/");
          const path = colon === -1 ? "" : id.slice(colon + 1);
          const name = path.split("/").pop() ?? path;
          return {
            id,
            path,
            name,
            language: "plaintext",
            open: false,
          } satisfies EditorRecentFileValue;
        }
        return {
          id: tab.id,
          path: tab.path,
          name: tab.name,
          language: tab.language,
          open: true,
        } satisfies EditorRecentFileValue;
      })
      .filter((f) => Boolean(f.path));
    if (recentFiles.length > 0) {
      entries.push({
        key: EDITOR_RECENT_FILES_KEY,
        value: recentFiles,
        label: "Recently opened files",
        type: "json",
      });
    }

    // No workspace.root / .source / .tools here — those used to advertise
    // FE-side filesystem state and a hardcoded list of "available tools" to
    // the agent. Both bloated context and risked drift: workspace.root
    // didn't always match the cwd the server-side fs/shell tools actually
    // use (matrx-ai's scoped_base_for adds per-user-project nesting that
    // the FE had no view of), and workspace.tools advertised tool names
    // that diverged from matrx-ai's actual registry. The agent learns the
    // real workspace by calling its tools (`shell_execute pwd`, `fs_list /home/agent`)
    // and learns the real tool surface from the agent definition's tool
    // descriptors. Don't add either back without a strong reason.

    return entries;
  },
);

/**
 * Build the entry list filtered by an opt-out set of disabled tab ids,
 * which are stored on the active conversation's instanceUIState.
 *
 * Used by `useSyncEditorContext` after reading the disabled set from Redux
 * so the user's per-conversation include/exclude toggles take effect on
 * the next dispatch. File metadata, buffers, recent entries and diagnostics
 * all honor the exclusion; unrelated context is preserved.
 */
export function filterDisabledTabs(
  entries: EditorContextEntryInput[],
  disabledIds: string[] | undefined,
): EditorContextEntryInput[] {
  if (!disabledIds || disabledIds.length === 0) return entries;
  const disabled = new Set(disabledIds);
  const out: EditorContextEntryInput[] = [];
  for (const entry of entries) {
    if (entry.key === EDITOR_TABS_KEY) {
      const summary = entry.value as EditorTabsSummary;
      out.push({
        ...entry,
        value: {
          ...summary,
          tabs: summary.tabs.filter((t) => !disabled.has(t.id)),
          activeId:
            summary.activeId && disabled.has(summary.activeId)
              ? null
              : summary.activeId,
        },
      });
      continue;
    }
    if (entry.key === EDITOR_RECENT_FILES_KEY) {
      out.push({
        ...entry,
        value: (entry.value as EditorRecentFileValue[]).filter(
          (file) => !disabled.has(file.id),
        ),
      });
      continue;
    }
    if (entry.key.startsWith("editor.selection.")) {
      if (disabled.has(entry.key.slice("editor.selection.".length))) continue;
    }
    if (entry.key === EDITOR_ACTIVE_FILE_KEY) {
      const active = entry.value as EditorActiveFileValue | null;
      if (active && disabled.has(active.id)) {
        out.push({ ...entry, value: null });
        continue;
      }
    }
    if (entry.key === EDITOR_DIAGNOSTICS_KEY) {
      const value = entry.value as EditorDiagnosticsValue;
      if (value.tabId && disabled.has(value.tabId)) {
        out.push({
          ...entry,
          value: {
            tabId: null,
            counts: { error: 0, warning: 0, info: 0, hint: 0, total: 0 },
            diagnostics: [],
          } satisfies EditorDiagnosticsValue,
        });
        continue;
      }
    }
    if (entry.key.startsWith("editor.tab.")) {
      const id = entry.key.slice("editor.tab.".length);
      if (disabled.has(id)) continue;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Convenience root-state accessor for tests / non-React callers.
 */
export function getEditorContextEntries(
  state: RootState,
): EditorContextEntryInput[] {
  return selectEditorContextEntries(state);
}
