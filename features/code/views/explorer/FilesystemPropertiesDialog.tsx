"use client";

import { useCallback, useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  formatAbsoluteDate,
  formatFileSize,
} from "@/features/files/utils/format";
import type { FilesystemAdapter } from "../../adapters/FilesystemAdapter";
import type { FilesystemNode } from "../../types";
import {
  computeDirectorySize,
  fetchFilesystemProperties,
  type FilesystemProperties,
} from "../../utils/filesystem-properties";
import { extractErrorMessage } from "@/utils/errors";

interface FilesystemPropertiesDialogProps {
  node: FilesystemNode | null;
  adapter: FilesystemAdapter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function kindLabel(kind: FilesystemProperties["kind"]): string {
  if (kind === "directory") return "Folder";
  if (kind === "symlink") return "Symlink";
  return "File";
}

function PropertyRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "break-all font-mono text-[13px]" : "break-all"}>
        {value}
      </span>
    </div>
  );
}

export function FilesystemPropertiesDialog({
  node,
  adapter,
  open,
  onOpenChange,
}: FilesystemPropertiesDialogProps) {
  const [props, setProps] = useState<FilesystemProperties | null>(null);
  const [loading, setLoading] = useState(false);
  const [sizeBusy, setSizeBusy] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !node) {
      setProps(null);
      setSizeError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setSizeError(null);
    void fetchFilesystemProperties(adapter, node)
      .then((next) => {
        if (!cancelled) setProps(next);
      })
      .catch((err) => {
        if (!cancelled) setSizeError(extractErrorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [adapter, node, open]);

  const handleCalculateSize = useCallback(async () => {
    if (!node || node.kind !== "directory") return;
    setSizeBusy(true);
    setSizeError(null);
    const ac = new AbortController();
    try {
      const totalSize = await computeDirectorySize(adapter, node.path, {
        signal: ac.signal,
      });
      setProps((prev) => (prev ? { ...prev, totalSize } : prev));
    } catch (err) {
      setSizeError(extractErrorMessage(err));
    } finally {
      setSizeBusy(false);
    }
  }, [adapter, node]);

  const isDir = node?.kind === "directory";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Info className="h-4 w-4" />
            {node?.name ?? "Properties"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Filesystem metadata for the selected item.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading properties…
          </div>
        )}

        {!loading && props && (
          <div className="space-y-3">
            <PropertyRow label="Kind" value={kindLabel(props.kind)} />
            <PropertyRow label="Path" value={props.path} mono />
            {props.kind === "file" && (
              <PropertyRow
                label="Size"
                value={formatFileSize(props.sizeBytes)}
              />
            )}
            {isDir && (
              <>
                <PropertyRow
                  label="Items"
                  value={
                    props.childCount != null
                      ? `${props.childCount} direct ${props.childCount === 1 ? "item" : "items"}`
                      : "—"
                  }
                />
                <PropertyRow
                  label="Total size"
                  value={
                    props.totalSize ? (
                      <span>
                        {formatFileSize(props.totalSize.bytes)}
                        {props.totalSize.estimated ? " (estimated)" : ""}
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        disabled={sizeBusy}
                        onClick={() => void handleCalculateSize()}
                      >
                        {sizeBusy ? (
                          <>
                            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
                            Calculating…
                          </>
                        ) : (
                          "Calculate"
                        )}
                      </Button>
                    )
                  }
                />
              </>
            )}
            {props.modifiedAt && (
              <PropertyRow
                label="Modified"
                value={formatAbsoluteDate(props.modifiedAt)}
              />
            )}
            {props.permissions && (
              <PropertyRow label="Permissions" value={props.permissions} mono />
            )}
            {props.symlinkTarget && (
              <PropertyRow label="Target" value={props.symlinkTarget} mono />
            )}
          </div>
        )}

        {sizeError && <p className="text-sm text-destructive">{sizeError}</p>}
      </DialogContent>
    </Dialog>
  );
}
