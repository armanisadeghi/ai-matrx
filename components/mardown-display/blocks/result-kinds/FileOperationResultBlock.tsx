"use client";

/**
 * `file_operation_result` — the ONE renderer for the FILE + DIRECTORY kinds:
 * `file_read_result`, `file_write_result`, `file_edit_result`,
 * `file_edit_applied`, `file_edit_failure`, `file_patch_result`,
 * `file_search_results`, `file_search_match`, `file_discovery_result`,
 * `file_tree_result`, `directory_listing`, `directory_entry`,
 * `directory_create_result`, `file_text_content`, `file_binary_content`,
 * `file_download_result`, `file_upload_result`, `uploaded_asset`.
 *
 * THE READER'S QUESTION: *which file, and what happened to it?*
 * Every kind here is anchored to a path or a file identity, and the floor
 * renders that path as one grey row among fifteen — so the single fact the
 * reader needs is the hardest one to find. Here the path IS the headline:
 * monospace, middle-truncated so both the directory and the filename survive,
 * copyable, with the outcome (created / replaced N / N bytes / truncated) as
 * chips beside it.
 *
 * 🚨 Truncation is never silent. `truncated`, `next_offset`, and a
 * `size_before → size_after` shrink each get their own visible chip, because a
 * half-read file that looks whole is the failure mode of this entire family.
 *
 * File CONTENT renders in a bounded monospace region rather than through the
 * markdown renderer: a source file is not prose, and running it through a
 * prose renderer eats its indentation. `CodeBlock` is deliberately NOT used —
 * it is lazy-loaded to break a Redux import cycle
 * (`BlockComponentRegistry.tsx`), and reaching around that from a block would
 * re-create the cycle this component sits inside.
 *
 * See `result-kind-shared.tsx` for the route contract and the Inventory Law
 * survey this component is bound by.
 */

