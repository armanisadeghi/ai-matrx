"use client";

/**
 * AgentSettingMediaPicker
 *
 * Picker for MediaRef-shaped agent settings (image_input, image_inputs,
 * mask, video_input, last_frame_image, frame_images, reference_images,
 * etc.). Renders inside the agent settings panel — distinct from
 * SmartAgentResourcePickerButton (which targets conversation-scoped
 * instance-resources). This one writes to the agent's settings dict via
 * the standard `setAgentSettings` Redux action.
 *
 * Architecture: there is exactly ONE ingress path for media on this
 * platform — the cld_files system (Python-managed, AWS storage with
 * Supabase metadata). The ResourcePickerMenu used here covers every
 * supported source (upload, choose from library, paste URL, pick from
 * existing files, etc.). When the user selects something, we convert
 * the picker payload into a canonical MediaRef using
 * `resourceDataToSource()` from the file-handler — the exact same shape
 * coercion the chat-attachment path uses. No alternate paths.
 */

import { useState, useCallback, useMemo } from "react";
import { Image as ImageIcon, X, Plus, FileText, Video, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import type { Resource } from "@/features/agents/resources/types";
import type { ResourceBlockType } from "@/features/agents/types/instance.types";
import type { MediaRef } from "@/features/files";

// Map a Resource type → the closest ResourceBlockType so refineBlockType
// can do the MIME-driven narrowing. Mirrors the mapping in
// SmartAgentResourcePickerButton verbatim.
function resourceTypeToBlockType(type: Resource["type"]): ResourceBlockType {
  const map: Record<string, ResourceBlockType> = {
    note: "input_notes",
    task: "input_task",
    project: "input_notes",
    file: "document",
    table: "input_table",
    webpage: "input_webpage",
    youtube: "youtube_video",
    image_url: "image",
    file_url: "document",
    audio: "audio",
  };
  return map[type] ?? "text";
}

// A short display label for a MediaRef chip.
function mediaRefLabel(ref: MediaRef): string {
  if (ref.file_id) return `file:${ref.file_id.slice(0, 8)}…`;
  if (ref.file_uri) return ref.file_uri.split("/").pop() ?? ref.file_uri;
  if (ref.url) {
    try {
      const u = new URL(ref.url);
      const last = u.pathname.split("/").pop();
      return last && last.length > 0 ? last : u.host;
    } catch {
      return ref.url.slice(0, 32);
    }
  }
  return "media";
}

function mediaRefIcon(ref: MediaRef) {
  const m = ref.mime_type ?? "";
  if (m.startsWith("image/")) return <ImageIcon className="w-3 h-3" />;
  if (m.startsWith("video/")) return <Video className="w-3 h-3" />;
  if (m.startsWith("audio/")) return <FileAudio className="w-3 h-3" />;
  return <FileText className="w-3 h-3" />;
}

interface AgentSettingMediaPickerProps {
  value: unknown; // MediaRef | MediaRef[] | string | string[] | null | undefined
  onChange: (value: MediaRef | MediaRef[] | null) => void;
  multi?: boolean;
  isEnabled: boolean;
  /** Caps the picker offers — keep generous; restriction by control type
      is the model's job, not the picker's. */
  attachmentCapabilities?: {
    supportsImageUrls?: boolean;
    supportsFileUrls?: boolean;
    supportsYoutubeVideos?: boolean;
    supportsAudio?: boolean;
  };
}

const DEFAULT_CAPS = {
  supportsImageUrls: true,
  supportsFileUrls: true,
  supportsYoutubeVideos: false,
  supportsAudio: true,
} as const;

/**
 * Extract MediaRef from any value that might be on an agent setting.
 * Handles: bare MediaRef, MediaRef-shaped dict, raw URL string, null.
 */
function coerceToRef(v: unknown): MediaRef | null {
  if (v == null) return null;
  if (typeof v === "string") return v.length > 0 ? { url: v } : null;
  if (typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.file_id !== "string" &&
    typeof o.file_uri !== "string" &&
    typeof o.url !== "string"
  ) {
    return null;
  }
  const ref: MediaRef = {};
  if (typeof o.file_id === "string") ref.file_id = o.file_id;
  if (typeof o.file_uri === "string") ref.file_uri = o.file_uri;
  if (typeof o.url === "string") ref.url = o.url;
  if (typeof o.mime_type === "string") ref.mime_type = o.mime_type;
  return ref;
}

function coerceToRefs(v: unknown): MediaRef[] {
  if (Array.isArray(v)) {
    return v.map(coerceToRef).filter((r): r is MediaRef => r !== null);
  }
  const single = coerceToRef(v);
  return single ? [single] : [];
}

export function AgentSettingMediaPicker({
  value,
  onChange,
  multi = false,
  isEnabled,
  attachmentCapabilities = DEFAULT_CAPS,
}: AgentSettingMediaPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dialogContainer = useDialogContainer();

  // Always normalize value to an array of refs internally; collapse to
  // single on emit if multi=false.
  const refs: MediaRef[] = useMemo(
    () => (multi ? coerceToRefs(value) : (() => {
      const r = coerceToRef(value);
      return r ? [r] : [];
    })()),
    [value, multi],
  );

  const handleResourceSelected = useCallback(
    (resource: Resource) => {
      // Same flow the chat-attachment picker uses: refine the block type
      // (so a JPEG picked as "file" becomes "image"), then run through
      // resourceDataToSource to produce a canonical MediaRef.
      const baseBlockType = resourceTypeToBlockType(resource.type);
      const blockType = refineBlockType(baseBlockType, resource.data);
      const coerced = resourceDataToSource(blockType, resource.data);
      const newRef = coerceToRef(coerced) ?? coerceToRef(resource.data);
      if (!newRef) {
        // Picker returned something we can't shape into a MediaRef
        // (e.g. a note or task). Bail without modifying value.
        setIsOpen(false);
        return;
      }
      if (multi) {
        onChange([...refs, newRef]);
      } else {
        onChange(newRef);
      }
      setIsOpen(false);
    },
    [refs, multi, onChange],
  );

  const handleRemove = useCallback(
    (idx: number) => {
      if (!isEnabled) return;
      if (multi) {
        const next = refs.filter((_, i) => i !== idx);
        onChange(next.length > 0 ? next : []);
      } else {
        onChange(null);
      }
    },
    [refs, multi, isEnabled, onChange],
  );

  const trigger = (
    <Button
      variant="outline"
      size="sm"
      className="h-7 px-2 text-xs gap-1 flex-shrink-0"
      disabled={!isEnabled}
      tabIndex={-1}
      title={multi ? "Add media" : "Pick media"}
      type="button"
    >
      <Plus className="w-3 h-3" />
      {multi || refs.length === 0 ? (multi ? "Add" : "Pick") : "Replace"}
    </Button>
  );

  return (
    <div className="flex items-center gap-1.5 flex-1 flex-wrap">
      {/* Selected refs as chips */}
      {refs.map((ref, idx) => (
        <span
          key={`${ref.file_id ?? ref.file_uri ?? ref.url ?? idx}-${idx}`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-border bg-muted/40 text-[11px] max-w-[200px]"
          title={ref.url ?? ref.file_uri ?? ref.file_id ?? "media"}
        >
          {mediaRefIcon(ref)}
          <span className="truncate">{mediaRefLabel(ref)}</span>
          {isEnabled && (
            <button
              type="button"
              onClick={() => handleRemove(idx)}
              className="opacity-60 hover:opacity-100"
              title="Remove"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          )}
        </span>
      ))}

      {/* Picker trigger — always shown unless single-mode + slot already filled */}
      {(multi || refs.length === 0) && (
        <Popover open={isOpen} onOpenChange={setIsOpen} modal={false}>
          <PopoverTrigger asChild>{trigger}</PopoverTrigger>
          <PopoverContent
            className="w-80 p-0 border-border"
            align="start"
            side="top"
            sideOffset={8}
            container={dialogContainer ?? undefined}
          >
            <ResourcePickerMenu
              onResourceSelected={handleResourceSelected}
              onClose={() => setIsOpen(false)}
              attachmentCapabilities={attachmentCapabilities}
            />
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
