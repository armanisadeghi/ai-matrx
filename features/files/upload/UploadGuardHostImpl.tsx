/**
 * features/files/upload/UploadGuardHostImpl.tsx
 *
 * The actual React host that wires `requestUpload(arg)` →
 * pre-flight duplicate scan → optional confirmation dialog →
 * `uploadFiles` thunk dispatch with the user's per-file decisions
 * applied.
 *
 * Mounted exactly once at the app level (via `<UploadGuardHost/>`),
 * lazy-loaded by `next/dynamic({ ssr: false })`. Until it mounts,
 * `requestUpload` falls back to a plain dispatch with no dedupe so
 * boot-time uploads (rare) still work.
 *
 * Pipeline per call:
 *   1. Hash every input file with SHA-256 (in parallel, bounded).
 *   2. Scan against Redux `filesById` for content / name conflicts in
 *      the target folder.
 *   3. If any conflicts → mount the dialog, await the user's choices.
 *   4. Translate decisions into `filenameOverrides` + `skipIndices`
 *      and dispatch `uploadFiles`.
 *   5. Resolve the original `requestUpload(...)` promise with the
 *      result.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllFilesMap } from "@/features/files/redux/selectors";
import { uploadFiles as uploadFilesThunk } from "@/features/files/redux/thunks";
import {
  computeSHA256Batch,
} from "@/features/files/utils/checksum";
import {
  scanForDuplicates,
  type DuplicateMatch,
} from "@/features/files/utils/upload-duplicate-detect";
import {
  DuplicateUploadDialog,
  type DuplicateConflictRow,
  type ResolvedDecision,
} from "@/features/files/components/core/DuplicateUploadDialog/DuplicateUploadDialog";
import {
  registerUploadGuardHandler,
  unregisterUploadGuardHandler,
  type UploadGuardHandler,
  type UploadGuardResult,
} from "./uploadGuardOpeners";
import type { UploadFilesArg } from "@/features/files/types";

// ---------------------------------------------------------------------------
// Internal pending-resolution state
// ---------------------------------------------------------------------------

interface PendingResolution {
  /** The original arg the caller passed. */
  arg: UploadFilesArg;
  /** Conflicts surfaced to the user — resolved decisions key into this. */
  conflicts: ResolvedConflict[];
  /** Resolves the requestUpload promise. */
  resolve: (result: UploadGuardResult) => void;
}

interface ResolvedConflict {
  /** Stable id used by the dialog. We use the original index. */
  id: string;
  /** Index into `arg.files`. */
  index: number;
  file: File;
  match: DuplicateMatch;
}