import React from "react";
import {
  CircleX,
  FilePlus2,
  FileText,
  Folder,
  FolderTree,
  Scissors,
  Upload,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { ResultValue } from "@/features/tool-call-visualization/result-fields/ResultValue";
import { humanizeKey } from "@/features/tool-call-visualization/result-fields/shape";
import {
  ChipRow,
  CopyValueButton,
  CountChip,
  LeftoverFields,
  MetaStrip,
  RawRegion,
  Section,
  StateChip,
  StillArriving,
  isRecord,
  kindLabel,
  readBool,
  readKindValue,
  readNumber,
  readText,
  type ResultKindBlockProps,
} from "./result-kind-shared";

/** Where the path lives, in the priority these kinds carry one. */
const PATH_KEYS = [
  "path",
  "local_path",
  "file_path",
  "created",
  "original_filename",
  "primary_key",
  "name",
] as const;

/** Collections these kinds carry, in reading order. */
const COLLECTION_KEYS = [
  "entries",
  "results",
  "files",
  "matches",
  "edits_applied",
  "edits_failed",
] as const;

/** Byte / character counters, with the tone that says what they mean. */
const COUNTERS: ReadonlyArray<{ key: string; label: string; tone: "neutral" | "good" | "accent" }> = [
  { key: "count", label: "found", tone: "accent" },
  { key: "file_count", label: "files", tone: "accent" },
  { key: "replaced", label: "replaced", tone: "good" },
  { key: "matches_replaced", label: "replaced", tone: "good" },
  { key: "bytes_written", label: "bytes written", tone: "good" },
  { key: "bytes_read", label: "bytes read", tone: "neutral" },
  { key: "old_str_count", label: "occurrences", tone: "neutral" },
];

/** 1_234_567 → "1.2 MB". Bytes are unreadable; sizes are the point. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Middle-truncate so BOTH ends survive: a reader needs the filename AND enough
 * directory to know which of the four `index.ts` files this is. CSS ellipsis
 * can only eat one end, which is why this is done in JS.
 */
function middleTruncate(path: string, max = 72): string {
  if (path.length <= max) return path;
  const head = Math.ceil((max - 1) / 2);
  const tail = Math.floor((max - 1) / 2);
  return `${path.slice(0, head)}…${path.slice(path.length - tail)}`;
}

const FileOperationResultBlock: React.FC<ResultKindBlockProps> = ({
  content,
  metadata,
  className,
}) => {
  const { value, recovered, kind, streaming } = readKindValue(content, metadata);
  if (!recovered || !isRecord(value)) {
    return <RawRegion content={content} className={className} />;
  }

  const pathKey = PATH_KEYS.find((key) => readText(value[key]) !== null);
  const path = pathKey ? (readText(value[pathKey]) as string) : null;
  const isDir = readBool(value.is_dir) === true || Array.isArray(value.entries);

  const sizeBefore = readNumber(value.size_before);
  const sizeAfter = readNumber(value.size_after);
  const size =
    readNumber(value.size) ?? readNumber(value.size_bytes) ?? readNumber(value.byte_size);
  const truncated = readBool(value.truncated) === true;
  const nextOffset = readNumber(value.next_offset);
  const created = readBool(value.created) === true || pathKey === "created";
  const isNew = readBool(value.is_new);
  const mode = readText(value.mode);
  const mimeType = readText(value.mime_type);
  const reason = readText(value.reason);

  const counters = COUNTERS.map((counter) => ({
    ...counter,
    count: readNumber(value[counter.key]),
  })).filter((counter) => counter.count !== null);

  const collections = COLLECTION_KEYS.filter(
    (key) => Array.isArray(value[key]) && (value[key] as unknown[]).length > 0,
  );

  // File BODY, in the priority these kinds carry one. `data_b64` is
  // deliberately absent: base64 bytes are not readable content, and the meta
  // strip already reports how many arrived.
  const body =
    readText(value.content) ?? readText(value.text) ?? readText(value.tree) ?? null;
  const bodyKey = readText(value.content)
    ? "content"
    : readText(value.text)
      ? "text"
      : readText(value.tree)
        ? "tree"
        : null;

  const shown = [
    ...(pathKey ? [pathKey] : []),
    ...(bodyKey ? [bodyKey] : []),
    ...COLLECTION_KEYS,
    ...COUNTERS.map((counter) => counter.key),
    "is_dir",
    "size",
    "size_bytes",
    "byte_size",
    "size_before",
    "size_after",
    "truncated",
    "next_offset",
    "created",
    "is_new",
    "mode",
    "mime_type",
    "reason",
    "data_b64",
  ];

  const HeadIcon = isDir
    ? readText(value.tree)
      ? FolderTree
      : Folder
    : created
      ? FilePlus2
      : pathKey === "primary_key" || value.file_id !== undefined
        ? Upload
        : FileText;

  return (
    <div className={cn("my-2 min-w-0 space-y-3", className)}>
      {streaming ? <StillArriving /> : null}

      <div className="flex min-w-0 items-center gap-1.5">
        <HeadIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
        {path ? (
          <>
            <span
              className="min-w-0 break-all font-mono text-sm text-foreground"
              title={path}
            >
              {middleTruncate(path)}
            </span>
            <CopyValueButton text={path} what="path" />
          </>
        ) : (
          <span className="text-sm font-medium text-foreground">
            {kindLabel(kind) || "File operation"}
          </span>
        )}
      </div>

      <ChipRow>
        {created ? <StateChip label="created" tone="good" /> : null}
        {isNew === false ? <StateChip label="already existed" tone="neutral" /> : null}
        {reason ? (
          <StateChip
            label={reason}
            tone="bad"
            icon={<CircleX className="h-3.5 w-3.5 shrink-0" />}
          />
        ) : null}
        {counters.map((counter) => (
          <CountChip
            key={counter.key}
            value={
              counter.key.startsWith("bytes")
                ? formatBytes(counter.count as number)
                : (counter.count as number)
            }
            label={counter.key.startsWith("bytes") ? counter.label.replace("bytes ", "") : counter.label}
            tone={counter.tone}
          />
        ))}
        {sizeBefore !== null && sizeAfter !== null ? (
          <StateChip
            label={`${formatBytes(sizeBefore)} → ${formatBytes(sizeAfter)}`}
            tone={sizeAfter < sizeBefore ? "warn" : "neutral"}
          />
        ) : size !== null ? (
          <StateChip label={formatBytes(size)} />
        ) : null}
        {mimeType ? <StateChip label={mimeType} /> : null}
        {mode ? <StateChip label={mode} /> : null}
        {/* Truncation is the failure mode of this family — it is never a
            footnote. */}
        {truncated ? (
          <StateChip
            label={
              nextOffset !== null
                ? `truncated — resume at ${nextOffset.toLocaleString()}`
                : "truncated"
            }
            tone="warn"
            icon={<Scissors className="h-3.5 w-3.5 shrink-0" />}
          />
        ) : null}
      </ChipRow>

      {body !== null ? (
        <Section
          label={bodyKey === "tree" ? "Tree" : "Contents"}
          trailing={<CopyValueButton text={body} what="contents" />}
        >
          <pre className="max-h-96 min-w-0 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs leading-relaxed text-foreground">
            {body}
          </pre>
        </Section>
      ) : null}

      {collections.map((key) => (
        <Section key={key} label={humanizeKey(key)}>
          <ResultValue value={value[key]} density="full" />
        </Section>
      ))}

      {/* `file_edit_failure` shows the text it could not find — without it the
          reader cannot tell WHY the edit missed. */}
      {readText(value.old_text_preview) ? (
        <Section label="Text it looked for">
          <pre className="max-h-48 min-w-0 overflow-auto rounded-md border border-destructive/30 bg-destructive/5 p-3 font-mono text-xs leading-relaxed text-foreground">
            {readText(value.old_text_preview)}
          </pre>
        </Section>
      ) : null}

      <MetaStrip value={value} omit={[...shown, "old_text_preview"]} />
      <LeftoverFields value={value} omit={[...shown, "old_text_preview"]} />
    </div>
  );
};

export default FileOperationResultBlock;
