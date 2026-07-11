"use client";

/**
 * features/scopes/components/reference/ReferenceValuePicker.tsx
 *
 * THE canonical way to author a `value_type="reference"` cell. Renders the
 * current selection as chips (via the item's display hints) and an "Add"
 * popover constrained by the item's `allowed_reference_types` + `max_items`
 * (+ `allowed_scope_type_ids` when `scope` is allowed). Emits a full
 * ```matrx reference fence string (or `null` when cleared) — never a bare id.
 *
 * One sub-picker per reference type, added here as the taxonomy grows:
 *   - `file`   → the canonical file browser (`useFilePicker`)
 *   - `url`    → a plain URL + optional label form (no Matrx-owned id)
 *   - `scope`  → the org's scope tree, filtered by `allowed_scope_type_ids`
 *   - default  → `useUniversalEntitySearch` for any other listable
 *                `EntityTypeToken` (task, note, project, agent, app, …)
 */

import { useEffect, useMemo, useState } from "react";
import { FileText, Link2, Loader2, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/utils/cn";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useFilePicker } from "@/features/files/components/pickers/FilePicker";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  makeSelectScope,
  makeSelectScopeTypesForOrg,
} from "@/features/scopes/redux/selectors/tree";
import { useUniversalEntitySearch } from "@/features/scopes/hooks/useUniversalEntitySearch";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { fetchEntityTitles } from "@/features/scopes/service/entityTitles";
import { referenceFallbackLabel } from "@/features/matrx-envelope/referenceResolvers";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import {
  buildReferenceCellValue,
  parseReferenceCellValue,
  referenceTypeLabel,
  type ReferenceItemConfig,
} from "@/features/scopes/utils/referenceCell";

export interface ReferenceValuePickerProps {
  config: ReferenceItemConfig;
  /** The cell's raw `value_text` (a ```matrx fence), or null when unset. */
  value: string | null;
  onChange: (nextFenceOrNull: string | null) => void;
  /** The scope this cell lives on — resolves the org for the `scope` picker. */
  scopeId: string;
  disabled?: boolean;
  className?: string;
}

const typeLabel = referenceTypeLabel;

