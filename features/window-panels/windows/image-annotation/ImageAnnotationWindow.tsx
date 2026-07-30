"use client";

/**
 * Lazy WindowPanel host for the canonical image-studio annotation mode.
 *
 * The window owns presentation and source selection only. Marker tools,
 * flattening, and file persistence remain in AnnotateModeShell.
 */

import { useEffect, useRef, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ModeImagePicker } from "@/features/image-studio/components/ModeImagePicker";
import { AnnotateModeShell } from "@/features/image-studio/modes/annotate/AnnotateModeShell";
import type {
  ImageSource,
  SaveResult,
} from "@/features/image-studio/modes/shared/types";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { emitImageAnnotationEvent } from "@/features/overlays/callbacks/imageAnnotationWindow";

export interface ImageAnnotationWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  callbackGroupId?: string | null;
  sourceFileId?: string | null;
  sourceUrl?: string | null;
  sourceFilename?: string | null;
  defaultFolder?: string | null;
  title?: string | null;
  overwriteSource?: boolean;
}

export default function ImageAnnotationWindow({
  isOpen,
  onClose,
  instanceId,
  callbackGroupId,
  sourceFileId,
  sourceUrl,
  sourceFilename,
  defaultFolder,
  title,
  overwriteSource = false,
}: ImageAnnotationWindowProps) {
  const [pickedSource, setPickedSource] = useState<ImageSource | null>(null);
  const lastResultRef = useRef<SaveResult | null>(null);
  const readyEmittedRef = useRef(false);

  useEffect(() => {
    if (readyEmittedRef.current) return;
    readyEmittedRef.current = true;
    emitImageAnnotationEvent(callbackGroupId, {
      type: "ready",
      windowInstanceId: instanceId,
    });
  }, [callbackGroupId, instanceId]);

  const initialSource: ImageSource | null = sourceFileId
    ? { kind: "cloudFileId", cloudFileId: sourceFileId }
    : sourceUrl
      ? {
          kind: "url",
          url: sourceUrl,
          suggestedFilename: sourceFilename ?? undefined,
        }
      : null;
  const source = pickedSource ?? initialSource;

  const handleClose = () => {
    emitImageAnnotationEvent(callbackGroupId, {
      type: "window-close",
      windowInstanceId: instanceId,
      lastResult: lastResultRef.current,
    });
    onClose();
  };

  const handleSave = (result: SaveResult) => {
    lastResultRef.current = result;
    emitImageAnnotationEvent(callbackGroupId, {
      type: "saved",
      windowInstanceId: instanceId,
      result,
    });
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={`image-annotation-window-${instanceId}`}
      title={title ?? "Mark up image"}
      overlayId="imageAnnotationWindow"
      overlayInstanceId={instanceId}
      onClose={handleClose}
      minWidth={520}
      minHeight={420}
      width={920}
      height={720}
      position="center"
      className="image-annotation-window-panel"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {source ? (
        <AnnotateModeShell
          source={source}
          cloudFileId={sourceFileId}
          saveFileId={
            overwriteSource && sourceFileId ? sourceFileId : undefined
          }
          defaultFolder={
            defaultFolder ?? CloudFolders.IMAGES_ANNOTATED
          }
          presentation="modal"
          onSave={handleSave}
          onCancel={handleClose}
        />
      ) : (
        <ModeImagePicker
          title="Choose something to mark up"
          onPick={setPickedSource}
          enableCapture
          captureHideSelectors={[".image-annotation-window-panel"]}
          showLibraryLink={false}
        />
      )}
    </WindowPanel>
  );
}
