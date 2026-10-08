"use client";

// features/spaces/page/PageProperties.tsx — N13: Notion's page properties on a normal page.
//
// Under the title, one row per property: its type icon and name on the left, the value on the right
// (text, number, select, date, person). "Add a property" opens the type list; a property's name opens its
// menu (rename, change nothing else, delete). Values are stored on the page snapshot (`properties`), so they
// save, version and publish with the page. People come from who can read the page (cmt_mention_candidates).

import { Button, Field } from "@ai-matrx/design-system/controls";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { AlignLeft, Calendar, ChevronDown, CircleDot, Hash, Plus, Trash2, User } from "lucide-react";
import { useEffect, useState } from "react";

import { mentionCandidates } from "@/features/rich-document/annotations/service";

import type { PageProperty, PagePropertyType } from "../contract";
import { spaceCommentSource } from "../collab/comments";

const TYPES: Array<{ type: PagePropertyType; label: string; icon: typeof AlignLeft }> = [
  { type: "text", label: "Text", icon: AlignLeft },
  { type: "number", label: "Number", icon: Hash },
  { type: "select", label: "Select", icon: CircleDot },
  { type: "date", label: "Date", icon: Calendar },
  { type: "person", label: "Person", icon: User },
];

const iconOf = (t: PagePropertyType) => TYPES.find((x) => x.type === t)?.icon ?? AlignLeft;
const newId = () => (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `p${Date.now().toString(36)}`);

/** "Add a property" — the type list (Notion's property picker). Also used by the header's control. */
export function AddPropertyMenu({ onAdd, children }: { onAdd: (p: PageProperty) => void; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent surface="solid" align="start" width="sm" padding="none">
        <div className="py-1" role="menu" aria-label="Property type">
          <p className="px-3 pb-1 pt-1.5 type-secondary text-muted-foreground">Type</p>
          {TYPES.map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                setOpen(false);
                onAdd({ id: newId(), name: label, type, value: null, ...(type === "select" || type === "person" ? { options: [] } : {}) });
              }}
            >
              <Icon size={15} strokeWidth={1.8} />
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PageProperties({ spaceId, properties, editable, onChange }: { spaceId: string; properties: PageProperty[]; editable: boolean; onChange: (next: PageProperty[]) => void }) {
  if (!properties.length) return null;
  const set = (id: string, patch: Partial<PageProperty>) => onChange(properties.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  return (
    <div className="spaces-page-props" data-page-properties="">
      {properties.map((p) => (
        <div key={p.id} className="spaces-page-prop" data-prop-type={p.type}>
          <PropertyName p={p} editable={editable} onRename={(name) => set(p.id, { name })} onDelete={() => onChange(properties.filter((x) => x.id !== p.id))} />
          <div className="spaces-page-prop-value">
            <PropertyValue spaceId={spaceId} p={p} editable={editable} onChange={(patch) => set(p.id, patch)} />
          </div>
        </div>
      ))}
      {editable ? (
        <AddPropertyMenu onAdd={(p) => onChange([...properties, p])}>
          <button type="button" className="spaces-page-prop-add">
            <Plus size={14} strokeWidth={1.8} />
            Add a property
          </button>
        </AddPropertyMenu>
      ) : null}
    </div>
  );
}

function PropertyName({ p, editable, onRename, onDelete }: { p: PageProperty; editable: boolean; onRename: (name: string) => void; onDelete: () => void }) {
  const Icon = iconOf(p.type);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(p.name);
  useEffect(() => setName(p.name), [p.name]);
  const label = (
    <span className="spaces-page-prop-name-inner">
      <Icon size={15} strokeWidth={1.7} />
      <span className="truncate">{p.name || "Untitled"}</span>
    </span>
  );
  if (!editable) return <div className="spaces-page-prop-name">{label}</div>;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o && name.trim() && name !== p.name) onRename(name.trim());
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className="spaces-page-prop-name" aria-label={`Property ${p.name}`}>
          {label}
        </button>
      </PopoverTrigger>
      <PopoverContent surface="solid" align="start" width="sm" padding="sm">
        <div className="flex flex-col gap-2">
          <Field
            aria-label="Property name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") setOpen(false);
            }}
            autoFocus
          />
          <Button
            variant="quiet"
            className="justify-start"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            <Trash2 size={14} />
            Delete property
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PropertyValue({ spaceId, p, editable, onChange }: { spaceId: string; p: PageProperty; editable: boolean; onChange: (patch: Partial<PageProperty>) => void }) {
  if (p.type === "select" || p.type === "person") return <ChoiceValue spaceId={spaceId} p={p} editable={editable} onChange={onChange} />;
  const shown = p.value === null || p.value === undefined ? "" : String(p.value);
  if (!editable) {
    const text = p.type === "date" && shown ? new Date(`${shown}T00:00:00`).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : shown;
    return <span className={text ? "spaces-page-prop-text" : "spaces-page-prop-empty"}>{text || "Empty"}</span>;
  }
  return <InlineValue type={p.type} value={shown} onCommit={(v) => onChange({ value: v === "" ? null : p.type === "number" ? Number(v) : v })} />;
}

