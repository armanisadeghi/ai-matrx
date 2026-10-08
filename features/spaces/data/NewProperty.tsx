"use client";
// features/spaces/data/NewProperty.tsx — Notion's "New property" (D8): a compact panel inside the view
// menu, never a dialog. Name, a searchable type list; a type click makes the column — two clicks.
// The column goes through the table's own door (custom.field_declare); Formula / Rollup open records-ui's column panel on that kind.
import { Input } from "@ai-matrx/design-system/controls";
import { fieldDeclarationFor, tokenFor, type NewFieldSpec } from "@ai-matrx/records/core";
import { FieldEditor, type PickableFieldType } from "@ai-matrx/records-ui";
import { useRecordsClient, useTable, useTables } from "@ai-matrx/records/react";
import {
  AlignLeft,
  ArrowLeft,
  ArrowUpRight,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleUserRound,
  Clock,
  ClockArrowUp,
  Database,
  Hash,
  Key,
  Link2,
  Loader,
  Mail,
  Paperclip,
  Phone,
  Search,
  Sigma,
  Tags,
  User,
  UserRoundPen,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

import { toast } from "@/lib/toast";

import { MenuRow } from "./menu-parts";
import { ProInput } from "@/components/official/ProInput";

export interface PropertyType {
  label: string;
  icon: LucideIcon;
  type: string;
  kind?: "date" | "datetime";
  /** A choice list starts with no choices (Notion); they are added as the person types them. */
  choices?: boolean;
  /** Notion's Relation: the next step picks the database it points at. */
  relation?: boolean;
  /** Notion's Formula / Rollup: the next step is the column panel (records-ui), opened on this kind. */
  configure?: boolean;
  /** Anything else the column door takes for this kind (a Status's starting groups). */
  declaration?: NewFieldSpec["declaration"];
  /** Notion's Status starts with three choices, one per group. */
  options?: string[];
}

/** Notion's Status: Not started (To-do), In progress, Done (Complete) — keyed by words for a new column. */
export const STATUS_START = { options: ["Not started", "In progress", "Done"], groups: { "Not started": "todo", "In progress": "in_progress", Done: "done" } } as const;

/** Notion's property types, in Notion's order, as the table's door words them. */
export const PROPERTY_TYPES: PropertyType[] = [
  { label: "Text", icon: AlignLeft, type: "text" },
  { label: "Number", icon: Hash, type: "number" },
  { label: "Select", icon: ChevronDown, type: "select", choices: true },
  { label: "Multi-select", icon: Tags, type: "multi_select", choices: true },
  { label: "Status", icon: Loader, type: "status", options: [...STATUS_START.options], declaration: { status_groups: { ...STATUS_START.groups } } },
  { label: "Date", icon: Calendar, type: "datetime", kind: "date" },
  { label: "Person", icon: User, type: "member" },
  { label: "Files & media", icon: Paperclip, type: "attachment" },
  { label: "Checkbox", icon: CheckSquare, type: "checkbox" },
  { label: "URL", icon: Link2, type: "url" },
  { label: "Email", icon: Mail, type: "email" },
  { label: "Phone", icon: Phone, type: "phone" },
  { label: "Formula", icon: Sigma, type: "formula", configure: true },
  { label: "Relation", icon: ArrowUpRight, type: "relation", relation: true },
  { label: "Rollup", icon: Search, type: "rollup", configure: true },
  { label: "Created time", icon: Clock, type: "created_time" },
  { label: "Created by", icon: CircleUserRound, type: "created_by" },
  { label: "Last edited time", icon: ClockArrowUp, type: "modified_time" },
  { label: "Last edited by", icon: UserRoundPen, type: "modified_by" },
  { label: "ID", icon: Key, type: "autonumber" },
];

/** Types whose name or Notion synonym ("tags" → Multi-select, "list") matches the search. */
export function matchTypes(query: string): PropertyType[] {
  const q = query.trim().toLowerCase();
  if (!q) return PROPERTY_TYPES;
  const synonyms: Record<string, string[]> = { "Multi-select": ["tags", "labels", "multi"], Select: ["choice", "dropdown", "options"], Date: ["day", "when", "due"], Person: ["people", "user", "assignee"], Text: ["string", "words"], Relation: ["link", "connect", "points"], Status: ["state", "progress", "stage"], Formula: ["calculate", "math", "compute"], Rollup: ["aggregate", "count", "sum", "total"], "Files & media": ["attachment", "upload", "image"], "Created time": ["date created"], "Last edited time": ["modified", "updated"], "Last edited by": ["modified", "updated"], ID: ["number", "auto", "unique"] };
  return PROPERTY_TYPES.filter((t) => t.label.toLowerCase().includes(q) || (synonyms[t.label] ?? []).some((s) => s.startsWith(q)));
}

/** A key no column of the table has yet. */
export function freshKey(label: string, taken: readonly string[]): string {
  const base = tokenFor(label) || "property";
  let key = base;
  for (let i = 2; taken.includes(key); i++) key = `${base}_${i}`;
  return key;
}

export function NewPropertyPanel({ tableId, takenKeys, onDone }: { tableId: string; takenKeys: readonly string[]; onDone: () => void }) {
  const client = useRecordsClient();
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  /** Relation, step two: which database it points at (Notion: "Select a data source"). */
  const [relating, setRelating] = useState<PropertyType | null>(null);
  /** Formula / Rollup: the column panel, opened on that kind. */
  const [configuring, setConfiguring] = useState<PropertyType | null>(null);
  const make = async (t: PropertyType, target?: { id: string; name: string }) => {
    if (t.relation && !target) {
      setRelating(t);
      return;
    }
    if (t.configure) {
      setConfiguring(t);
      return;
    }
    const label = name.trim() || (target ? target.name : t.label);
    setBusy(true);
    // The column door itself (not `addFields`), so an ID column hears back its own id and numbers the rows already here.
    const made = await client.fieldDeclare({
      table_id: tableId,
      spec: fieldDeclarationFor({
        key: freshKey(label, takenKeys),
        label,
        type: t.type as never,
        ...(t.kind ? { kind: t.kind } : {}),
        ...(t.choices ? { options: [] } : {}),
        ...(t.options ? { options: t.options } : {}),
        ...(t.declaration ? { declaration: t.declaration } : {}),
        // Notion's relation holds any number of pages ("Limit: No limit"), which is also what a rollup reads through.
        ...(target ? { relationTarget: target.id, multi: true } : {}),
      }),
    });
    if (made.ok && t.type === "autonumber") {
      const numbered = await client.autonumberBackfill({ field_id: made.data });
      if (!numbered.ok) toast.error(`ID added; existing pages not numbered: ${numbered.error.message}`);
    }
    setBusy(false);
    if (!made.ok) {
      toast.error(`Property not added: ${made.error.message}`);
      return;
    }
    onDone();
  };
  const types = matchTypes(query);
  if (configuring)
    return (
      <div className="flex flex-col gap-1" data-spaces-configure-property={configuring.type}>
        <MenuRow icon={<ArrowLeft size={15} />} label={configuring.label} onClick={() => setConfiguring(null)} />
        <div className="max-h-[70vh] overflow-y-auto px-1 pb-1">
          <FieldEditor
            tableId={tableId}
            startAs={{ type: configuring.type as PickableFieldType, label: name.trim() || configuring.label }}
            onSaved={onDone}
            onCancel={() => setConfiguring(null)}
          />
        </div>
      </div>
    );
  if (relating) return <RelationTarget tableId={tableId} busy={busy} onBack={() => setRelating(null)} onPick={(target) => void make(relating, target)} />;
  return (
    <div className="flex flex-col gap-1" aria-busy={busy || undefined}>
      <div className="px-1 pt-1">
        <ProInput autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Property name" aria-label="Property name" />
      </div>
      <div className="px-1">
        {/* ui-exception: a search over property types, not writing */}
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search for a type…" aria-label="Search property types" onKeyDown={(e) => e.key === "Enter" && types[0] && !busy && void make(types[0])} />
      </div>
      <div className="px-2 pt-1 type-secondary text-muted-foreground">Type</div>
      <div role="listbox" aria-label="Property types">
        {types.map((t) => (
          <MenuRow key={t.label} icon={<t.icon size={15} />} label={t.label} onClick={() => !busy && void make(t)} />
        ))}
        {types.length === 0 ? <p className="px-2 py-2 type-secondary text-muted-foreground">No results</p> : null}
      </div>
    </div>
  );
}

/** Relation, step two (Notion): the databases of this table's organization, searchable; a click makes the property. */
function RelationTarget({ tableId, busy, onBack, onPick }: { tableId: string; busy: boolean; onBack: () => void; onPick: (target: { id: string; name: string }) => void }) {
  const tables = useTables();
  const own = useTable(tableId);
  const [query, setQuery] = useState("");
  const org = (own.data as { organization_id?: string } | null)?.organization_id ?? null;
  const q = query.trim().toLowerCase();
  const choices = (tables.data ?? [])
    .filter((t) => (org ? (t as { organization_id?: string }).organization_id === org : true))
    .filter((t) => !q || (t.name ?? "").toLowerCase().includes(q))
    // Newest first: the database just made on this page is the one a person is about to link (Notion lists recent first).
    .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return (
    <div className="flex flex-col gap-1" aria-busy={busy || tables.loading || undefined}>
      <MenuRow icon={<ArrowLeft size={15} />} label="Relation" onClick={onBack} />
      <div className="px-1">
        {/* ui-exception: a search over databases, not writing */}
        <Input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Link to a database…" aria-label="Search databases" />
      </div>
      <div role="listbox" aria-label="Databases" className="max-h-72 overflow-y-auto">
        {choices.map((t) => (
          <MenuRow key={t.id} icon={<Database size={15} />} label={t.id === tableId ? `${t.name} (this database)` : t.name} onClick={() => !busy && onPick({ id: t.id, name: t.name })} />
        ))}
        {!tables.loading && choices.length === 0 ? <p className="px-2 py-2 type-secondary text-muted-foreground">No databases</p> : null}
      </div>
    </div>
  );
}
