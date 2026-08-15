"use client";

// DictionarySelectorWindow — the compact, non-blocking selector for the
// dictionary context on transcription/TTS surfaces. Rendered as a WindowPanel
// (draggable, minimizable) via the overlay controller. It does NOT communicate
// via a callback registry: it reads/writes the per-surface selection through
// the shared surface-user-state store keyed by `surfaceKey`, so the parent
// surface (its indicator button / context card) re-resolves automatically.

import { useCallback, useMemo, useState } from "react";
import { BookA, Building2, Layers, ListPlus, Plus, Tag, User, X } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDictionaryContext } from "@/features/dictionary/hooks/useDictionaryContext";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { ExportMenu } from "@/components/agent-copy/ExportMenu";
import { csvExportItem, jsonExportItem } from "@/components/agent-copy/export";
import {
  dictLocation,
  dictOwnerData,
  dictOwnerSummary,
} from "@/features/dictionary/format";
import type { DictEntryDraft, DictOwner, DictSelection } from "@/features/dictionary/types";

const OVERLAY_ID = "dictionarySelectorWindow";
const WINDOW_ID = "dictionary-selector";

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  surfaceKey: string;
}

export function DictionarySelectorWindow({ onClose, surfaceKey }: Props) {
  const { owners, selection, setSelection, activeCount, customEntries, addCustomEntry, removeCustomEntry } =
    useDictionaryContext(surfaceKey);

  const toggleId = useCallback(
    (key: "organizationIds" | "scopeTypeIds" | "scopeIds", id: string) => {
      setSelection((prev) => {
        const set = new Set(prev[key]);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        return { ...prev, [key]: [...set], all: false };
      });
    },
    [setSelection],
  );

  const setFlag = useCallback(
    (patch: Partial<DictSelection>) => setSelection((prev) => ({ ...prev, ...patch })),
    [setSelection],
  );

  const totalEntries = useMemo(() => {
    if (!owners) return 0;
    return (
      (owners.personal?.entry_count ?? 0) +
      owners.organizations.reduce((n, o) => n + o.entry_count, 0) +
      owners.scope_types.reduce((n, o) => n + o.entry_count, 0) +
      owners.scopes.reduce((n, o) => n + o.entry_count, 0)
    );
  }, [owners]);

  // ── agent-copy ────────────────────────────────────────────────────────────
  // The tier list flattened to one row shape, each carrying whether it is
  // currently selected — the checkbox state IS what the user sees, so a payload
  // listing tiers without it would miss the whole point of this window.
  const isSelected = useCallback(
    (owner: DictOwner): boolean => {
      if (selection.all) return true;
      if (owner.level === "user") return selection.includePersonal;
      if (owner.level === "organization")
        return selection.organizationIds.includes(owner.owner_id);
      if (owner.level === "scope_type")
        return selection.scopeTypeIds.includes(owner.owner_id);
      return selection.scopeIds.includes(owner.owner_id);
    },
    [selection],
  );

  const catalogueOwners = useCallback((): DictOwner[] => {
    if (!owners) return [];
    return [
      ...(owners.personal ? [owners.personal] : []),
      ...owners.organizations,
      ...owners.scope_types,
      ...owners.scopes,
    ];
  }, [owners]);

  const catalogueRows = useCallback(
    () =>
      catalogueOwners().map((o) => ({
        ...dictOwnerData(o),
        selected: isSelected(o),
      })),
    [catalogueOwners, isSelected],
  );

  const catalogueSummary = useCallback(() => {
    const list = catalogueOwners();
    const header = [
      `Dictionary sources — ${activeCount} active term${activeCount === 1 ? "" : "s"}`,
      `Tiers available: ${list.length} (${totalEntries} term${totalEntries === 1 ? "" : "s"} total)`,
      `Selected: ${list.filter(isSelected).length}`,
    ].join("\n");
    if (list.length === 0) return `${header}\n\n(no dictionaries available)`;
    const body = list
      .map(
        (o) =>
          `[${isSelected(o) ? "x" : " "}] ${dictOwnerSummary(o).replace(/\n/g, " · ")}`,
      )
      .join("\n");
    return `${header}\n\n${body}`;
  }, [catalogueOwners, isSelected, activeCount, totalEntries]);

  return (
    <WindowPanel
      id={WINDOW_ID}
      overlayId={OVERLAY_ID}
      title="Dictionary context"
      titleNode={
        <div className="flex items-center gap-2 min-w-0">
          <BookA className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="truncate text-sm font-semibold text-foreground">Dictionary context</span>
          <Badge variant="secondary" className="ml-1 shrink-0">{activeCount} active</Badge>
        </div>
      }
      minWidth={360}
      minHeight={420}
      onClose={onClose}
    >
      <ScrollArea className="h-full">
        <div className="space-y-4 p-3">
          <div className="flex items-start gap-2">
            <p className="flex-1 text-xs text-muted-foreground">
              Choose which dictionaries apply here. The active set is merged and de-duplicated; the
              most specific level wins on conflicts.
            </p>
            <CopyButtons
              size="xs"
              label="Dictionary sources"
              className="shrink-0"
              human={() => catalogueSummary()}
              json={() => catalogueRows()}
              agent={() => ({
                kind: "dictionary-owner-catalogue",
                location: dictLocation("Dictionary context selector"),
                description:
                  "Every dictionary tier this user can attach to on this surface, with which are currently selected.",
                data: {
                  surface_key: surfaceKey,
                  active_terms: activeCount,
                  selection,
                  tiers: catalogueRows(),
                  per_task_entries: customEntries,
                },
                summary: catalogueSummary(),
                attributes: {
                  rows: catalogueRows().length,
                  active_terms: activeCount,
                  available_terms: totalEntries,
                },
                context: { surface_key: surfaceKey },
              })}
            />
            <ExportMenu
              label="Dictionary sources"
              className="shrink-0"
              items={[
                jsonExportItem(() => catalogueRows()),
                csvExportItem(() =>
                  catalogueRows().map((r) => ({
                    level: r.level,
                    name: r.name,
                    owner_id: r.owner_id,
                    entry_count: r.entry_count,
                    selected: r.selected,
                    max_inline_chars: r.max_inline_chars ?? "",
                  })),
                ),
              ]}
            />
          </div>

          {/* All toggle */}
          <Row
            icon={<Layers className="h-4 w-4" />}
            label="Everything"
            sublabel="Personal + all orgs, scope types & scopes"
            right={
              <Switch
                checked={selection.all}
                onCheckedChange={(v) => setFlag({ all: v })}
                aria-label="Use all dictionaries"
              />
            }
          />

          {/* Personal */}
          <Row
            icon={<User className="h-4 w-4" />}
            label="Personal dictionary"
            count={owners?.personal?.entry_count}
            right={
              <Switch
                checked={selection.all || selection.includePersonal}
                disabled={selection.all}
                onCheckedChange={(v) => setFlag({ includePersonal: v })}
                aria-label="Include personal dictionary"
              />
            }
          />

          <Group
            icon={<Building2 className="h-4 w-4" />}
            title="Organizations"
            owners={owners?.organizations ?? []}
            selectedIds={selection.organizationIds}
            disabled={selection.all}
            onToggle={(id) => toggleId("organizationIds", id)}
            surfaceKey={surfaceKey}
          />
          <Group
            icon={<Tag className="h-4 w-4" />}
            title="Scope types"
            owners={owners?.scope_types ?? []}
            selectedIds={selection.scopeTypeIds}
            disabled={selection.all}
            onToggle={(id) => toggleId("scopeTypeIds", id)}
            surfaceKey={surfaceKey}
          />
          <Group
            icon={<Layers className="h-4 w-4" />}
            title="Scopes"
            owners={owners?.scopes ?? []}
            selectedIds={selection.scopeIds}
            disabled={selection.all}
            onToggle={(id) => toggleId("scopeIds", id)}
            surfaceKey={surfaceKey}
          />

          <CustomEntriesSection
            entries={customEntries}
            onAdd={addCustomEntry}
            onRemove={removeCustomEntry}
          />

          <p className="text-[11px] text-muted-foreground pt-1">
            {totalEntries} total entr{totalEntries === 1 ? "y" : "ies"} available across your dictionaries.
          </p>
        </div>
      </ScrollArea>
    </WindowPanel>
  );
}

