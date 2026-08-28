"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { Cloud, FileUp, FolderOpen, FolderUp, Loader2 } from "lucide-react";
import { GoogleDrive } from "@/components/icons/brand-icons";
import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useGoogleConnectionInventory } from "@/features/marketing/google/hooks";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { cn } from "@/lib/utils";
import { useOpenGoogleConnectWindow } from "@/features/overlays/openers/googleConnectWindow";

export type FileAcquisitionPresentation =
  "menu" | "buttons" | "inline" | "icons";

export interface FileAcquisitionActionsProps {
  onFiles: (files: File[]) => void | Promise<void>;
  onError?: (message: string) => void;
  onChooseExisting?: () => void;
  presentation?: FileAcquisitionPresentation;
  accept?: string;
  multiple?: boolean;
  enableLocalFiles?: boolean;
  enableLocalFolder?: boolean;
  enableExistingFiles?: boolean;
  enableGoogleDrive?: boolean;
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
  presentation = "buttons",
  accept,
  multiple = true,
  enableLocalFiles = true,
  enableLocalFolder = true,
  enableExistingFiles = Boolean(onChooseExisting),
  enableGoogleDrive = true,
  disabled = false,
  className,
}: FileAcquisitionActionsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const inventory = useGoogleConnectionInventory();
  const openGoogle = useOpenGoogleConnectWindow();
  const [googleBusy, setGoogleBusy] = useState(false);

  const googleConnected = useMemo(
    () =>
      (inventory.data?.connections ?? []).some(
        (connection) =>
          connection.health === "connected" &&
          connection.scopes.includes(GOOGLE_SCOPE.driveFile),
      ),
    [inventory.data?.connections],
  );

  const deliverFiles = useCallback(
    (files: File[]) => {
      if (!files.length) return;
      void Promise.resolve(onFiles(files)).catch((error: unknown) => {
        onError?.(
          error instanceof Error ? error.message : "File import failed.",
        );
      });
    },
    [onError, onFiles],
  );

  const openDrive = useCallback(() => {
    setGoogleBusy(true);
    openGoogle({
      mode: "drive-import",
      reason: "to import selected Drive files into AI Matrx",
      onDriveImported: (event) => {
        setGoogleBusy(false);
        deliverFiles(event.files);
        if (event.failures.length) onError?.(errorText(event.failures));
      },
      onWindowClose: () => setGoogleBusy(false),
    });
  }, [deliverFiles, onError, openGoogle]);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      deliverFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [deliverFiles],
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
            onSelect={() => fileInputRef.current?.click()}
          >
            <FileUp className="mr-2 h-4 w-4" />
            Upload files
          </DropdownMenuItem>
        ) : null}
        {enableLocalFolder ? (
          <DropdownMenuItem
            disabled={disabled}
            onSelect={() => folderInputRef.current?.click()}
          >
            <FolderUp className="mr-2 h-4 w-4" />
            Upload folder
          </DropdownMenuItem>
        ) : null}
        {enableExistingFiles && onChooseExisting ? (
          <DropdownMenuItem disabled={disabled} onSelect={onChooseExisting}>
            <Cloud className="mr-2 h-4 w-4" />
            Choose from Files
          </DropdownMenuItem>
        ) : null}
        {enableGoogleDrive ? (
          <DropdownMenuItem
            disabled={disabled || googleBusy}
            onSelect={openDrive}
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
        {hiddenInputs}
      </>
    );
  }

  const actions = [
    enableLocalFiles
      ? {
          key: "files",
          label: "Upload files",
          icon: FileUp,
          onClick: () => fileInputRef.current?.click(),
        }
      : null,
    enableLocalFolder
      ? {
          key: "folder",
          label: "Upload folder",
          icon: FolderUp,
          onClick: () => folderInputRef.current?.click(),
        }
      : null,
    enableExistingFiles && onChooseExisting
      ? {
          key: "existing",
          label: "Choose from Files",
          icon: FolderOpen,
          onClick: onChooseExisting,
        }
      : null,
    enableGoogleDrive
      ? {
          key: "google-drive",
          label: googleLabel,
          icon: googleIcon,
          onClick: openDrive,
        }
      : null,
  ].filter((action) => action !== null);

  if (presentation === "inline") {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-center gap-1.5",
          className,
        )}
      >
        {actions.map((action) => {
          const Icon = action.icon;
          const busy = action.key === "google-drive" && googleBusy;
          return (
            <button
              key={action.key}
              type="button"
              onClick={action.onClick}
              disabled={disabled || busy}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <Icon className={cn("h-3.5 w-3.5", busy && "animate-spin")} />
              {action.label}
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
              onClick={action.onClick}
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
            onClick={action.onClick}
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
