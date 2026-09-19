"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Cloud, FileUp, FolderOpen, FolderUp, Loader2 } from "lucide-react";
import { GoogleDrive } from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllFoldersMap } from "@/features/files/redux/selectors";
import { attachChildToFolder, upsertFiles } from "@/features/files/redux/slice";
import type { CanonicalStorageImport } from "@/features/files/storage-sources/types";
import { useOpenStorageSourcePicker } from "@/features/overlays/openers/storageSourcePicker";
import { matchStorageAccept, enforceStorageSelectionMode } from "@/features/files/storage-sources/accept";
import { validateStorageDestinationFolderPath } from "@/features/files/storage-sources/service";

export type FileAcquisitionPresentation =
  "menu" | "buttons" | "inline" | "icons";

type FileAcquisitionActionKey =
  "files" | "folder" | "existing" | "google-drive" | "cloud-storage";

type FileAcquisitionAction = {
  key: FileAcquisitionActionKey;
  label: string;
  icon: typeof FileUp;
};

export interface FileAcquisitionActionsProps {
  onFiles: (files: File[]) => void | Promise<void>;
  onError?: (message: string) => void;
  onChooseExisting?: () => void;
  onLocalSelectionComplete?: () => void;
  presentation?: FileAcquisitionPresentation;
  accept?: string;
  multiple?: boolean;
  enableLocalFiles?: boolean;
  enableLocalFolder?: boolean;
  enableExistingFiles?: boolean;
  enableGoogleDrive?: boolean;
  enableStorageProviders?: boolean;
  /** Existing Files destination. `null` means the Files root. */
  storageImportParentFolderId?: string | null;
  /** Explicit destination for non-Files consumers such as chat attachments. */
  storageImportFolderPath?: string;
  /** Receives already-persisted canonical files; no browser re-upload occurs. */
  onStorageImported?: (files: CanonicalStorageImport[]) => void | Promise<void>;
  disabled?: boolean;
  className?: string;
}

function errorText(failures: Array<{ name: string; error: string }>): string {
  return failures
    .map((failure) => `${failure.name}: ${failure.error}`)
    .join("; ");
}

