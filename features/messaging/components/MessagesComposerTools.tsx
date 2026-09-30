"use client";

import { useState } from "react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { ArrowLeft, Files, Link2, Database } from "lucide-react";
import type { ComposerInputRenderProps } from "@ai-matrx/messaging/react";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import { ReferencePickerBody } from "@/features/matrx-envelope/components/reference-picker/ReferencePickerBody";
import MessagesCustomDataPicker from "./MessagesCustomDataPicker";
import { toast } from "@/lib/toast";

export default function MessagesComposerTools({
  mode,
  input,
  onClose,
  onEmoji,
}: {
  mode: "attach" | "emoji";
  input: ComposerInputRenderProps;
  onClose: () => void;
  onEmoji: (emoji: string) => void;
}) {
  const [view, setView] = useState<"menu" | "files" | "references" | "records">(
    "menu",
  );
  if (mode === "emoji")
    return (
      <EmojiPicker
        onEmojiClick={(item) => onEmoji(item.emoji)}
        theme={Theme.AUTO}
        width="100%"
        height={380}
        lazyLoadEmojis
        previewConfig={{ showPreview: false }}
      />
    );
  return (
    <div className="messages-attach-menu" data-view={view}>
      {view !== "menu" && (
        <button
          type="button"
          className="messages-attach-back"
          onClick={() => setView("menu")}
        >
          <ArrowLeft size={15} /> Attach
        </button>
      )}
      {view === "menu" && (
        <div className="messages-attach-choices">
          <button type="button" onClick={() => setView("files")}>
            <Files size={19} />
            <span>Photos and files</span>
          </button>
          <button type="button" onClick={() => setView("references")}>
            <Link2 size={19} />
            <span>Share an item or reference</span>
          </button>
          <button type="button" onClick={() => setView("records")}>
            <Database size={19} />
            <span>Custom data</span>
          </button>
        </div>
      )}
      {view === "files" && (
        <ResourcePickerMenu
          initialView="files"
          allowedViewIds={["files"]}
          selectionMode="multiple"
          fillHost
          onClose={onClose}
          onExitInitialView={() => setView("menu")}
          onResourceSelected={(resource) => {
            if (resource.type !== "file") return false;
            const file = resource.data;
            const fileId = file.fileId ?? file.id;
            if (!fileId) {
              toast.error(
                "This file hasn't finished saving. Try selecting it again.",
              );
              return false;
            }
            input.add({
              id: fileId,
              label: file.filename ?? file.details?.filename ?? "File",
              attachment: {
                fileId,
                fileName: file.filename ?? file.details?.filename ?? "File",
                mimeType:
                  file.mime_type ??
                  file.content_type ??
                  "application/octet-stream",
                sizeBytes: file.size ?? 0,
                width: null,
                height: null,
              },
            });
            return true;
          }}
        />
      )}
      {view === "references" && (
        <ReferencePickerBody
          mode="insert"
          onCancel={onClose}
          onPicked={(pick) => {
            if (pick.delivery === "insert")
              input.add({
                id: pick.fence,
                label: pick.title ?? "Reference",
                content: pick.fence,
              });
            onClose();
          }}
        />
      )}
      {view === "records" && (
        <MessagesCustomDataPicker
          onPick={(item) => {
            input.add(item);
            onClose();
          }}
        />
      )}
    </div>
  );
}