export function ReferenceValuePicker({
  config,
  value,
  onChange,
  scopeId,
  disabled,
  className,
}: ReferenceValuePickerProps) {
  const allowedTypes = config.allowed_reference_types ?? [];
  const parsed = parseReferenceCellValue(value);
  const currentType = parsed?.type ?? null;
  const items = parsed?.items ?? [];
  const remaining = Math.max(0, config.max_items - items.length);
  const canAddMore = remaining > 0 && allowedTypes.length > 0;

  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<string>(
    currentType ?? allowedTypes[0] ?? "",
  );

  useEffect(() => {
    if (!allowedTypes.includes(addType) && allowedTypes[0]) {
      setAddType(currentType ?? allowedTypes[0]);
    }
    // Only re-sync when the allowed set itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowedTypes.join(","), currentType]);

  function addItems(type: string, newItems: ReferenceItem[]) {
    if (newItems.length === 0) return;
    // A cell carries exactly one `type` at a time — switching type when items
    // already exist replaces them, matching the fence's single `type` field.
    const base = type === currentType ? items : [];
    const capacity = config.max_items - base.length;
    if (capacity <= 0) return;
    const next = [...base, ...newItems.slice(0, capacity)];
    onChange(buildReferenceCellValue(type, next));
  }

  function removeItem(index: number) {
    if (!currentType) return;
    const next = items.filter((_, i) => i !== index);
    onChange(
      next.length > 0 ? buildReferenceCellValue(currentType, next) : null,
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((item, i) => (
            <li key={i}>
              <PickerChip
                item={item}
                type={currentType ?? ""}
                onRemove={disabled ? undefined : () => removeItem(i)}
              />
            </li>
          ))}
        </ul>
      )}

      {!disabled && canAddMore && (
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Add {typeLabel(addType || allowedTypes[0])}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-2" align="start">
            {allowedTypes.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {allowedTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAddType(t)}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                      addType === t
                        ? "border-primary/50 bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            )}
            <ReferenceTypeAdder
              type={addType || allowedTypes[0] || ""}
              scopeId={scopeId}
              allowedScopeTypeIds={config.allowed_scope_type_ids}
              onPickMany={(picked) => {
                addItems(addType || allowedTypes[0] || "", picked);
                if (remaining - picked.length <= 0) setAddOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>
      )}

      {!disabled && !canAddMore && items.length > 0 && (
        <p className="text-[11px] text-muted-foreground">
          Max {config.max_items} item{config.max_items === 1 ? "" : "s"}{" "}
          reached.
        </p>
      )}

      {allowedTypes.length === 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          No reference types configured for this item yet — edit the item
          definition to allow at least one.
        </p>
      )}
    </div>
  );
}

// ─── Selected-item chip (with remove) ──────────────────────────────────────

function PickerChip({
  item,
  type,
  onRemove,
}: {
  item: ReferenceItem;
  type: string;
  onRemove?: () => void;
}) {
  const hints = item as unknown as { url?: string; label?: string };
  const label =
    type === "url" && hints.url && !hints.label
      ? hints.url
      : referenceFallbackLabel(item, type);
  const Icon = type === "url" ? Link2 : type === "file" ? FileText : null;

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-sm text-foreground">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{label}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Remove"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

// ─── Per-type "add" sub-picker ──────────────────────────────────────────────

function ReferenceTypeAdder({
  type,
  scopeId,
  allowedScopeTypeIds,
  onPickMany,
}: {
  type: string;
  scopeId: string;
  allowedScopeTypeIds: string[] | null;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  if (!type) return null;
  if (type === "file") return <FileTypeAdder onPickMany={onPickMany} />;
  if (type === "url") return <UrlTypeAdder onPickMany={onPickMany} />;
  if (type === "scope") {
    return (
      <ScopeTypeAdder
        scopeId={scopeId}
        allowedScopeTypeIds={allowedScopeTypeIds}
        onPickMany={onPickMany}
      />
    );
  }
  return <RecordTypeAdder type={type} onPickMany={onPickMany} />;
}

function FileTypeAdder({
  onPickMany,
}: {
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const { open, element } = useFilePicker();
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const ids = await open({ multi: true, title: "Choose file(s)" });
            if (ids && ids.length > 0) {
              const titles = await fetchEntityTitles("file", ids);
              onPickMany(
                ids.map(
                  (id) =>
                    ({
                      file_id: id,
                      ...(titles.get(id) ? { label: titles.get(id) } : {}),
                    }) as unknown as ReferenceItem,
                ),
              );
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <FileText className="mr-1.5 h-3.5 w-3.5" />
        )}
        Browse files
      </Button>
      {element}
    </div>
  );
}

function isLikelyUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function UrlTypeAdder({
  onPickMany,
}: {
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const valid = isLikelyUrl(url.trim());

  return (
    <div className="space-y-2">
      <Input
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{ fontSize: "16px" }}
      />
      <Input
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={{ fontSize: "16px" }}
      />
      <Button
        type="button"
        size="sm"
        className="w-full"
        disabled={!valid}
        onClick={() => {
          const item: Record<string, string> = { url: url.trim() };
          const l = label.trim();
          if (l) item.label = l;
          onPickMany([item as unknown as ReferenceItem]);
          setUrl("");
          setLabel("");
        }}
      >
        <Link2 className="mr-1.5 h-3.5 w-3.5" />
        Add link
      </Button>
    </div>
  );
}

function ScopeTypeAdder({
  scopeId,
  allowedScopeTypeIds,
  onPickMany,
}: {
  scopeId: string;
  allowedScopeTypeIds: string[] | null;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const dispatch = useAppDispatch();
  const [search, setSearch] = useState("");

  useEffect(() => {
    void dispatch(ensureScopeTree());
  }, [dispatch]);

  const selectScope = useMemo(() => makeSelectScope(), []);
  const scope = useAppSelector((s) => selectScope(s, scopeId));
  const orgId = scope?.organization_id ?? null;

  const selectScopeTypesForOrg = useMemo(
    () => makeSelectScopeTypesForOrg(),
    [],
  );
  const scopeTypes = useAppSelector((s) => selectScopeTypesForOrg(s, orgId));

  const candidates = useMemo(() => {
    const allow =
      allowedScopeTypeIds && allowedScopeTypeIds.length > 0
        ? new Set(allowedScopeTypeIds)
        : null;
    const out: Array<{ id: string; name: string; typeLabel: string }> = [];
    for (const t of scopeTypes) {
      if (allow && !allow.has(t.id)) continue;
      for (const s of t.scopes) {
        out.push({ id: s.id, name: s.name, typeLabel: t.label_singular });
      }
    }
    const q = search.trim().toLowerCase();
    return q ? out.filter((c) => c.name.toLowerCase().includes(q)) : out;
  }, [scopeTypes, allowedScopeTypeIds, search]);

  if (!orgId) {
    return (
      <p className="px-1 py-2 text-xs text-muted-foreground">
        Loading organization…
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search scopes…"
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
      </div>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {candidates.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No scopes found.
          </p>
        )}
        {candidates.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() =>
              onPickMany([
                { id: c.id, label: c.name } as unknown as ReferenceItem,
              ])
            }
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <span className="truncate text-foreground">{c.name}</span>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
              {c.typeLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function RecordTypeAdder({
  type,
  onPickMany,
}: {
  type: string;
  onPickMany: (items: ReferenceItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const token = type as EntityTypeToken;
  const info = getEntityInfo(token);
  const { results, loading } = useUniversalEntitySearch({
    query,
    tokens: [token],
    perTokenLimit: 20,
  });

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${info.labelPlural.toLowerCase()}…`}
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="max-h-56 space-y-0.5 overflow-y-auto">
        {results.length === 0 && !loading && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {query.trim()
              ? "No matches."
              : `Type to search ${info.labelPlural.toLowerCase()}.`}
          </p>
        )}
        {results.map((c) => (
          <button
            key={`${c.token}:${c.id}`}
            type="button"
            onClick={() =>
              onPickMany([
                { id: c.id, label: c.title } as unknown as ReferenceItem,
              ])
            }
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <info.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">{c.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default ReferenceValuePicker;