/** Text, number and date: typed in place; saved on blur or Enter (Notion). */
function InlineValue({ type, value, onCommit }: { type: PagePropertyType; value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      className="spaces-page-prop-input"
      type={type === "number" ? "number" : type === "date" ? "date" : "text"}
      placeholder="Empty"
      value={draft}
      aria-label="Property value"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft.trim())}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

/** Select (its options, a new one by typing) and Person (people who can read the page). */
function ChoiceValue({ spaceId, p, editable, onChange }: { spaceId: string; p: PageProperty; editable: boolean; onChange: (patch: Partial<PageProperty>) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Array<{ id: string; name: string }>>([]);
  const options = p.options ?? [];
  const chosen = options.find((o) => o.id === p.value);
  useEffect(() => {
    if (!open || p.type !== "person") return;
    let live = true;
    void mentionCandidates(spaceCommentSource(spaceId, ""), query.trim())
      .then((list) => live && setPeople(list.slice(0, 8).map((c) => ({ id: c.userId, name: c.name }))))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [open, query, p.type, spaceId]);
  const list = p.type === "person" ? people : options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()));
  const pick = (o: { id: string; name: string }) => {
    setOpen(false);
    setQuery("");
    // A person's name rides in `options` as the shown name (the value is the user id).
    const keep = p.type === "person" ? [{ id: o.id, name: o.name }] : options;
    onChange({ value: o.id, options: keep });
  };
  const chip = chosen ? (
    <span className={p.type === "person" ? "spaces-page-prop-person" : "spaces-page-prop-chip"}>
      {p.type === "person" ? <User size={13} strokeWidth={1.8} /> : null}
      {chosen.name}
    </span>
  ) : (
    <span className="spaces-page-prop-empty">Empty</span>
  );
  if (!editable) return chip;
  const typed = query.trim();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="spaces-page-prop-choice" aria-label="Choose value">
          {chip}
          <ChevronDown size={12} className="spaces-page-prop-chevron" />
        </button>
      </PopoverTrigger>
      <PopoverContent surface="solid" align="start" width="sm" padding="none">
        <div className="p-2">
          <Field
            aria-label={p.type === "person" ? "Search for a person" : "Search for an option"}
            placeholder={p.type === "person" ? "Search for a person…" : "Search for an option…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              const exact = list.find((o) => o.name.toLowerCase() === typed.toLowerCase());
              if (exact) pick(exact);
              else if (p.type === "select" && typed) {
                const made = { id: newId(), name: typed };
                onChange({ value: made.id, options: [...options, made] });
                setOpen(false);
                setQuery("");
              } else if (list[0]) pick(list[0]);
            }}
            autoFocus
          />
        </div>
        <div className="max-h-64 overflow-y-auto pb-1" role="listbox">
          {list.map((o) => (
            <button key={o.id} type="button" role="option" aria-selected={o.id === p.value} className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent" onClick={() => pick(o)}>
              {p.type === "person" ? <User size={14} /> : <span className="spaces-page-prop-chip">{o.name}</span>}
              {p.type === "person" ? o.name : null}
            </button>
          ))}
          {p.type === "select" && typed && !list.some((o) => o.name.toLowerCase() === typed.toLowerCase()) ? (
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                const made = { id: newId(), name: typed };
                onChange({ value: made.id, options: [...options, made] });
                setOpen(false);
                setQuery("");
              }}
            >
              Create <span className="spaces-page-prop-chip">{typed}</span>
            </button>
          ) : null}
          {p.value ? (
            <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent" onClick={() => (setOpen(false), onChange({ value: null }))}>
              Clear
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
