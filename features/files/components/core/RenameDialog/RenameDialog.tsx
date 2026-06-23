/**
 * features/files/components/core/RenameDialog/RenameDialog.tsx
 *
 * Single rename dialog used for both files and folders. Pre-selects the name
 * (without extension for files) so the user can immediately type a replacement.
 */

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ProInput } from "@/components/official/ProInput";
import { extractErrorMessage } from "@/utils/errors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import {
  renameFile as renameFileThunk,
  updateFolder as updateFolderThunk,
} from "@/features/files/redux/thunks";
import {
  selectAllFilesMap,
  selectAllFoldersMap,
  selectFileById,
  selectFolderById,
} from "@/features/files/redux/selectors";

export type RenameKind = "file" | "folder";

export interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: RenameKind;
  resourceId: string;
  currentName: string;
}

export interface ValidateRenameOptions {
  /**
   * Names of sibling files/folders in the same parent. The new name is
   * rejected if it matches any of these (case-insensitive). Pass `[]`
   * if the caller doesn't have sibling info — the validation simply
   * skips collision detection in that case (server-side enforcement
   * remains the source of truth).
   */
  siblingNames?: string[];
  /**
   * "file" — enforces extension shape rules ("data." / "data" with
   * dropped extension are rejected when the original had one).
   * "folder" — skips extension rules.
   */
  kind?: RenameKind;
  /** The original extension when `kind === "file"`. */
  originalExt?: string;
}

/**
 * Validate a rename target. Catches the common ways a user can shoot
 * themselves in the foot:
 *   - empty / whitespace-only
 *   - reserved or control characters (`/`, `\`, NUL, control chars)
 *   - same name as before
 *   - dropped or malformed extension on a file
 *   - collision with an existing sibling in the same folder
 *
 * Returns a stable error code in addition to the human-readable
 * message so callers can surface tooltips or inline hints contextually.
 */
export function validateRenameInput(
  raw: string,
  currentName: string,
  options: ValidateRenameOptions = {},
):
  | { ok: true; value: string }
  | {
      ok: false;
      code:
        | "empty"
        | "reserved_chars"
        | "control_chars"
        | "unchanged"
        | "trailing_dot"
        | "dropped_extension"
        | "extension_changed_to_invalid"
        | "sibling_collision";
      error: string;
    } {
  const value = raw.trim();
  if (!value) return { ok: false, code: "empty", error: "Name cannot be empty." };
  if (/[/\\]/.test(value))
    return {
      ok: false,
      code: "reserved_chars",
      error: "Name cannot contain '/' or '\\'.",
    };
  // Reject NUL + ASCII control characters. These can be paste-injected
  // accidentally and confuse downstream filesystems / object stores.
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(value))
    return {
      ok: false,
      code: "control_chars",
      error: "Name cannot contain control characters.",
    };
  if (value === currentName)
    return {
      ok: false,
      code: "unchanged",
      error: "New name is the same as the current name.",
    };
  if (value.endsWith("."))
    return {
      ok: false,
      code: "trailing_dot",
      error: "Name cannot end with '.'.",
    };

  // File-only extension rules. If the original had an extension and the
  // user's new name has lost it (or has a malformed one like "."), block
  // — this catches the foot-gun where typing into the extension field
  // and then deleting it silently changes the file's type.
  if (options.kind === "file" && options.originalExt) {
    const lastDot = value.lastIndexOf(".");
    const newExt = lastDot <= 0 ? "" : value.slice(lastDot);
    if (!newExt) {
      return {
        ok: false,
        code: "dropped_extension",
        error: `Filename is missing its extension (was '${options.originalExt}').`,
      };
    }
    if (!/^\.[A-Za-z0-9]+$/.test(newExt)) {
      return {
        ok: false,
        code: "extension_changed_to_invalid",
        error: `'${newExt}' is not a valid extension.`,
      };
    }
  }

  // Sibling collision — case-insensitive because most consumer file
  // systems are CI-collapsed (macOS APFS default, Windows NTFS, S3
  // buckets configured for object-name normalization).
  if (options.siblingNames && options.siblingNames.length > 0) {
    const lowered = value.toLowerCase();
    const conflict = options.siblingNames.some(
      (n) => n.toLowerCase() === lowered,
    );
    if (conflict)
      return {
        ok: false,
        code: "sibling_collision",
        error: `A ${options.kind === "folder" ? "folder" : "file"} named '${value}' already exists in this folder.`,
      };
  }

  return { ok: true, value };
}

/**
 * Splits a filename into [basename, extension]. Extension includes the dot.
 * Files with no extension return ["whole-name", ""].
 * Hidden files like ".env" are treated as basename-only (no extension).
 */
export function splitNameAndExtension(name: string): [string, string] {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return [name, ""];
  return [name.slice(0, dot), name.slice(dot)];
}

