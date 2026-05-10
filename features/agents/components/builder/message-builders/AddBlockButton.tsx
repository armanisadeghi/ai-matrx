"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Plus,
  Image as ImageIcon,
  Music,
  Video,
  Youtube,
  FileText,
  X,
  Check,
  Pencil,
  Eye,
  Tag,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { HighlightedText } from "@/features/agents/components/variables-management/HighlightedText";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Upload } from "lucide-react";
import { useOpenImageUploaderWindow } from "@/features/window-panels/windows/image/useOpenImageUploaderWindow";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlockType =
  | "image"
  | "audio"
  | "video"
  | "youtube_video"
  | "document";

interface FieldConfig {
  key: string;
  label: string;
  placeholder: string;
}

interface BlockTypeConfig {
  type: BlockType;
  label: string;
  icon: React.ReactNode;
  fields: FieldConfig[];
}

const BLOCK_TYPES: BlockTypeConfig[] = [
  {
    type: "image",
    label: "Image",
    icon: <ImageIcon className="w-3.5 h-3.5" />,
    fields: [
      {
        key: "url",
        label: "Image URL or {{variable}}",
        placeholder: "https://example.com/image.png",
      },
    ],
  },
  {
    type: "audio",
    label: "Audio",
    icon: <Music className="w-3.5 h-3.5" />,
    fields: [
      {
        key: "url",
        label: "Audio URL or {{variable}}",
        placeholder: "https://example.com/audio.mp3",
      },
    ],
  },
  {
    type: "video",
    label: "Video",
    icon: <Video className="w-3.5 h-3.5" />,
    fields: [
      {
        key: "url",
        label: "Video URL or {{variable}}",
        placeholder: "https://example.com/video.mp4",
      },
    ],
  },
  {
    type: "youtube_video",
    label: "YouTube",
    icon: <Youtube className="w-3.5 h-3.5 text-red-500" />,
    fields: [
      {
        key: "url",
        label: "",
        placeholder:
          "Full URL or {{variable}} or https://www.youtube.com/watch?v={{variable}}",
      },
    ],
  },
  {
    type: "document",
    label: "Document",
    icon: <FileText className="w-3.5 h-3.5" />,
    fields: [
      {
        key: "url",
        label: "Document URL or {{variable}}",
        placeholder: "https://example.com/document.pdf",
      },
      {
        key: "mime_type",
        label: "MIME type or {{variable}}",
        placeholder: "application/pdf",
      },
    ],
  },
];

function getConfig(type: string): BlockTypeConfig | undefined {
  return BLOCK_TYPES.find((c) => c.type === type);
}

// ---------------------------------------------------------------------------
// MetadataPair[] <-> Record<string, unknown> helpers
// ---------------------------------------------------------------------------
//
// The block-shape stores metadata as Record<string, unknown>; the editor
// works with an ordered list so users can edit pairs without keys colliding
// while typing. Empty rows are pruned at confirm time.

interface MetadataPair {
  key: string;
  value: string;
}

function metadataToPairs(
  metadata: Record<string, unknown> | undefined,
): MetadataPair[] {
  if (!metadata) return [];
  return Object.entries(metadata).map(([key, value]) => ({
    key,
    value:
      typeof value === "string"
        ? value
        : value === null || value === undefined
          ? ""
          : JSON.stringify(value),
  }));
}

function pairsToMetadata(
  pairs: MetadataPair[],
): Record<string, unknown> | undefined {
  const out: Record<string, unknown> = {};
  for (const { key, value } of pairs) {
    const k = key.trim();
    if (!k) continue;
    out[k] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

interface MetadataEditorProps {
  pairs: MetadataPair[];
  onChange: (next: MetadataPair[]) => void;
}

function MetadataEditor({ pairs, onChange }: MetadataEditorProps) {
  const updatePair = (i: number, patch: Partial<MetadataPair>) => {
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)));
  };

  const removePair = (i: number) => {
    onChange(pairs.filter((_, idx) => idx !== i));
  };

  const addPair = () => {
    onChange([...pairs, { key: "", value: "" }]);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wide">
        <Tag className="w-3 h-3" />
        <span>Metadata (optional)</span>
      </div>
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            value={p.key}
            onChange={(e) => updatePair(i, { key: e.target.value })}
            placeholder="key"
            className="h-6 text-[11px] font-mono flex-1"
          />
          <Input
            value={p.value}
            onChange={(e) => updatePair(i, { value: e.target.value })}
            placeholder="value"
            className="h-6 text-[11px] font-mono flex-[2]"
          />
          <button
            type="button"
            onClick={() => removePair(i)}
            className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors"
            title="Remove metadata pair"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addPair}
        className="self-start flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        <Plus className="w-3 h-3" />
        Add metadata
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockEditor — shared form for add + edit
// ---------------------------------------------------------------------------

interface BlockEditorProps {
  /** null = adding new; string = type of existing block being edited */
  blockType: BlockType | null;
  /** Current field values (for edit mode) */
  initialValues?: Record<string, unknown>;
  onConfirm: (block: Record<string, unknown>) => void;
  onCancel: () => void;
  onSelectType?: (type: BlockType) => void;
  isEdit?: boolean;
}