/**
 * Per-task ("situational") pronunciations — added for this surface only, never
 * saved to a tier. They override the persistent dictionary and ride the TTS
 * request as `dictionary.custom_entries`.
 */
function CustomEntriesSection({
  entries,
  onAdd,
  onRemove,
}: {
  entries: DictEntryDraft[];
  onAdd: (draft: DictEntryDraft) => void;
  onRemove: (term: string) => void;
}) {
  const [term, setTerm] = useState("");
  const [say, setSay] = useState("");

  const commit = useCallback(() => {
    const t = term.trim();
    const s = say.trim();
    if (!t || !s) return;
    onAdd({ term: t, pronunciation: s });
    setTerm("");
    setSay("");
  }, [term, say, onAdd]);

  return (
    <div className="space-y-2 rounded-md border border-dashed border-border p-2.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <ListPlus className="h-3.5 w-3.5" /> Add for this task
      </div>
      <p className="text-[11px] text-muted-foreground">
        One-off pronunciations for this surface only — not saved to your dictionary.
      </p>

      {entries.length > 0 && (
        <ul className="space-y-1">
          {entries.map((e) => (
            <li
              key={e.term.toLowerCase()}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm"
            >
              <span className="truncate font-medium">{e.term}</span>
              <span className="text-muted-foreground">→</span>
              <span className="flex-1 min-w-0 truncate text-muted-foreground">{e.pronunciation}</span>
              <button
                type="button"
                onClick={() => onRemove(e.term)}
                className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label={`Remove ${e.term}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          value={term}
          onChange={(ev) => setTerm(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") commit();
          }}
          placeholder="Term"
          className="h-8 flex-1 text-sm"
          aria-label="Term to pronounce"
        />
        <Input
          value={say}
          onChange={(ev) => setSay(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter") commit();
          }}
          placeholder="Say it like…"
          className="h-8 flex-1 text-sm"
          aria-label="Pronunciation respelling"
        />
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="h-8 w-8 shrink-0"
          onClick={commit}
          disabled={!term.trim() || !say.trim()}
          aria-label="Add per-task pronunciation"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  sublabel,
  count,
  right,
}: {
  icon: React.ReactNode;
  label: string;
  sublabel?: string;
  count?: number;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{label}</div>
        {sublabel && <div className="text-[11px] text-muted-foreground truncate">{sublabel}</div>}
      </div>
      {typeof count === "number" && (
        <span className="text-[11px] text-muted-foreground">{count}</span>
      )}
      {right}
    </div>
  );
}

function Group({
  icon,
  title,
  owners,
  selectedIds,
  disabled,
  onToggle,
  surfaceKey,
}: {
  icon: React.ReactNode;
  title: string;
  owners: DictOwner[];
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
  surfaceKey: string;
}) {
  if (owners.length === 0) return null;
  const selected = new Set(selectedIds);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {icon} {title}
      </div>
      <div className={cn("space-y-1", disabled && "opacity-50 pointer-events-none")}>
        {owners.map((o) => (
          <label
            key={o.owner_id}
            className="group/dict-tier flex items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5 cursor-pointer hover:bg-accent/20"
          >
            <Checkbox
              checked={selected.has(o.owner_id)}
              onCheckedChange={() => onToggle(o.owner_id)}
              aria-label={`Include ${o.name}`}
            />
            <span className="flex-1 min-w-0 truncate text-sm">{o.name}</span>
            <span className="text-[11px] text-muted-foreground">{o.entry_count}</span>
            {/*
              A <label> activates its control on ANY descendant click, and
              stopPropagation alone does not cancel that default — copying a
              tier would silently toggle it in or out of the merge. preventDefault
              on the wrapper is what actually keeps the checkbox still.
            */}
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <CopyButtons
                size="xs"
                label={`${o.name} dictionary`}
                className="opacity-0 transition-opacity group-hover/dict-tier:opacity-100 focus-within:opacity-100"
                human={() => dictOwnerSummary(o)}
                json={() => dictOwnerData(o)}
                agent={() => ({
                  kind: "dictionary-owner",
                  location: dictLocation("Dictionary context selector"),
                  description:
                    "One dictionary tier available to this surface, with its entry count and inline policy.",
                  data: {
                    ...dictOwnerData(o),
                    selected: selected.has(o.owner_id),
                  },
                  summary: dictOwnerSummary(o),
                  attributes: {
                    level: o.level,
                    name: o.name,
                    entries: o.entry_count,
                    selected: selected.has(o.owner_id),
                  },
                  context: { surface_key: surfaceKey },
                })}
              />
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}