export function RenameDialog({
  open,
  onOpenChange,
  kind,
  resourceId,
  currentName,
}: RenameDialogProps) {
  const dispatch = useAppDispatch();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const extInputRef = useRef<HTMLInputElement | null>(null);

  // Resolve the resource and its parent folder so we can collect sibling
  // names for collision detection. We exclude the resource itself from
  // the sibling list because renaming to the current name is a separate
  // (and tighter) check inside `validateRenameInput`.
  const filesById = useAppSelector(selectAllFilesMap);
  const foldersById = useAppSelector(selectAllFoldersMap);
  const file = useAppSelector((s) =>
    kind === "file" ? selectFileById(s, resourceId) : null,
  );
  const folder = useAppSelector((s) =>
    kind === "folder" ? selectFolderById(s, resourceId) : null,
  );
  const parentId =
    kind === "file"
      ? (file?.parentFolderId ?? null)
      : (folder?.parentId ?? null);

  const siblingNames = useMemo<string[]>(() => {
    const out: string[] = [];
    for (const f of Object.values(filesById)) {
      if (!f) continue;
      if (f.id === resourceId) continue;
      if (f.deletedAt) continue;
      if ((f.parentFolderId ?? null) === parentId) out.push(f.fileName);
    }
    for (const fo of Object.values(foldersById)) {
      if (!fo) continue;
      if (fo.id === resourceId) continue;
      if (fo.deletedAt) continue;
      if ((fo.parentId ?? null) === parentId) out.push(fo.folderName);
    }
    return out;
  }, [filesById, foldersById, parentId, resourceId]);

  const [originalBase, originalExt] = useMemo(
    () => (kind === "file" ? splitNameAndExtension(currentName) : [currentName, ""]),
    [kind, currentName],
  );
  const [base, setBase] = useState(originalBase);
  const [ext, setExt] = useState(originalExt);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset internal state whenever the dialog opens for a (potentially) new
  // resource. We key off both `open` and the resource identity so reopening
  // for the same resource (e.g. after an error) still gets a fresh state.
  useEffect(() => {
    if (open) {
      setBase(originalBase);
      setExt(originalExt);
      setError(null);
      setBusy(false);
    }
  }, [open, resourceId, originalBase, originalExt]);

  const composedName = kind === "file" ? `${base}${ext}` : base;
  const extChanged = kind === "file" && ext !== originalExt;

  const handleSubmit = useCallback(async () => {
    const result = validateRenameInput(composedName, currentName, {
      kind,
      originalExt,
      siblingNames,
    });
    if (result.ok === false) {
      setError(result.error);
      return;
    }
    const nextName = result.value;
    setBusy(true);
    setError(null);
    try {
      if (kind === "file") {
        await dispatch(
          renameFileThunk({ fileId: resourceId, newName: nextName }),
        ).unwrap();
      } else {
        await dispatch(
          updateFolderThunk({
            folderId: resourceId,
            patch: { folderName: nextName },
          }),
        ).unwrap();
      }
      onOpenChange(false);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [
    dispatch,
    kind,
    resourceId,
    composedName,
    currentName,
    originalExt,
    siblingNames,
    onOpenChange,
  ]);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          const el = inputRef.current;
          if (!el) return;
          el.focus();
          // Select the whole basename so typing replaces it; the extension
          // field is a separate input so it can't be clobbered.
          el.setSelectionRange(0, base.length);
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            Rename {kind === "file" ? "file" : "folder"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {kind === "file"
              ? "The extension is shown separately so it isn't changed by accident."
              : "Children move with the folder."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {kind === "file" && originalExt ? (
          <div className="flex items-stretch gap-1.5">
            <ProInput
              ref={inputRef}
              type="text"
              value={base}
              onChange={(e) => setBase(e.target.value)}
              placeholder={originalBase}
              wrapperClassName="flex-1 min-w-0"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
            <input
              ref={extInputRef}
              type="text"
              value={ext}
              onChange={(e) => {
                const v = e.target.value;
                // Auto-prefix the dot so users typing "txt" still produce
                // ".txt" — only fight the user when they type whitespace.
                if (v && !v.startsWith(".") && v !== "") {
                  setExt("." + v);
                } else {
                  setExt(v);
                }
              }}
              aria-label="File extension"
              title={
                extChanged
                  ? "Changing the extension changes the file type — be careful."
                  : "File extension"
              }
              className={cn(
                "w-24 shrink-0 rounded-md border bg-muted/40 px-2 py-2 text-sm outline-none focus:ring-2",
                extChanged
                  ? "border-amber-500/70 text-amber-600 dark:text-amber-400 focus:ring-amber-400"
                  : "text-muted-foreground focus:ring-ring",
              )}
              style={{ fontSize: "16px" }}
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void handleSubmit();
                }
              }}
            />
          </div>
        ) : (
          <ProInput
            ref={inputRef}
            type="text"
            value={base}
            onChange={(e) => setBase(e.target.value)}
            placeholder={originalBase}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
        )}

        {extChanged ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            You changed the file extension from{" "}
            <span className="font-mono">{originalExt || "(none)"}</span> to{" "}
            <span className="font-mono">{ext || "(none)"}</span>. The file type
            will change.
          </p>
        ) : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} onClick={() => setError(null)}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            disabled={busy}
          >
            {busy ? "Renaming…" : "Rename"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