export function FileAcquisitionActions({
  onFiles,
  onError,
  onChooseExisting,
  onLocalSelectionComplete,
  presentation = "buttons",
  accept,
  multiple = true,
  enableLocalFiles = true,
  enableLocalFolder = true,
  enableExistingFiles = Boolean(onChooseExisting),
  enableGoogleDrive = true,
  enableStorageProviders = true,
  storageImportParentFolderId,
  storageImportFolderPath,
  onStorageImported,
  disabled = false,
  className,
}: FileAcquisitionActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const inventory = useGoogleConnectionInventory();
  const openGoogle = useOpenGoogleConnectWindow();
  const openStorageSource = useOpenStorageSourcePicker();
  const dispatch = useAppDispatch();
  const foldersById = useAppSelector(selectAllFoldersMap);
  const [googleBusy, setGoogleBusy] = useState(false);

  const importDestinationFolderPath: string | null =
    storageImportFolderPath ??
    (storageImportParentFolderId === null
      ? ""
      : storageImportParentFolderId
        ? (foldersById[storageImportParentFolderId]?.folderPath ?? null)
        : "My Files/Imports");

  const googleConnected = useMemo(
    () =>
      (inventory.data?.connections ?? []).some(
        (connection) =>
          connection.health === "connected" &&
          connection.scopes.includes(GOOGLE_SCOPE.driveFile),
      ),
    [inventory.data?.connections],
  );

  const reportError = useCallback(
    (message: string) => {
      if (onError) onError(message);
      else toast.error(message);
    },
    [onError],
  );

  const deliverFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      void Promise.resolve(onFiles(files)).catch((error: unknown) => {
        reportError(
          error instanceof Error ? error.message : "File import failed.",
        );
      });
    },
    [onFiles, reportError],
  );

  const openDrive = useCallback(() => {
    if (importDestinationFolderPath === null) {
      reportError(
        "This destination folder is not available yet. Refresh Files and try again.",
      );
      return;
    }
    const destinationError = validateStorageDestinationFolderPath(
      importDestinationFolderPath,
    );
    if (destinationError) {
      reportError(destinationError);
      return;
    }
    setGoogleBusy(true);
    openGoogle({
      mode: "drive-import",
      reason: "to import selected Drive files into AI Matrx",
      importDestinationFolderPath,
      accept,
      multiple,
      onDriveImported: async (event) => {
        const canonicalFiles = event.files.map((imported) => imported.file);
        dispatch(upsertFiles(canonicalFiles));
        for (const file of canonicalFiles) {
          dispatch(
            attachChildToFolder({
              parentFolderId: file.parentFolderId,
              kind: "file",
              id: file.id,
            }),
          );
        }
        await onStorageImported?.(event.files);
        if (event.failures.length) reportError(errorText(event.failures));
        setGoogleBusy(false);
      },
      onWindowClose: () => setGoogleBusy(false),
    });
  }, [
    dispatch,
    accept,
    importDestinationFolderPath,
    multiple,
    onStorageImported,
    openGoogle,
    reportError,
  ]);

  const openStorage = useCallback(() => {
    if (importDestinationFolderPath === null) {
      reportError(
        "This destination folder is not available yet. Refresh Files and try again.",
      );
      return;
    }
    const destinationError = validateStorageDestinationFolderPath(
      importDestinationFolderPath,
    );
    if (destinationError) {
      reportError(destinationError);
      return;
    }
    openStorageSource({
      destinationFolderPath: importDestinationFolderPath,
      accept,
      multiple,
      onImported: async (files) => {
        await onStorageImported?.(files);
      },
    });
  }, [
    accept,
    importDestinationFolderPath,
    multiple,
    onStorageImported,
    openStorageSource,
    reportError,
  ]);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const candidates = Array.from(event.target.files ?? []);
      const mode = enforceStorageSelectionMode(candidates, multiple);
      if (!mode.accepted) {
        reportError(mode.reason);
      } else {
        const rejected = mode.values.find(
          (file) => !matchStorageAccept(file.name, file.type, accept).accepted,
        );
        if (rejected) {
          reportError(
            matchStorageAccept(rejected.name, rejected.type, accept).reason ??
              `${rejected.name} cannot be selected here.`,
          );
        } else {
          deliverFiles(mode.values);
        }
      }
      onLocalSelectionComplete?.();
      event.target.value = "";
    },
    [accept, deliverFiles, multiple, onLocalSelectionComplete, reportError],
  );
  const runAction = useCallback(
    (key: FileAcquisitionActionKey) => {
      if (key === "files") fileInputRef.current?.click();
      if (key === "folder") folderInputRef.current?.click();
      if (key === "existing") onChooseExisting?.();
      if (key === "google-drive") openDrive();
      if (key === "cloud-storage") openStorage();
    },
    [onChooseExisting, openDrive, openStorage],
  );

  const googleLabel = inventory.isLoading
    ? "Checking Google Drive"
    : googleConnected
      ? "Import from Google Drive"
      : "Connect Google Drive";
  const googleIcon = googleBusy || inventory.isLoading ? Loader2 : GoogleDrive;

  const hiddenInputs = (
    <>
      {enableLocalFiles ? (
        <input
          ref={fileInputRef}
          type="file"
          hidden
          multiple={multiple}
          accept={accept}
          onChange={onInputChange}
        />
      ) : null}
      {enableLocalFolder ? (
        <input
          ref={folderInputRef}
          type="file"
          hidden
          multiple
          accept={accept}
          onChange={onInputChange}
          {...({ webkitdirectory: "", directory: "" } as Record<
            string,
            string
          >)}
        />
      ) : null}
    </>
  );

  if (presentation === "menu") {
    return (
      <>
        {enableLocalFiles ? (
          <DropdownMenuItem
            disabled={disabled}
            onSelect={(event) => {
              // A native chooser returns asynchronously. Keep the dropdown
              // content (and its hidden input) mounted until that happens.
              event.preventDefault();
              runAction("files");
            }}
          >
            <FileUp className="mr-2 h-4 w-4" />
            Upload files
          </DropdownMenuItem>
        ) : null}
        {enableLocalFolder ? (
          <DropdownMenuItem
            disabled={disabled}
            onSelect={(event) => {
              event.preventDefault();
              runAction("folder");
            }}
          >
            <FolderUp className="mr-2 h-4 w-4" />
            Upload folder
          </DropdownMenuItem>
        ) : null}
        {enableExistingFiles && onChooseExisting ? (
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runAction("existing")}
          >
            <Cloud className="mr-2 h-4 w-4" />
            Choose from Files
          </DropdownMenuItem>
        ) : null}
        {enableGoogleDrive ? (
          <DropdownMenuItem
            disabled={disabled || googleBusy}
            onSelect={() => runAction("google-drive")}
          >
            {(() => {
              const Icon = googleIcon;
              return (
                <Icon
                  className={cn(
                    "mr-2 h-4 w-4",
                    (googleBusy || inventory.isLoading) && "animate-spin",
                  )}
                />
              );
            })()}
            {googleLabel}
          </DropdownMenuItem>
        ) : null}
        {enableStorageProviders ? (
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => runAction("cloud-storage")}
          >
            <Cloud className="mr-2 h-4 w-4" />
            OneDrive, Dropbox or Box
          </DropdownMenuItem>
        ) : null}
        {hiddenInputs}
      </>
    );
  }

  const actions = (
    [
      enableLocalFiles
        ? {
            key: "files",
            label: "Upload files",
            icon: FileUp,
          }
        : null,
      enableLocalFolder
        ? {
            key: "folder",
            label: "Upload folder",
            icon: FolderUp,
          }
        : null,
      enableExistingFiles && onChooseExisting
        ? {
            key: "existing",
            label: "Choose from Files",
            icon: FolderOpen,
          }
        : null,
      enableGoogleDrive
        ? {
            key: "google-drive",
            label: googleLabel,
            icon: googleIcon,
          }
        : null,
      enableStorageProviders
        ? {
            key: "cloud-storage",
            label: "OneDrive, Dropbox or Box",
            icon: Cloud,
          }
        : null,
    ] satisfies Array<FileAcquisitionAction | null>
  ).filter((action): action is FileAcquisitionAction => action !== null);

  if (presentation === "inline") {
    return (
      <div className={cn("grid w-full grid-cols-2 gap-1.5 sm:grid-cols-4", className)}>
        {actions.map((action) => {
          const Icon = action.icon;
          const busy = action.key === "google-drive" && googleBusy;
          const compactLabel =
            action.key === "files"
              ? "Upload File"
              : action.key === "folder"
                ? "Upload Folder"
                : action.key === "google-drive"
                  ? "Google Drive"
                  : action.key === "cloud-storage"
                    ? "Cloud Storage"
                  : action.label;
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => runAction(action.key)}
              disabled={disabled || busy}
              title={action.label}
              className="inline-flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-md border border-border bg-background/60 px-1.5 py-1.5 text-center text-[11px] font-medium leading-tight text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary disabled:opacity-50"
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0 text-primary",
                  busy && "animate-spin",
                )}
              />
              <span className="truncate">{compactLabel}</span>
            </button>
          );
        })}
        {hiddenInputs}
      </div>
    );
  }

  if (presentation === "icons") {
    // The primary local-upload action stays closest to the user's thumb.
    const iconActions = [...actions].reverse();
    return (
      <div className={cn("flex flex-col items-end gap-2", className)}>
        {iconActions.map((action) => {
          const Icon = action.icon;
          const busy = action.key === "google-drive" && googleBusy;
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => runAction(action.key)}
              disabled={disabled || busy}
              title={action.label}
              aria-label={action.label}
              className={cn(
                "pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full border bg-background text-foreground shadow-md active:scale-95 disabled:opacity-50",
                action.key === "files" &&
                  "h-12 w-12 border-primary bg-primary text-primary-foreground shadow-lg",
              )}
            >
              <Icon className={cn("h-5 w-5", busy && "animate-spin")} />
            </button>
          );
        })}
        {hiddenInputs}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {actions.map((action) => {
        const Icon = action.icon;
        const busy = action.key === "google-drive" && googleBusy;
        return (
          <Button
            key={action.key}
            type="button"
            variant={action.key === "files" ? "default" : "outline"}
            onClick={() => runAction(action.key)}
            disabled={disabled || busy}
          >
            <Icon className={cn("h-4 w-4", busy && "animate-spin")} />
            {action.label}
          </Button>
        );
      })}
      {hiddenInputs}
    </div>
  );
}
