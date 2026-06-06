"use client";

import { useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Info,
  Loader2,
  Tag as TagIcon,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ProTextarea } from "@/components/official/ProTextarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useAppDispatch } from "@/lib/redux/hooks";
import {
  createContextItem,
  type ContextItem,
  type ContextValueType,
} from "@/features/scope-system/redux/contextItemsSlice";
import { setScopeContextValue } from "@/features/scope-system/redux/scopeValuesSlice";
import { slugifyKey } from "@/features/scope-system/utils/slugify";
import { VALUE_TYPE_CONFIG, DEFAULT_CATEGORIES } from "@/features/agent-context/constants";

interface ContextItemAddFormProps {
  scopeTypeId: string;
  labelPlural: string;
  /** When present, the optional "value for this one" field is shown and saved. */
  scopeId?: string;
  /** Called with the freshly-created item (e.g. to splice a cache placeholder). */
  onAdded?: (item: ContextItem) => void;
  /** Called when the user cancels or finishes (plain "Add"). */
  onClose: () => void;
  defaultValueType?: ContextValueType;
}

/**
 * The single inline "add a context item" form, shared by the scope-type page
 * and the scope detail page. Supports rapid entry ("Add & Next" keeps the form
 * open and refocuses) and inline advanced fields (description, category, tags)
 * behind a disclosure — all passed straight through the already-capable
 * `create_context_item` RPC.
 */
export function ContextItemAddForm({
  scopeTypeId,
  labelPlural,
  scopeId,
  onAdded,
  onClose,
  defaultValueType = "string",
}: ContextItemAddFormProps) {
  const dispatch = useAppDispatch();
  const nameRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [valueType, setValueType] = useState<ContextValueType>(defaultValueType);
  const [value, setValue] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const key = name.trim() ? slugifyKey(name) : "";

  function addTag() {
    const next = tagInput.trim().toLowerCase().replace(/\s+/g, "_");
    if (next && !tags.includes(next)) setTags([...tags, next]);
    setTagInput("");
  }
  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t));
  }

  function resetFields() {
    setName("");
    setValue("");
    setDescription("");
    setCategory("");
    setTags([]);
    setTagInput("");
    setValueType(defaultValueType);
  }

  async function submit(keepOpen: boolean) {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const item = await dispatch(
        createContextItem({
          scope_type_id: scopeTypeId,
          key: slugifyKey(trimmed) || trimmed.toLowerCase(),
          display_name: trimmed,
          value_type: valueType,
          description: description.trim() || undefined,
          category: category.trim() || undefined,
          tags: tags.length ? tags : undefined,
        }),
      ).unwrap();

      onAdded?.(item);

      if (scopeId && value.trim()) {
        await dispatch(
          setScopeContextValue({
            scope_id: scopeId,
            context_item_id: item.id,
            value_text: value.trim(),
          }),
        ).unwrap();
      }

      toast.success(`Added "${item.display_name}" to all ${labelPlural}`);

      if (keepOpen) {
        resetFields();
        // Refocus the name field for the next entry.
        requestAnimationFrame(() => nameRef.current?.focus());
      } else {
        resetFields();
        onClose();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add context item",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-amber-300 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
      <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>
          Adds a field to <strong>all {labelPlural}</strong> — define it once,
          fill in values everywhere.
        </span>
      </div>

      <div className="flex gap-2">
        <div className="flex-1 space-y-1">
          <Input
            ref={nameRef}
            autoFocus
            placeholder="e.g. Website URL"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ fontSize: "16px" }}
            disabled={busy}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit(true);
              }
              if (e.key === "Escape") onClose();
            }}
          />
          {key && (
            <p className="text-[10px] font-mono text-muted-foreground">{key}</p>
          )}
        </div>
        <Select
          value={valueType}
          onValueChange={(v) => setValueType(v as ContextValueType)}
          disabled={busy}
        >
          <SelectTrigger className="w-[130px] self-start">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(VALUE_TYPE_CONFIG) as ContextValueType[]).map((k) => (
              <SelectItem key={k} value={k}>
                {VALUE_TYPE_CONFIG[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {scopeId && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">
            Value for this one (optional)
          </Label>
          <ProTextarea
            placeholder="Leave blank to fill later"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={busy}
            minHeight={64}
            autoGrow
          />
        </div>
      )}

      {/* Advanced */}
      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        disabled={busy}
      >
        {advancedOpen ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        Advanced
        <span className="font-normal">description, category, tags</span>
      </button>

      {advancedOpen && (
        <div className="space-y-3 pt-1">
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <ProTextarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minHeight={56}
              autoGrow
              placeholder="What is this field for?"
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="e.g. Brand & Identity"
              style={{ fontSize: "16px" }}
              disabled={busy}
              list="context-item-add-category-suggestions"
            />
            <datalist id="context-item-add-category-suggestions">
              {DEFAULT_CATEGORIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                placeholder="Add tag and press Enter"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                style={{ fontSize: "16px" }}
                disabled={busy}
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTag}
                disabled={busy || !tagInput.trim()}
              >
                Add
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="text-xs gap-1 pl-2 pr-1"
                  >
                    <TagIcon className="h-2.5 w-2.5" />
                    <code className="font-mono">{t}</code>
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="hover:bg-muted-foreground/10 rounded p-0.5"
                      aria-label="Remove tag"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClose}
          disabled={busy}
        >
          Cancel
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => submit(true)}
          disabled={busy || !name.trim()}
        >
          {busy && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          Add &amp; next
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => submit(false)}
          disabled={busy || !name.trim()}
        >
          Add
        </Button>
      </div>
    </div>
  );
}
