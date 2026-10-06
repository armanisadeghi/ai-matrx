"use client";

/**
 * SmartInputFileDropTarget
 *
 * The shared drag/drop shell for every SmartAgentInput layout. It uses the
 * same react-dropzone interaction primitive as Cloud Files and hands accepted
 * files to the canonical agent-resource upload lifecycle.
 */

import { useDropzone } from "react-dropzone";
import { Loader2, Upload } from "lucide-react";
import { cn } from "@ai-matrx/design-system";
import { useUploadAgentResources } from "../resources/usePasteImageResource";

interface SmartInputFileDropTargetProps extends Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children"
> {
  conversationId: string;
  uploadRoot?: string;
  uploadPath?: string;
  /**
   * Pasted files (a screenshot, Cmd/Ctrl+V of a copied file) attach through
   * the same upload as a drop. react-dropzone OWNS paste-to-upload (v20+,
   * on by default); nothing else in the input may also catch the paste, or
   * every pasted image attaches twice (2026-10-06). False = paste stays text.
   */
  pasteFiles?: boolean;
  children: React.ReactNode;
}

export function SmartInputFileDropTarget({
  conversationId,
  uploadRoot,
  uploadPath,
  pasteFiles = true,
  className,
  children,
  ...rootProps
}: SmartInputFileDropTargetProps) {
  const uploadResources = useUploadAgentResources(conversationId, {
    uploadRoot,
    uploadPath,
  });
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => void uploadResources(files),
    noClick: true,
    noKeyboard: true,
    noPaste: !pasteFiles,
  });

  return (
    <div
      {...getRootProps({
        ...rootProps,
        className: cn("relative", className),
      })}
      data-agent-input-shell
      data-drop-active={isDragActive ? "true" : undefined}
    >
      <input {...getInputProps()} />
      {children}
      {isDragActive ? (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-[inherit] border-2 border-dashed border-primary bg-background/90 backdrop-blur-sm"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 font-medium text-primary">
            <span className="relative">
              <Upload className="h-6 w-6" aria-hidden="true" />
              <Loader2
                className="absolute -bottom-1 -right-1 h-3.5 w-3.5 animate-spin rounded-full bg-background"
                aria-hidden="true"
              />
            </span>
            Drop files to attach
          </div>
        </div>
      ) : null}
    </div>
  );
}
