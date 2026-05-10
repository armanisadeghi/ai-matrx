"use client";

/**
 * YoutubeVariableInput
 *
 * YouTube has no upload flow — the user pastes a URL or video ID.
 * Variable value is a plain string so it substitutes into a message
 * block's `url` field exactly the same way a directly-attached
 * youtube_video block does.
 */

import { Youtube as YoutubeIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const URL_PATTERN =
  /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/;

/** Pull the 11-char video id out of any common YouTube URL shape, or accept a bare id. */
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (ID_PATTERN.test(trimmed)) return trimmed;
  const m = trimmed.match(URL_PATTERN);
  return m ? m[1] : null;
}

interface YoutubeVariableInputProps {
  value: unknown;
  onChange: (v: string) => void;
  variableName: string;
  compact?: boolean;
}

function readString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (typeof o.url === "string") return o.url;
  }
  return "";
}

export function YoutubeVariableInput({
  value,
  onChange,
  variableName,
  compact = false,
}: YoutubeVariableInputProps) {
  const current = readString(value);
  const id = extractYoutubeId(current);
  const showWarning = current.length > 0 && !id;

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      <div className="flex items-center gap-1.5">
        <YoutubeIcon
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            id ? "text-red-500" : "text-muted-foreground",
          )}
        />
        <Input
          value={current}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://youtube.com/watch?v=… or 11-char video ID"
          aria-label={`YouTube URL for ${variableName}`}
          className="h-8 text-xs font-mono"
          style={{ fontSize: "16px" }}
        />
      </div>
      {id && (
        <p className="text-[10px] text-muted-foreground pl-5 font-mono">
          Video ID: {id}
        </p>
      )}
      {showWarning && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-5">
          Doesn’t look like a valid YouTube URL or 11-character video ID.
        </p>
      )}
    </div>
  );
}
