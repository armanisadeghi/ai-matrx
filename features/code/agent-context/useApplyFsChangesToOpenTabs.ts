"use client";

/**
 * useApplyFsChangesToOpenTabs
 *
 * Bridges the global `fsChangesSlice` ring buffer into the live editor UI.
 *
 * What it does on every newly-arrived `RESOURCE_CHANGED` event whose
 * `sandbox_id` matches the currently-mounted sandbox filesystem:
 *
 *   - kind === "fs.file":
 *       - For every open tab whose `path` equals `resource_id`:
 *           - clean tab → re-fetch via the active filesystem adapter and
 *             call `replaceTabContent` (the same path the conflict-toast
 *             reload uses, so pristineContent + dirty flag stay coherent).
 *           - dirty tab → surface a conflict toast with the same
 *             "Reload / Keep mine / Show diff" affordance pattern as the
 *             Supabase-row realtime conflict toast.
 *           - action === "deleted" → close the tab; warn the user.
 *           - action === "moved" or "renamed" → if `metadata.previous_id`
 *             matches an open tab, mark it stale and close — there's no
 *             "rename in place" reducer today and the user can reopen
 *             from the explorer.
 *   - kind === "fs.directory" / `action === "invalidated"`:
 *       - Pure cache hint at this layer; the explorer's lazy refresh
 *         already picks listings up on next render. We log the entry but
 *         don't fan out per-file refresh — the per-file events handle
 *         the surface that actually matters for the editor.
 *   - Unknown kinds:
 *       - Logged + ignored (forward-compat with `cld_files`, `cache.*`,
 *         `sandbox.cwd`, etc).
 *
 * Bucket scoping:
 *   The hook subscribes to the bucket keyed by the active sandbox id (or
 *   GLOBAL_BUCKET_KEY for cloud-mode events). Mounting on a non-sandbox
 *   filesystem still listens on the global bucket so cloud-only kinds
 *   (later) can reuse the same plumbing.
 *
 * Dedup contract:
 *   We track the highest `seq` we've handled per bucket via a ref so the
 *   hook never re-runs on the same event after a re-render or a remount.
 *   When the bucket flips (sandbox switch), the cursor resets to the
 *   bucket's current head — we never replay history, only events that
 *   arrive after we mount.
 *
 * Pure consumer — does NOT mutate the slice. Acceptance + acknowledgment
 * happen via `acknowledgeFsChange` after the consumer has dealt with the
 * change, so subsequent renders don't keep firing on the same row.
 */

import { useEffect, useMemo, useRef } from "react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { useCodeWorkspace } from "../CodeWorkspaceProvider";
import {
  selectActiveSandboxId,
  selectEditorMode,
} from "../redux/codeWorkspaceSlice";
import {
  acknowledgeFsChange,
  GLOBAL_BUCKET_KEY,
  selectFsChangesBucket,
  type FsChange,
} from "../redux/fsChangesSlice";
import {
  closeTab,
  replaceTabContent,
  selectCodeTabs,
} from "../redux/tabsSlice";
import { extractErrorMessage } from "@/utils/errors";
import type { EditorFile } from "../types";

interface UseApplyFsChangesOptions {
  /**
   * Override the bucket the hook subscribes to. By default the hook uses
   * the active sandbox id (so a sandbox-scoped editor sees only its own
   * events). Pass `GLOBAL_BUCKET_KEY` to react to non-sandbox events.
   */
  bucketKey?: string;
  /**
   * When `true`, suppress all toasts from this hook. Used by tests and by
   * the offline replay panel which dispatches synthetic events.
   */
  silent?: boolean;
}

/**
 * Find every open tab whose absolute `path` matches `resourceId`. The tab
 * id (`${filesystem.id}:${path}`) is NOT used here because the same path
 * can be opened against multiple adapters and the agent's event only
 * ships the path — sandbox-id filtering at the bucket layer is what ties
 * the change to the right adapter.
 */
function findTabsForPath(
  byId: Record<string, EditorFile>,
  resourceId: string,
  adapterId: string | null,
): EditorFile[] {
  const matches: EditorFile[] = [];
  for (const tabId of Object.keys(byId)) {
    const tab = byId[tabId];
    if (tab.path !== resourceId) continue;
    // When we know the active adapter id, scope to tabs that originated
    // from it. Tabs from other adapters (e.g. a stale cloud-files tab
    // happening to share the same path) are intentionally ignored.
    if (adapterId && !tab.id.startsWith(`${adapterId}:`)) continue;
    matches.push(tab);
  }
  return matches;
}