export default function UploadGuardHostImpl() {
  const dispatch = useAppDispatch();
  const filesById = useAppSelector(selectAllFilesMap);

  // The pending resolution drives whether the dialog is open + what
  // it shows. Stored in a ref alongside state so the handler closure
  // can reach it without re-creating itself when state changes.
  const [pending, setPending] = useState<PendingResolution | null>(null);
  const pendingRef = useRef<PendingResolution | null>(null);
  pendingRef.current = pending;

  // Keep the latest filesById in a ref so the handler's pre-flight
  // scan reads the current map without forcing the handler to be
  // re-registered on every Redux change.
  const filesByIdRef = useRef(filesById);
  filesByIdRef.current = filesById;

  // Run an upload directly through the thunk and return a normalised
  // result. Shared between the no-conflict fast path and the
  // post-dialog "user confirmed" path.
  const runUpload = useCallback(
    async (
      arg: UploadFilesArg,
      aliased: Array<{ inputIndex: number; existingFileId: string }> = [],
    ): Promise<UploadGuardResult> => {
      try {
        const result = await dispatch(uploadFilesThunk(arg)).unwrap();
        return { ...result, cancelled: false, aliased };
      } catch (err) {
        return {
          uploaded: [],
          failed: arg.files.map((f) => ({
            name: f.name,
            error: err instanceof Error ? err.message : String(err),
          })),
          cancelled: false,
          aliased,
        };
      }
    },
    [dispatch],
  );

  // ── The actual handler `requestUpload` calls ─────────────────────
  const handler = useCallback<UploadGuardHandler>(
    async (arg) => {
      // Hash all files in parallel, bounded concurrency. Failures
      // produce `null` and effectively skip the dedupe check for
      // that file — the upload proceeds normally.
      const checksums = await computeSHA256Batch(arg.files);

      const scanResult = scanForDuplicates({
        files: arg.files.map((file, i) => ({
          file,
          checksum: checksums[i] ?? null,
        })),
        parentFolderId: arg.parentFolderId ?? null,
        filesById: filesByIdRef.current,
      });

      // Fast path — no conflicts. Just dispatch and resolve.
      if (scanResult.conflictCount === 0) {
        return runUpload(arg);
      }

      // Slow path — show the dialog and wait for the user's choices.
      const conflicts: ResolvedConflict[] = [];
      scanResult.matches.forEach((m, index) => {
        if (m) {
          conflicts.push({
            id: `${index}`,
            index,
            file: arg.files[index]!,
            match: m,
          });
        }
      });

      return new Promise<UploadGuardResult>((resolve) => {
        setPending({ arg, conflicts, resolve });
      });
    },
    [runUpload],
  );

  // Register on mount; unregister on unmount. Re-runs only if the
  // handler's identity changes (it changes when `runUpload` does,
  // which only changes when `dispatch` does — i.e. never).
  useEffect(() => {
    registerUploadGuardHandler(handler);
    return () => unregisterUploadGuardHandler(handler);
  }, [handler]);

  // ── Dialog callbacks ─────────────────────────────────────────────

  const handleResolve = useCallback(
    async (decisions: ResolvedDecision[]) => {
      const cur = pendingRef.current;
      if (!cur) return;
      // Translate decisions into thunk overrides + aliased-file mapping.
      const filenameOverrides: Record<number, string> = {};
      const skipIndices: number[] = [];
      const aliased: Array<{ inputIndex: number; existingFileId: string }> =
        [];
      const decisionById = new Map(decisions.map((d) => [d.id, d.action]));
      for (const c of cur.conflicts) {
        const action = decisionById.get(c.id) ?? "skip";
        if (action === "use_existing") {
          // The user confirmed the existing file IS what they meant.
          // Don't re-upload; surface the existing id back to the caller
          // so they can wire it into the parent context (chat attach,
          // agent resource, etc.). Follow the duplicate_of_file_id
          // chain so consolidation-killed dup ids resolve to the live
          // keeper.
          const liveId =
            c.match.existing.duplicateOfFileId ?? c.match.existing.id;
          aliased.push({ inputIndex: c.index, existingFileId: liveId });
          skipIndices.push(c.index);
        } else if (action === "skip") {
          skipIndices.push(c.index);
        } else if (action === "overwrite") {
          // Overwrite — upload to the EXISTING file's exact name so
          // the backend version-bumps in place.
          filenameOverrides[c.index] = c.match.existing.fileName;
        }
        // "copy" — leave entry untouched; the thunk's auto " (1)"
        // rename takes care of the unique name. The future BE flip
        // will additionally stamp `intent: "force_new_copy"` here.
      }

      // Close the dialog before awaiting the upload so the UI
      // immediately moves on to upload-progress UI.
      setPending(null);

      const finalArg: UploadFilesArg = {
        ...cur.arg,
        filenameOverrides: {
          ...(cur.arg.filenameOverrides ?? {}),
          ...filenameOverrides,
        },
        skipIndices: [...(cur.arg.skipIndices ?? []), ...skipIndices],
      };

      // If every file was skipped or aliased there's nothing to
      // dispatch — return the aliased list so the caller can still
      // wire the existing files into their parent context.
      if (skipIndices.length === cur.arg.files.length) {
        cur.resolve({
          uploaded: [],
          failed: [],
          cancelled: false,
          aliased,
        });
        return;
      }

      const result = await runUpload(finalArg, aliased);
      cur.resolve(result);
    },
    [runUpload],
  );

  const handleCancel = useCallback(() => {
    const cur = pendingRef.current;
    if (!cur) return;
    setPending(null);
    cur.resolve({
      uploaded: [],
      failed: [],
      cancelled: true,
      aliased: [],
    });
  }, []);

  // ── Render the dialog when there's a pending resolution ──────────
  return (
    <DuplicateUploadDialog
      open={!!pending}
      conflicts={
        pending?.conflicts.map<DuplicateConflictRow>((c) => ({
          id: c.id,
          file: c.file,
          match: c.match,
        })) ?? []
      }
      onResolve={handleResolve}
      onCancel={handleCancel}
    />
  );
}