export function BlockEditor({
  blockType,
  initialValues = {},
  onConfirm,
  onCancel,
  onSelectType,
  isEdit = false,
}: BlockEditorProps) {
  const config = blockType ? getConfig(blockType) : null;
  const [values, setValues] = useState<Record<string, string>>(
    config
      ? Object.fromEntries(
          config.fields.map((f) => {
            const v = initialValues[f.key];
            return [f.key, typeof v === "string" ? v : ""];
          }),
        )
      : {},
  );
  const [metadataPairs, setMetadataPairs] = useState<MetadataPair[]>(
    () => metadataToPairs(initialValues.metadata as Record<string, unknown> | undefined),
  );
  const openImageUploader = useOpenImageUploaderWindow();

  const handleConfirm = () => {
    if (!config) return;
    const primaryValue = values[config.fields[0].key]?.trim();
    if (!primaryValue) return;
    const block: Record<string, unknown> = { type: config.type };
    config.fields.forEach(({ key }) => {
      const v = values[key]?.trim();
      if (v) block[key] = v;
    });
    const meta = pairsToMetadata(metadataPairs);
    if (meta) block.metadata = meta;
    onConfirm(block);
  };

  const setValue = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Type selection step
  if (!config) {
    return (
      <div className="flex flex-col gap-1.5 p-2 rounded-lg border border-border bg-muted/40">
        <div className="flex items-center justify-between mb-0.5">
          <span className="text-xs font-medium">Add content block</span>
          <button
            onClick={onCancel}
            className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-1">
          {BLOCK_TYPES.map((bt) => (
            <button
              key={bt.type}
              onClick={() => onSelectType?.(bt.type)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs hover:bg-accent transition-colors text-left border border-transparent hover:border-border"
            >
              {bt.icon}
              {bt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const primaryValue = values[config.fields[0].key]?.trim();

  return (
    <div className="flex flex-col gap-2 p-2 rounded-lg border border-border bg-muted/40">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          {config.icon}
          <span>{isEdit ? `Edit ${config.label}` : `Add ${config.label}`}</span>
        </div>
        <button
          onClick={onCancel}
          className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {config.fields.map(({ key, label, placeholder }) => {
        const showImageUpload = config.type === "image" && key === "url";
        return (
          <div key={key} className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="flex items-center gap-1">
              <Input
                autoFocus={key === config.fields[0].key}
                value={values[key] ?? ""}
                onChange={(e) => setValue(key, e.target.value)}
                placeholder={placeholder}
                className="h-7 text-xs font-mono flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                  if (e.key === "Escape") onCancel();
                }}
              />
              {showImageUpload && (
                <button
                  type="button"
                  onClick={() =>
                    openImageUploader({
                      preset: "social",
                      title: "Upload image for block",
                      currentUrl: values[key] ?? null,
                      folder: "agent-blocks",
                      onUploaded: (e) => setValue(key, e.result.primary_url),
                      onCleared: () => setValue(key, ""),
                    })
                  }
                  className="shrink-0 h-7 px-2 text-xs rounded-md border border-border hover:bg-accent transition-colors flex items-center gap-1"
                  title="Upload an image (auto-resized)"
                >
                  <Upload className="w-3 h-3" />
                  Upload
                </button>
              )}
            </div>
          </div>
        );
      })}

      <MetadataEditor pairs={metadataPairs} onChange={setMetadataPairs} />

      <div className="flex items-center justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs px-2"
          onClick={onCancel}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-6 text-xs px-2"
          onClick={handleConfirm}
          disabled={!primaryValue}
        >
          <Check className="w-3 h-3 mr-1" />
          {isEdit ? "Save" : "Add"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BlockRow — full-width display row for a single non-text block
// ---------------------------------------------------------------------------

interface BlockRowProps {
  block: Record<string, unknown>;
  onEdit: () => void;
  onRemove: () => void;
  validVariables?: string[];
}

export function BlockRow({
  block,
  onEdit,
  onRemove,
  validVariables = [],
}: BlockRowProps) {
  const [open, setOpen] = useState(false);
  const type = (block.type as string) || "unknown";
  const config = getConfig(type as BlockType);
  const icon = config?.icon ?? <AlertTriangle className="w-3.5 h-3.5" />;
  const label = config?.label ?? `Unsupported: ${type}`;

  // Fields that have values
  const fieldRows =
    config?.fields
      .map(({ key, label: fieldLabel }) => {
        const val = block[key] as string | undefined;
        if (!val) return null;
        return { key, label: fieldLabel.replace(/ or \{\{.*?\}\}/, ""), val };
      })
      .filter(Boolean) ?? [];

  if (!config) {
    return (
      <>
        <div className="flex flex-col gap-0.5 w-full px-2 py-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs group/row">
          <div className="flex items-center gap-2">
            <span className="shrink-0">{icon}</span>
            <span className="font-medium shrink-0">{label}</span>
            <div className="flex items-center gap-0.5 shrink-0 ml-auto opacity-0 group-hover/row:opacity-100 transition-opacity">
              <button
                onClick={() => setOpen(true)}
                className="p-1 rounded hover:text-foreground hover:bg-amber-500/20 transition-colors cursor-pointer"
                title="Inspect JSON"
              >
                <Eye className="w-3 h-3" />
              </button>
              <button
                onClick={onRemove}
                className="p-1 rounded hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                title="Remove"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-2xl bg-background border border-border">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Unsupported block type:{" "}
                <code className="font-mono">{type}</code>
              </DialogTitle>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              This block type is preserved in the agent definition and will be
              sent to the API unchanged. Editing is not supported.
            </p>
            <ScrollArea className="max-h-[60vh] rounded-md border border-border bg-muted/50">
              <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">
                {JSON.stringify(block, null, 2)}
              </pre>
            </ScrollArea>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  const isImage = type === "image";
  const imgUrl = (block.url as string) || "";
  const showThumbnail =
    isImage &&
    imgUrl &&
    (imgUrl.startsWith("http") || imgUrl.startsWith("data:"));

  const metadata = block.metadata as Record<string, unknown> | undefined;
  const metadataCount =
    metadata && typeof metadata === "object" ? Object.keys(metadata).length : 0;

  return (
    <div className="flex flex-col gap-0.5 w-full px-2 py-1.5 rounded-md border border-border bg-card text-xs group/row">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="font-medium shrink-0">{label}</span>
        {metadataCount > 0 && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 shrink-0 inline-flex items-center gap-0.5"
            title={`${metadataCount} metadata field${metadataCount === 1 ? "" : "s"}: ${Object.keys(metadata!).join(", ")}`}
          >
            <Tag className="w-2.5 h-2.5" />
            {metadataCount}
          </span>
        )}
        <div className="flex items-center gap-0.5 shrink-0 ml-auto opacity-0 group-hover/row:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title="Edit"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={onRemove}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {showThumbnail && (
        <div className="pl-5 pt-1 pb-1.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imgUrl}
            alt="Attached image"
            className="h-16 w-auto max-w-[150px] rounded border border-border object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {fieldRows.map(
        (f) =>
          f && (
            <div
              key={f.key}
              className="flex gap-1.5 pl-5 font-mono text-[10px] leading-snug"
            >
              <span className="text-muted-foreground shrink-0">{f.label}:</span>
              <span className="truncate">
                <HighlightedText text={f.val} validVariables={validVariables} />
              </span>
            </div>
          ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddBlockTrigger — the "+" dropdown that lives inside the icon button row
// ---------------------------------------------------------------------------

interface AddBlockTriggerProps {
  onSelectType: (type: BlockType) => void;
}

export function AddBlockTrigger({ onSelectType }: AddBlockTriggerProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center justify-center w-6 h-6 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          title="Add content block"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        {BLOCK_TYPES.map((bt) => (
          <DropdownMenuItem
            key={bt.type}
            onClick={() => onSelectType(bt.type)}
            className="text-xs gap-2"
          >
            {bt.icon}
            {bt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------------------------------------------------------------------
// BlockList — renders all non-text blocks with edit + remove, plus add editor
// ---------------------------------------------------------------------------

interface BlockListProps {
  blocks: Record<string, unknown>[];
  onUpdateBlock: (index: number, block: Record<string, unknown>) => void;
  onRemoveBlock: (index: number) => void;
  onAddBlock: (block: Record<string, unknown>) => void;
  /** Controlled from the header button — set to a BlockType to open editor */
  pendingAddType?: BlockType | null;
  onPendingAddTypeClear?: () => void;
  validVariables?: string[];
}

export function BlockList({
  blocks,
  onUpdateBlock,
  onRemoveBlock,
  onAddBlock,
  pendingAddType,
  onPendingAddTypeClear,
  validVariables = [],
}: BlockListProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const cancelAdd = () => {
    onPendingAddTypeClear?.();
  };

  const handleAdded = (block: Record<string, unknown>) => {
    onAddBlock(block);
    onPendingAddTypeClear?.();
  };

  const handleUpdated = (block: Record<string, unknown>) => {
    if (editingIndex === null) return;
    onUpdateBlock(editingIndex, block);
    setEditingIndex(null);
  };

  if (blocks.length === 0 && !pendingAddType) return null;

  return (
    <div className="flex flex-col gap-1 w-full">
      {blocks.map((block, i) =>
        editingIndex === i ? (
          <BlockEditor
            key={i}
            blockType={block.type as BlockType}
            initialValues={block}
            onConfirm={handleUpdated}
            onCancel={() => setEditingIndex(null)}
            isEdit
          />
        ) : (
          <BlockRow
            key={i}
            block={block}
            onEdit={() => setEditingIndex(i)}
            onRemove={() => onRemoveBlock(i)}
            validVariables={validVariables}
          />
        ),
      )}

      {/* Add editor — only shown when triggered from the header + button */}
      {pendingAddType != null && (
        <BlockEditor
          blockType={pendingAddType}
          onConfirm={handleAdded}
          onCancel={cancelAdd}
        />
      )}
    </div>
  );
}