export function useApplyFsChangesToOpenTabs(
  opts: UseApplyFsChangesOptions = {},
): void {
  const { silent = false } = opts;
  const dispatch = useAppDispatch();
  const store = useAppStore();
  const { filesystem } = useCodeWorkspace();

  const editorMode = useAppSelector(selectEditorMode);
  const activeSandboxId = useAppSelector(selectActiveSandboxId);

  // Bucket selection: explicit override first, then sandbox bucket (when
  // we have one), else fall back to the global bucket so cloud-mode
  // events still fan in. The bucket key is a single primitive so the
  // selector identity below stays stable across re-renders.
  const bucketKey =
    opts.bucketKey ??
    (editorMode === "sandbox" && activeSandboxId
      ? activeSandboxId
      : GLOBAL_BUCKET_KEY);

  // Subscribe to a single primitive — the highest `seq` on the bucket's
  // ring. When this advances, fresh events arrived; the effect below
  // pulls the actual rows from `store.getState()` and walks them.
  // Returning a primitive (number) — not `{ length, lastSeq }` — keeps
  // React-Redux's `inputStabilityCheck` happy and skips a layer of
  // shallowEqual bookkeeping. See `.claude/skills/redux-selector-rules`
  // → Rule 6.
  const lastSeq = useAppSelector((state) => {
    const bucket = selectFsChangesBucket(state, bucketKey);
    const tail = bucket.ring[bucket.ring.length - 1];
    return tail ? tail.seq : 0;
  });

  // Cursor — the highest `seq` we've already processed for this bucket.
  // Initialized lazily on first run so the hook never replays history.
  const cursorRef = useRef<{ bucketKey: string; seq: number } | null>(null);

  // Reset the cursor whenever the bucket flips (e.g. user switches
  // sandboxes or disconnects). We seed it with the current head so we
  // don't replay events that arrived before the surface mounted.
  useEffect(() => {
    const state = store.getState();
    const bucket = selectFsChangesBucket(state, bucketKey);
    const head = bucket.ring[bucket.ring.length - 1];
    cursorRef.current = { bucketKey, seq: head?.seq ?? 0 };
  }, [bucketKey, store]);

  // Stable adapter id captured per render — read directly from the
  // workspace context so we don't have to mirror it through state.
  const adapterId = filesystem.id;

  useEffect(() => {
    if (lastSeq === 0) return;
    const cursor = cursorRef.current;
    if (!cursor || cursor.bucketKey !== bucketKey) return;
    if (lastSeq <= cursor.seq) return;

    const state = store.getState();
    const bucket = selectFsChangesBucket(state, bucketKey);
    if (bucket.ring.length === 0) return;

    // Walk the ring from oldest unhandled → newest. We snapshot the
    // bucket up front; new events arriving during processing will be
    // picked up on the next render via the cursor advance below.
    const fresh: FsChange[] = bucket.ring.filter((c) => c.seq > cursor.seq);
    if (fresh.length === 0) return;

    const tabs = selectCodeTabs(state);

    // Coalesce per-resource so that an agent that writes the same file
    // 50 times in one turn produces ONE refresh per resource id, not 50.
    // The most-recent action wins (e.g. created → modified → deleted
    // collapses to "deleted").
    const byResource = new Map<string, FsChange>();
    for (const c of fresh) {
      byResource.set(c.resourceId, c);
    }

    let handledCount = 0;
    let conflictCount = 0;

    for (const change of byResource.values()) {
      if (change.kind === "fs.directory") {
        // Directory invalidations are handled by the explorer's lazy
        // refresh path; nothing to do here for open tabs unless a child
        // file event also fires (matrx-ai emits one per file).
        continue;
      }
      if (change.kind !== "fs.file") {
        // Forward-compat: log unknown kinds but never crash.
        if (!silent) {
          // Soft hint to ourselves that a future kind landed here
          // without first-class wiring. Console-level so it doesn't
          // spam the UI.
          // eslint-disable-next-line no-console
          console.debug("[fsChanges] ignoring non-fs.file kind", change.kind);
        }
        continue;
      }

      const matches = findTabsForPath(tabs.byId, change.resourceId, adapterId);
      const previousMatches =
        change.action === "moved" || change.action === "renamed"
          ? findTabsForPath(
              tabs.byId,
              (change.metadata?.previous_id as string | undefined) ??
                change.resourceId,
              adapterId,
            )
          : [];

      // ── Deletion ────────────────────────────────────────────────
      if (change.action === "deleted") {
        for (const tab of matches) {
          dispatch(closeTab(tab.id));
          if (!silent) {
            toast.warning(`"${tab.name}" was deleted`, {
              description: tab.dirty
                ? "Your unsaved local edits were discarded with the tab. Re-create the file from the explorer if you need to keep them."
                : "The file was removed by the agent. Reopen from the explorer if it comes back.",
            });
          }
        }
        handledCount += matches.length;
        dispatch(
          acknowledgeFsChange({
            bucketKey,
            resourceId: change.resourceId,
          }),
        );
        continue;
      }

      // ── Move / rename ───────────────────────────────────────────
      if (change.action === "moved" || change.action === "renamed") {
        // We don't support in-place rename in the tab slice today —
        // closing the old tab is safer than carrying a stale `path`
        // that no longer reads. The user reopens from the explorer.
        for (const tab of previousMatches) {
          dispatch(closeTab(tab.id));
          if (!silent) {
            toast.info(`"${tab.name}" was renamed`, {
              description: `Now at ${change.resourceId}. Reopen from the explorer to continue editing.`,
            });
          }
        }
        handledCount += previousMatches.length;
        dispatch(
          acknowledgeFsChange({ bucketKey, resourceId: change.resourceId }),
        );
        continue;
      }

      // ── Created / modified / invalidated ────────────────────────
      // Same handling: re-read the file, replace the buffer if clean,
      // surface a conflict toast if dirty.
      if (matches.length === 0) {
        // Nothing open right now — the file-tree badge layer (a future
        // hook) will cover unopened files. Leave the lookup row in
        // place so badges + debug surfaces can still see the change.
        continue;
      }

      for (const tab of matches) {
        if (tab.dirty) {
          conflictCount++;
          if (!silent) {
            toast.warning(`"${tab.name}" was modified by the agent`, {
              description:
                "You have unsaved local edits. Reload to take theirs (your changes go to the clipboard) or keep typing to overwrite on save.",
              duration: 15000,
              action: {
                label: "Reload",
                onClick: () => {
                  void reloadIntoTab(tab, change.resourceId);
                },
              },
              cancel: {
                label: "Keep mine",
                onClick: () => {
                  // No-op — leaving the buffer intact and the next save
                  // surfaces the existing remote-conflict toast which
                  // already supports overwrite.
                },
              },
            });
          }
          continue;
        }

        // Clean tab → re-fetch and swap.
        void reloadIntoTab(tab, change.resourceId);
        handledCount++;
      }

      dispatch(
        acknowledgeFsChange({ bucketKey, resourceId: change.resourceId }),
      );
    }

    cursorRef.current = { bucketKey, seq: lastSeq };

    // Tiny aggregate toast when an agent edits many open files at once —
    // suppresses N individual successes from drowning the user.
    if (!silent && handledCount > 1 && conflictCount === 0) {
      toast.success(`Refreshed ${handledCount} open files from the agent.`);
    }

    async function reloadIntoTab(tab: EditorFile, path: string) {
      try {
        const previous = tab.content;
        const next = await filesystem.readFile(path);
        dispatch(
          replaceTabContent({
            id: tab.id,
            content: next,
          }),
        );
        if (
          tab.dirty &&
          previous &&
          typeof navigator !== "undefined" &&
          navigator.clipboard
        ) {
          // Best-effort — clipboard write may be denied silently. The
          // user still has the new content on screen; this just rescues
          // their work-in-progress.
          void navigator.clipboard.writeText(previous).catch(() => {});
        }
      } catch (err) {
        if (!silent) {
          toast.error(`Failed to refresh "${tab.name}"`, {
            description: extractErrorMessage(err),
          });
        }
      }
    }
  }, [bucketKey, lastSeq, adapterId, dispatch, store, filesystem, silent]);

  // Stable return — no value, this hook's only job is the side effect.
  return useMemo(() => undefined, []) as void;
}
