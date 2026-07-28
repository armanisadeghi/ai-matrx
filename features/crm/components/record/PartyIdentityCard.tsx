"use client";

// features/crm/components/record/PartyIdentityCard.tsx
//
// Identity key-value rows with click-to-edit. What you can see, you can
// change: each field commits one UPDATE on blur/Enter through updateParty.

import { useState } from "react";
import { toast } from "@/lib/toast";
import { IdCard, PhoneOff } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { updateParty } from "../../service";
import type { PartyListRow, PartyUpdate } from "../../types";
import { SectionCard } from "./SectionCard";

interface Props {
  party: PartyListRow;
  onChanged: () => Promise<void>;
}

type EditableKey =
  | "display_name"
  | "first_name"
  | "last_name"
  | "job_title"
  | "headline"
  | "legal_name"
  | "primary_domain"
  | "timezone"
  | "bio";

interface FieldSpec {
  key: EditableKey;
  label: string;
  personOnly?: boolean;
  companyOnly?: boolean;
  multiline?: boolean;
  placeholder?: string;
}

const FIELDS: FieldSpec[] = [
  { key: "display_name", label: "Name" },
  { key: "first_name", label: "First name", personOnly: true },
  { key: "last_name", label: "Last name", personOnly: true },
  { key: "job_title", label: "Title", personOnly: true },
  { key: "headline", label: "Headline" },
  { key: "legal_name", label: "Legal name", companyOnly: true },
  { key: "primary_domain", label: "Domain", placeholder: "acme.com" },
  { key: "timezone", label: "Timezone", placeholder: "America/Los_Angeles" },
  { key: "bio", label: "Bio", multiline: true },
];

function InlineField({
  spec,
  value,
  onCommit,
}: {
  spec: FieldSpec;
  value: string | null;
  onCommit: (next: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(value ?? "");
    setEditing(true);
  };

  const commit = async () => {
    const next = draft.trim() || null;
    setEditing(false);
    if (next === (value ?? null)) return;
    setSaving(true);
    try {
      await onCommit(next);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const inputClasses =
    "w-full rounded border border-primary/40 bg-background px-1.5 py-0.5 text-sm text-foreground outline-none focus:border-primary";

  return (
    <div className="flex items-start gap-2 py-0.5">
      <span className="w-24 shrink-0 pt-0.5 text-right text-xs text-muted-foreground">
        {spec.label}
      </span>
      {editing ? (
        spec.multiline ? (
          <textarea
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Escape") setEditing(false);
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
            }}
            className={inputClasses}
          />
        ) : (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") void commit();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder={spec.placeholder}
            className={inputClasses}
          />
        )
      ) : (
        <button
          type="button"
          onClick={start}
          className={cn(
            "min-w-0 flex-1 rounded px-1.5 py-0.5 text-left text-sm hover:bg-accent/50",
            value ? "text-foreground" : "text-muted-foreground/60",
            saving && "opacity-60",
            spec.multiline ? "whitespace-pre-wrap" : "truncate",
          )}
          title="Click to edit"
        >
          {value || "—"}
        </button>
      )}
    </div>
  );
}

export function PartyIdentityCard({ party, onChanged }: Props) {
  const isPerson = party.party_kind === "person";
  const fields = FIELDS.filter(
    (f) => !(f.personOnly && !isPerson) && !(f.companyOnly && isPerson),
  );

  const commitField = async (key: EditableKey, next: string | null) => {
    const patch: PartyUpdate = { [key]: next };
    // display_name is NOT NULL — an emptied name keeps the old one.
    if (key === "display_name" && !next) {
      toast.error("Name cannot be empty");
      return;
    }
    await updateParty(party.id, patch);
    await onChanged();
  };

  const toggleDnc = async (next: boolean) => {
    try {
      await updateParty(party.id, {
        do_not_contact: next,
        do_not_contact_reason: next ? party.do_not_contact_reason : null,
      });
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  };

  return (
    <SectionCard title="Identity" Icon={IdCard}>
      <div className="space-y-0">
        {fields.map((spec) => (
          <InlineField
            key={spec.key}
            spec={spec}
            value={party[spec.key]}
            onCommit={(next) => commitField(spec.key, next)}
          />
        ))}

        <div className="mt-1.5 flex items-center gap-2 border-t border-border pt-2">
          <PhoneOff
            className={cn(
              "h-3.5 w-3.5",
              party.do_not_contact ? "text-destructive" : "text-muted-foreground",
            )}
          />
          <span className="text-xs text-foreground">Do not contact</span>
          <div className="ml-auto">
            <Switch
              checked={party.do_not_contact}
              onCheckedChange={(v) => void toggleDnc(v)}
              aria-label="Do not contact"
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
