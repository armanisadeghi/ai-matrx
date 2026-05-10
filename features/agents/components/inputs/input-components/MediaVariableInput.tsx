"use client";

/**
 * MediaVariableInput
 *
 * Shared base for image/audio/video/document variable inputs. Wraps the
 * existing ResourcePickerMenu in a popover and emits a MediaRef-shaped
 * value via onChange. The five public wrappers (ImageVariableInput,
 * AudioVariableInput, VideoVariableInput, DocumentVariableInput, plus the
 * YouTube one which is text-only) parameterize this with a mediaKind.
 *
 * Value shape (always a MediaRef when populated):
 *   { file_id?, url?, file_uri?, mime_type?, metadata? }
 *
 * The runtime expands this MediaRef into the matching message block at
 * request-assembly time — see assembleRequest in execute-instance.thunk.
 */

import { useState } from "react";
import {
  Image as ImageIcon,
  Mic,
  Video as VideoIcon,
  FileText,
  Upload,
  X,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import { ResourcePickerMenu } from "@/features/resource-manager/resource-picker/ResourcePickerMenu";
import {
  refineBlockType,
  resourceDataToSource,
} from "@/features/agents/redux/execution-system/instance-resources/resource-source";
import type { MediaRef } from "@/features/files/types";
import { cn } from "@/lib/utils";

export type MediaKind = "image" | "audio" | "video" | "document";

const KIND_META: Record<
  MediaKind,
  {
    label: string;
    Icon: typeof ImageIcon;
    /** Capabilities to enable in the resource picker menu. */
    capabilities: {
      supportsImageUrls?: boolean;
      supportsFileUrls?: boolean;
      supportsAudio?: boolean;
      supportsYoutubeVideos?: boolean;
    };
    /** Free-text URL placeholder when the user prefers paste-a-URL. */
    urlPlaceholder: string;
  }
> = {
  image: {
    label: "image",
    Icon: ImageIcon,
    capabilities: { supportsImageUrls: true, supportsFileUrls: true },
    urlPlaceholder: "https://example.com/image.png",
  },
  audio: {
    label: "audio",
    Icon: Mic,
    capabilities: { supportsAudio: true, supportsFileUrls: true },
    urlPlaceholder: "https://example.com/audio.mp3",
  },
  video: {
    label: "video",
    Icon: VideoIcon,
    capabilities: { supportsFileUrls: true },
    urlPlaceholder: "https://example.com/video.mp4",
  },
  document: {
    label: "document",
    Icon: FileText,
    capabilities: { supportsFileUrls: true },
    urlPlaceholder: "https://example.com/document.pdf",
  },
};

/** Coerce whatever the variable currently holds into a MediaRef shape. */
export function coerceMediaRef(value: unknown): MediaRef | null {
  if (!value) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return { url: trimmed };
  }
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    const ref: MediaRef = {};
    if (typeof o.file_id === "string") ref.file_id = o.file_id;
    if (typeof o.url === "string") ref.url = o.url;
    if (typeof o.file_uri === "string") ref.file_uri = o.file_uri;
    if (typeof o.mime_type === "string") ref.mime_type = o.mime_type;
    if (o.metadata && typeof o.metadata === "object") {
      ref.metadata = o.metadata as Record<string, unknown>;
    }
    if (
      ref.file_id === undefined &&
      ref.url === undefined &&
      ref.file_uri === undefined
    ) {
      return null;
    }
    return ref;
  }
  return null;
}

/** Short user-facing label for a populated MediaRef. */
function describeMediaRef(ref: MediaRef): string {
  if (ref.file_id) return `cld_files: ${ref.file_id.slice(0, 8)}…`;
  if (ref.file_uri) return ref.file_uri;
  if (ref.url) {
    try {
      const u = new URL(ref.url);
      return u.host + u.pathname;
    } catch {
      return ref.url;
    }
  }
  return "Selected";
}

interface MediaVariableInputProps {
  value: unknown;
  onChange: (v: MediaRef | null) => void;
  variableName: string;
  mediaKind: MediaKind;
  compact?: boolean;
}

export function MediaVariableInput({
  value,
  onChange,
  variableName,
  mediaKind,
  compact = false,
}: MediaVariableInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const dialogContainer = useDialogContainer();
  const meta = KIND_META[mediaKind];
  const ref = coerceMediaRef(value);

  // Picker → MediaRef. Mirrors SmartAgentResourcePickerButton's flow but
  // skips the resources slice — we need a value, not a resource attachment.
  const handlePicked = (resource: { type: string; data: unknown }) => {
    const baseBlockType =
      mediaKind === "image"
        ? "image"
        : mediaKind === "audio"
          ? "audio"
          : mediaKind === "video"
            ? "video"
            : "document";
    const blockType = refineBlockType(baseBlockType, resource.data);
    const source = resourceDataToSource(blockType, resource.data);
    if (source && typeof source === "object" && !Array.isArray(source)) {
      const next: MediaRef = { ...(source as MediaRef) };
      // Carry forward any metadata the user already configured at the
      // variable level — the block-level metadata always wins downstream.
      if (ref?.metadata) next.metadata = ref.metadata;
      onChange(next);
    } else if (typeof source === "string") {
      onChange({ url: source });
    }
    setPickerOpen(false);
  };

  const handleUrlChange = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    const next: MediaRef = { url: trimmed };
    if (ref?.metadata) next.metadata = ref.metadata;
    onChange(next);
  };

  const Icon = meta.Icon;

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      {ref ? (
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-muted/40">
          <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs truncate flex-1 font-mono" title={ref.url ?? ref.file_id ?? ref.file_uri}>
            {describeMediaRef(ref)}
          </span>
          {ref.file_id && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0">
              file_id
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 shrink-0"
            onClick={() => onChange(null)}
            title={`Clear ${meta.label}`}
          >
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <Popover open={pickerOpen} onOpenChange={setPickerOpen} modal={false}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs w-full justify-start"
            >
              <Upload className="w-3.5 h-3.5" />
              Pick {meta.label} (upload, library, or URL)
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-72 p-0 border-border"
            align="start"
            container={dialogContainer ?? undefined}
          >
            <ResourcePickerMenu
              onResourceSelected={handlePicked}
              onClose={() => setPickerOpen(false)}
              attachmentCapabilities={meta.capabilities}
            />
          </PopoverContent>
        </Popover>
      )}

      {/* Always-available URL paste lane — useful as an escape hatch even
          when a value is set. */}
      <div className="flex items-center gap-1.5">
        <LinkIcon className="w-3 h-3 text-muted-foreground shrink-0" />
        <Input
          value={ref?.url ?? ""}
          onChange={(e) => handleUrlChange(e.target.value)}
          placeholder={meta.urlPlaceholder}
          className="h-7 text-xs font-mono"
          aria-label={`${meta.label} URL for ${variableName}`}
          style={{ fontSize: "16px" }}
        />
      </div>
    </div>
  );
}
