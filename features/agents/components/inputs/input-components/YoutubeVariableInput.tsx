"use client";

/**
 * YoutubeVariableInput
 *
 * YouTube has no upload flow — the user pastes a URL or video ID. We
 * normalize to a full URL and validate lightly. Value shape mirrors
 * MediaRef ({ url }) for consistency with the other media inputs.
 */

import { Youtube as YoutubeIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { MediaRef } from "@/features/files/types";

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
  onChange: (v: MediaRef | null) => void;
  variableName: string;
  compact?: boolean;
}

function readUrl(value: unknown): string {
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
  const current = readUrl(value);
  const id = extractYoutubeId(current);
  const showWarning = current.length > 0 && !id;

  const handleChange = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      onChange(null);
      return;
    }
    onChange({ url: trimmed });
  };

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
          onChange={(e) => handleChange(e.target.value)}
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
