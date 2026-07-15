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

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useFilePicker } from "@/features/files";
import { ensureScopeTree } from "@/features/scopes/redux/thunks/ensureScopeTree";
import {
  makeSelectScope,
  makeSelectScopeTypesForOrg,
} from "@/features/scopes/redux/selectors/tree";
import { useUniversalEntitySearch } from "@/features/scopes/hooks/useUniversalEntitySearch";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { fetchEntityTitles } from "@/features/scopes/service/entityTitles";
import { useResolvedReferenceLabel } from "@/features/matrx-envelope/referenceResolvers";
import type { ReferenceItem } from "@/features/matrx-envelope/envelope";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import {
  buildReferenceCellValue,
  parseReferenceCellValue,
  referenceTypeLabel,
  type ReferenceItemConfig,
} from "@/features/scopes/utils/referenceCell";

export interface ReferenceValuePickerProps {
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
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
  id,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  config,
  value,
  onChange,
  scopeId,
  disabled,
  className,
}: ReferenceValuePickerProps) {
  const addContentRef = useRef<HTMLDivElement>(null);
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

  const activeAddType = allowedTypes.includes(addType)
    ? addType
    : currentType && allowedTypes.includes(currentType)
      ? currentType
      : (allowedTypes[0] ?? "");

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
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      className={cn("space-y-1.5", className)}
    >
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
              Add {typeLabel(activeAddType)}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            ref={addContentRef}
            className="w-80 p-2"
            align="start"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              requestAnimationFrame(() => {
                addContentRef.current
                  ?.querySelector<HTMLElement>("[data-reference-autofocus]")
                  ?.focus();
              });
            }}
          >
            {allowedTypes.length > 1 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {allowedTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAddType(t)}
                    aria-pressed={activeAddType === t}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
                      activeAddType === t
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
              type={activeAddType}
              scopeId={scopeId}
              allowedScopeTypeIds={config.allowed_scope_type_ids}
              onPickMany={(picked) => {
                addItems(activeAddType, picked);
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
  // Live-resolve, same as the read-only ReferenceChip — a baked-in `label` is
  // only a first-paint head start, never the source of truth. This is what a
  // backfilled cell (no label at all) or a renamed entity (stale label) needs
  // to still show the real current name here instead of a bare type name.
  const { display, status } = useResolvedReferenceLabel(item, type);
  const label =
    type === "url" && hints.url && !hints.label ? hints.url : display;
  const Icon = type === "url" ? Link2 : type === "file" ? FileText : null;

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted px-2 py-0.5 text-sm text-foreground">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
      <span className="truncate">{label}</span>
      {status === "loading" && (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={`Remove ${label}`}
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
        data-reference-autofocus
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
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!valid) return;
        const item: Record<string, string> = { url: url.trim() };
        const nextLabel = label.trim();
        if (nextLabel) item.label = nextLabel;
        onPickMany([item as unknown as ReferenceItem]);
        setUrl("");
        setLabel("");
      }}
    >
      <Input
        data-reference-autofocus
        aria-label="URL"
        placeholder="https://…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={{ fontSize: "16px" }}
      />
      <Input
        aria-label="Link label"
        placeholder="Label (optional)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        style={{ fontSize: "16px" }}
      />
      <Button type="submit" size="sm" className="w-full" disabled={!valid}>
        <Link2 className="mr-1.5 h-3.5 w-3.5" />
        Add link
      </Button>
    </form>
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
  const [activeIndex, setActiveIndex] = useState(0);
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);

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
          data-reference-autofocus
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" || candidates.length === 0) return;
            event.preventDefault();
            candidateRefs.current[0]?.focus();
          }}
          placeholder="Search scopes…"
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
      </div>
      <div
        role="listbox"
        aria-label="Scope results"
        className="max-h-56 space-y-0.5 overflow-y-auto"
      >
        {candidates.length === 0 && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            No scopes found.
          </p>
        )}
        {candidates.map((c, index) => (
          <button
            key={c.id}
            ref={(element) => {
              candidateRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={false}
            tabIndex={index === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(index)}
            onKeyDown={(event) =>
              handleCandidateKeyDown(
                event,
                index,
                candidates.length,
                candidateRefs,
                setActiveIndex,
              )
            }
            onClick={() =>
              onPickMany([
                { id: c.id, label: c.name } as unknown as ReferenceItem,
              ])
            }
            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
  const [activeIndex, setActiveIndex] = useState(0);
  const candidateRefs = useRef<Array<HTMLButtonElement | null>>([]);
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
          data-reference-autofocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key !== "ArrowDown" || results.length === 0) return;
            event.preventDefault();
            candidateRefs.current[0]?.focus();
          }}
          placeholder={`Search ${info.labelPlural.toLowerCase()}…`}
          className="h-8 pl-8 text-sm"
          style={{ fontSize: "16px" }}
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>
      <div
        role="listbox"
        aria-label={`${info.labelPlural} results`}
        className="max-h-56 space-y-0.5 overflow-y-auto"
      >
        {results.length === 0 && !loading && (
          <p className="px-1 py-2 text-xs text-muted-foreground">
            {query.trim()
              ? "No matches."
              : `Type to search ${info.labelPlural.toLowerCase()}.`}
          </p>
        )}
        {results.map((c, index) => (
          <button
            key={`${c.token}:${c.id}`}
            ref={(element) => {
              candidateRefs.current[index] = element;
            }}
            type="button"
            role="option"
            aria-selected={false}
            tabIndex={index === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(index)}
            onKeyDown={(event) =>
              handleCandidateKeyDown(
                event,
                index,
                results.length,
                candidateRefs,
                setActiveIndex,
              )
            }
            onClick={() =>
              onPickMany([
                { id: c.id, label: c.title } as unknown as ReferenceItem,
              ])
            }
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <info.Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate text-foreground">{c.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function handleCandidateKeyDown(
  event: React.KeyboardEvent<HTMLButtonElement>,
  currentIndex: number,
  count: number,
  refs: React.RefObject<Array<HTMLButtonElement | null>>,
  setActiveIndex: (index: number) => void,
) {
  if (count === 0) return;
  let nextIndex: number | null = null;
  if (event.key === "ArrowDown") {
    nextIndex = (currentIndex + 1) % count;
  } else if (event.key === "ArrowUp") {
    nextIndex = (currentIndex - 1 + count) % count;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = count - 1;
  }
  if (nextIndex == null) return;
  event.preventDefault();
  setActiveIndex(nextIndex);
  refs.current[nextIndex]?.focus();
}

export default ReferenceValuePicker;
