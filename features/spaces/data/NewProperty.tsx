"use client";
// features/spaces/data/NewProperty.tsx — Notion's "New property" (D8): a compact panel inside the view
// menu, never a dialog. Name, a searchable type list; a type click makes the column — two clicks.
// The column goes through the table's own door (records `addFields`, custom.field_declare).
import { Input } from "@ai-matrx/design-system/controls";
import { addFields, tokenFor } from "@ai-matrx/records/core";
import { useRecordsClient } from "@ai-matrx/records/react";
import { AlignLeft, Calendar, CheckSquare, ChevronDown, Hash, Link2, Mail, Paperclip, Phone, Tags, User, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { toast } from "@/lib/toast";

import { MenuRow } from "./menu-parts";

export interface PropertyType {
  label: string;
  icon: LucideIcon;
  type: string;
  kind?: "date" | "datetime";
  /** A choice list starts with no choices (Notion); they are added as the person types them. */
  choices?: boolean;
}

/** Notion's property types, in Notion's order, as the table's door words them. */
export const PROPERTY_TYPES: PropertyType[] = [
  { label: "Text", icon: AlignLeft, type: "text" },
  { label: "Number", icon: Hash, type: "number" },
  { label: "Select", icon: ChevronDown, type: "select", choices: true },
  { label: "Multi-select", icon: Tags, type: "multi_select", choices: true },
  { label: "Date", icon: Calendar, type: "datetime", kind: "date" },
  { label: "Person", icon: User, type: "member" },
  { label: "Files & media", icon: Paperclip, type: "attachment" },
  { label: "Checkbox", icon: CheckSquare, type: "checkbox" },
  { label: "URL", icon: Link2, type: "url" },
  { label: "Email", icon: Mail, type: "email" },
  { label: "Phone", icon: Phone, type: "phone" },
];

/** Types whose name or Notion synonym ("tags" → Multi-select, "list") matches the search. */
export function matchTypes(query: string): PropertyType[] {
  const q = query.trim().toLowerCase();
  if (!q) return PROPERTY_TYPES;
  const synonyms: Record<string, string[]> = { "Multi-select": ["tags", "labels", "multi"], Select: ["choice", "dropdown", "options"], Date: ["day", "when", "due"], Person: ["people", "user", "assignee"], Text: ["string", "words"] };
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
  const make = async (t: PropertyType) => {
    const label = name.trim() || t.label;
    setBusy(true);
    const made = await addFields(client, tableId, [
      { key: freshKey(label, takenKeys), label, type: t.type as never, ...(t.kind ? { kind: t.kind } : {}), ...(t.choices ? { options: [] } : {}) },
    ]);
    setBusy(false);
    if (!made.ok) {
      toast.error(`Property not added: ${made.error.message}`);
      return;
    }
    onDone();
  };
  const types = matchTypes(query);
  return (
    <div className="flex flex-col gap-1" aria-busy={busy || undefined}>
      <div className="px-1 pt-1">
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Property name" aria-label="Property name" />
      </div>
      <div className="px-1">
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
