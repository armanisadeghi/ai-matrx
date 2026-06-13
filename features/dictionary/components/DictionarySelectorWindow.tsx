"use client";

// DictionarySelectorWindow — the compact, non-blocking selector for the
// dictionary context on transcription/TTS surfaces. Rendered as a WindowPanel
// (draggable, minimizable) via the overlay controller. It does NOT communicate
// via a callback registry: it reads/writes the per-surface selection through
// the shared surface-user-state store keyed by `surfaceKey`, so the parent
// surface (its indicator button / context card) re-resolves automatically.

import { useCallback, useMemo } from "react";
import { BookA, Building2, Layers, Tag, User } from "lucide-react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDictionaryContext } from "@/features/dictionary/hooks/useDictionaryContext";
import type { DictOwner, DictSelection } from "@/features/dictionary/types";

const OVERLAY_ID = "dictionarySelectorWindow";
const WINDOW_ID = "dictionary-selector";

interface Props {
  isOpen?: boolean;
  onClose?: () => void;
  surfaceKey: string;
}

export function DictionarySelectorWindow({ onClose, surfaceKey }: Props) {
  const { owners, selection, setSelection, activeCount } = useDictionaryContext(surfaceKey);

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
          <p className="text-xs text-muted-foreground">
            Choose which dictionaries apply here. The active set is merged and de-duplicated; the
            most specific level wins on conflicts.
          </p>

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
          />
          <Group
            icon={<Tag className="h-4 w-4" />}
            title="Scope types"
            owners={owners?.scope_types ?? []}
            selectedIds={selection.scopeTypeIds}
            disabled={selection.all}
            onToggle={(id) => toggleId("scopeTypeIds", id)}
          />
          <Group
            icon={<Layers className="h-4 w-4" />}
            title="Scopes"
            owners={owners?.scopes ?? []}
            selectedIds={selection.scopeIds}
            disabled={selection.all}
            onToggle={(id) => toggleId("scopeIds", id)}
          />

          <p className="text-[11px] text-muted-foreground pt-1">
            {totalEntries} total entr{totalEntries === 1 ? "y" : "ies"} available across your dictionaries.
          </p>
        </div>
      </ScrollArea>
    </WindowPanel>
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
}: {
  icon: React.ReactNode;
  title: string;
  owners: DictOwner[];
  selectedIds: string[];
  disabled?: boolean;
  onToggle: (id: string) => void;
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
            className="flex items-center gap-2.5 rounded-md border border-border px-2.5 py-1.5 cursor-pointer hover:bg-accent/20"
          >
            <Checkbox
              checked={selected.has(o.owner_id)}
              onCheckedChange={() => onToggle(o.owner_id)}
              aria-label={`Include ${o.name}`}
            />
            <span className="flex-1 min-w-0 truncate text-sm">{o.name}</span>
            <span className="text-[11px] text-muted-foreground">{o.entry_count}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
