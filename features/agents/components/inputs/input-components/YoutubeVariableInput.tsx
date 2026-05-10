"use client";

/**
 * YoutubeVariableInput
 *
 * The agent template's youtube_video block typically interpolates the ID
 * into a fixed URL shape, e.g.:
 *
 *   { type: "youtube_video", url: "https://youtube.com/watch?v={{youtube_id}}" }
 *
 * If the variable held a full URL, the substituted result would be
 * "...?v=https://youtube.com/watch?v=abc12345678" — broken. So this input
 * normalizes any user input to the bare 11-char video ID. Whatever the user
 * pastes — full URL with `?si=...` tracking params, /shorts/, /embed/,
 * youtu.be — gets reduced to the ID. If we can't extract one, we keep the
 * raw text so the user can see what they typed and fix it.
 */

import { Youtube as YoutubeIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/**
 * Pull the 11-char video id out of any common YouTube URL shape, or accept
 * a bare id. URL parsing is preferred (handles ?si=, &t=, and other query
 * params robustly); regex is a fallback for edge cases.
 */
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (ID_PATTERN.test(trimmed)) return trimmed;

  // Try URL parsing first.
  try {
    const normalized = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    const u = new URL(normalized);

    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.slice(1).split("/")[0];
      if (id && ID_PATTERN.test(id)) return id;
    }

    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v && ID_PATTERN.test(v)) return v;

      if (u.pathname.startsWith("/embed/")) {
        const id = u.pathname.split("/embed/")[1]?.split("?")[0];
        if (id && ID_PATTERN.test(id)) return id;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/shorts/")[1]?.split("?")[0];
        if (id && ID_PATTERN.test(id)) return id;
      }
    }
  } catch {
    // fall through to regex
  }

  // Regex fallback for anything URL-parsing missed.
  const m = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
  );
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
  const stored = readString(value);
  const id = extractYoutubeId(stored);
  // Show a warning only when the user typed something that isn't recognizable
  // AND isn't already the canonical ID. Empty input shows nothing.
  const showWarning = stored.length > 0 && !id;

  // Auto-normalize: if the input parses to a YouTube ID, store the ID.
  // Otherwise store whatever the user typed verbatim so they can see /
  // correct it. Once a recognizable URL is pasted, the input flips to the
  // 11-char ID immediately.
  const handleChange = (raw: string) => {
    const extracted = extractYoutubeId(raw);
    onChange(extracted ?? raw);
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
          value={stored}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Paste any YouTube URL or 11-char video ID"
          aria-label={`YouTube URL for ${variableName}`}
          className="h-8 text-xs font-mono"
          style={{ fontSize: "16px" }}
        />
      </div>
      {id && stored !== id && (
        <p className="text-[10px] text-muted-foreground pl-5">
          Saved as video ID: <span className="font-mono">{id}</span>
        </p>
      )}
      {id && stored === id && (
        <p className="text-[10px] text-muted-foreground pl-5 font-mono">
          Video ID
        </p>
      )}
      {showWarning && (
        <p className="text-[10px] text-amber-600 dark:text-amber-400 pl-5">
          Doesn’t look like a YouTube URL or 11-character video ID yet — keep
          typing or paste a link.
        </p>
      )}
    </div>
  );
}
