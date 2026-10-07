"use client";

// features/esign/editor/components/RecipientsPanel.tsx — who gets this and what each does (D2, D3).
// A colleague is PICKED from the organization (they sign with their account); anyone else is typed
// (name + email, a link in their inbox). Each recipient: role, routing step, private message,
// company, title, verification (Email link / Email code / Access code), colour for life.

import { useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Trash2, UserPlus } from "lucide-react";

import { Badge, Button, Field, SegmentedControl, Select } from "@ai-matrx/design-system/controls";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";

import type { DraftRecipient, EnvelopeDraftV1, RecipientRole, RecipientVerification } from "../../contract/draft";
import { recipientColor } from "../../contract/paper";
import { isEmail, newRecipient, ROLE_LABEL } from "../model";

export interface Person {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface Props {
  draft: EnvelopeDraftV1;
  edit(fn: (d: EnvelopeDraftV1) => EnvelopeDraftV1, key?: string | null): void;
  people: Person[];
  me: Person | null;
  setAccessCode(recipientKey: string, code: string | null): Promise<boolean>;
}

const ROLE_OPTIONS = (Object.keys(ROLE_LABEL) as RecipientRole[]).map((v) => ({ value: v, label: ROLE_LABEL[v] }));
const VERIFY_OPTIONS: { value: RecipientVerification; label: string }[] = [
  { value: "none", label: "Email link" },
  { value: "email_code", label: "Email code" },
  { value: "access_code", label: "Access code" },
];
const MAX_MATCHES = 6;

export function RecipientsPanel({ draft, edit, people, me, setAccessCode }: Props) {
  const [query, setQuery] = useState("");
  const [guest, setGuest] = useState<{ name: string; email: string } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const recipients = [...draft.recipients].sort((a, b) => a.order - b.order);
  const sequential = draft.settings.signing_order === "sequential";
  const meIn = !!me && recipients.some((r) => r.user_id === me.user_id);
  const derived: "me" | "both" | "others" = recipients.length > 0 && recipients.every((r) => r.user_id === me?.user_id) ? "me" : meIn ? "both" : "others";
  // "Me and others" is a choice before anyone else is added; it holds until the list contradicts it.
  const [intent, setIntent] = useState<"me" | "both" | "others" | null>(null);
  const consistent = intent === "both" ? meIn : intent === "others" ? !meIn : intent === "me" ? derived === "me" : false;
  const mode = intent && consistent ? intent : derived;

  const taken = new Set(recipients.map((r) => r.user_id).filter((v): v is string => !!v));
  const q = query.trim().toLowerCase();
  const matches = q
    ? people.filter((c) => !taken.has(c.user_id) && (c.display_name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q))).slice(0, MAX_MATCHES)
    : [];

  const renumber = (list: DraftRecipient[], seq: boolean) => list.map((r, i) => ({ ...r, order: seq ? i + 1 : 1 }));

  function add(seed: { full_name: string; email: string; user_id: string | null }) {
    edit((d) => {
      const r = newRecipient(d.recipients, seed);
      return { ...d, recipients: renumber([...d.recipients, r].sort((a, b) => a.order - b.order), d.settings.signing_order === "sequential") };
    });
    setQuery("");
    setGuest(null);
  }

  function patch(key: string, change: Partial<DraftRecipient>, coalesce: string | null = null) {
    edit((d) => ({ ...d, recipients: d.recipients.map((r) => (r.key === key ? { ...r, ...change } : r)) }), coalesce);
  }

  function remove(key: string) {
    edit((d) => ({
      ...d,
      recipients: renumber(d.recipients.filter((r) => r.key !== key).sort((a, b) => a.order - b.order), d.settings.signing_order === "sequential"),
      fields: d.fields.filter((f) => f.recipient_key !== key),
      groups: d.groups.filter((g) => g.recipient_key !== key),
    }));
  }

  function reorder(from: string, to: string) {
    if (from === to) return;
    edit((d) => {
      const list = [...d.recipients].sort((a, b) => a.order - b.order);
      const a = list.findIndex((r) => r.key === from);
      const b = list.findIndex((r) => r.key === to);
      const [row] = list.splice(a, 1);
      list.splice(b, 0, row);
      return { ...d, recipients: renumber(list, d.settings.signing_order === "sequential") };
    });
  }

  function setMode(next: "me" | "both" | "others") {
    if (!me) return;
    setIntent(next);
    edit((d) => {
      const others = d.recipients.filter((r) => r.user_id !== me.user_id);
      const mine = d.recipients.find((r) => r.user_id === me.user_id);
      const self = mine ?? newRecipient(d.recipients, { full_name: me.display_name ?? "", email: me.email ?? "", user_id: me.user_id });
      const list = next === "me" ? [self] : next === "both" ? [self, ...others] : others;
      return { ...d, recipients: renumber(list, d.settings.signing_order === "sequential") };
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {me && (
        <SegmentedControl
          aria-label="Who signs"
          fill
          value={recipients.length === 0 ? null : mode}
          onValueChange={setMode}
          data={[
            { value: "me", label: "Only me" },
            { value: "both", label: "Me and others" },
            { value: "others", label: "Others only" },
          ]}
        />
      )}
      {recipients.length > 1 && (
        <SegmentedControl
          aria-label="Signing order"
          fill
          value={draft.settings.signing_order}
          onValueChange={(v) =>
            edit((d) => ({ ...d, settings: { ...d.settings, signing_order: v }, recipients: renumber([...d.recipients].sort((a, b) => a.order - b.order), v === "sequential") }))
          }
          data={[
            { value: "sequential", label: "In order" },
            { value: "parallel", label: "All at once" },
          ]}
        />
      )}

      {recipients.map((r, i) => {
        const expanded = open === r.key;
        const outsider = !r.user_id;
        return (
          <div
            key={r.key}
            draggable
            onDragStart={() => setDragKey(r.key)}
            onDragOver={(e) => dragKey && e.preventDefault()}
            onDrop={() => dragKey && (reorder(dragKey, r.key), setDragKey(null))}
            className="rounded-md border border-border bg-card"
            style={{ borderLeft: `4px solid ${recipientColor(r.color_index)}` }}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Button variant="quiet" aria-label={expanded ? "Collapse" : "Expand"} icon={expanded ? <ChevronDown /> : <ChevronRight />} onClick={() => setOpen(expanded ? null : r.key)} />
              {sequential && <span className="w-4 shrink-0 text-center type-secondary tabular-nums text-muted-foreground">{i + 1}</span>}
              <div className="min-w-0 flex-1">
                <div className="truncate type-title">{r.full_name || "Name needed"}</div>
                <div className="flex min-w-0 items-center gap-1.5">
                  {r.user_id ? <Badge tone="info">Member</Badge> : <Badge>Outside</Badge>}
                  <span className={cn("truncate type-secondary", isEmail(r.email) ? "text-muted-foreground" : "text-destructive")}>{r.email || "Email needed"}</span>
                </div>
              </div>
              {sequential && recipients.length > 1 && (
                <div className="flex shrink-0">
                  <Button variant="quiet" aria-label="Move up" icon={<ArrowUp />} disabled={i === 0} onClick={() => reorder(r.key, recipients[i - 1].key)} />
                  <Button variant="quiet" aria-label="Move down" icon={<ArrowDown />} disabled={i === recipients.length - 1} onClick={() => reorder(r.key, recipients[i + 1].key)} />
                </div>
              )}
              <Button variant="quiet" aria-label={`Remove ${r.full_name || "recipient"}`} icon={<Trash2 />} onClick={() => remove(r.key)} />
            </div>
            {expanded && (
              <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
                <Field aria-label="Legal full name" placeholder="Legal full name" value={r.full_name} onChange={(e) => patch(r.key, { full_name: e.target.value }, `rn-${r.key}`)} />
                <Field aria-label="Email" type="email" placeholder="Email" value={r.email} disabled={!!r.user_id} onChange={(e) => patch(r.key, { email: e.target.value }, `re-${r.key}`)} />
                <Select aria-label="Role" value={r.role} options={ROLE_OPTIONS} onValueChange={(v) => patch(r.key, { role: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Field aria-label="Company" placeholder="Company" value={r.company ?? ""} onChange={(e) => patch(r.key, { company: e.target.value || null }, `rc-${r.key}`)} />
                  <Field aria-label="Job title" placeholder="Job title" value={r.job_title ?? ""} onChange={(e) => patch(r.key, { job_title: e.target.value || null }, `rt-${r.key}`)} />
                </div>
                <ProTextarea
                  aria-label={`Private message to ${r.full_name || "this person"}`}
                  placeholder="Private message to this person (optional)"
                  rows={2}
                  maxLength={2000}
                  value={r.private_message ?? ""}
                  onChange={(e) => patch(r.key, { private_message: e.target.value || null }, `rm-${r.key}`)}
                />
                {outsider && (
                  <>
                    <Select aria-label="How they open it" value={r.verification} options={VERIFY_OPTIONS} onValueChange={(v) => patch(r.key, { verification: v })} />
                    {r.verification === "access_code" && <AccessCodeField recipient={r} setAccessCode={setAccessCode} onSet={(has) => patch(r.key, { has_access_code: has })} />}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-col gap-1.5">
        <Field aria-label="Add a person" placeholder="Add a colleague or an email address" value={query} onChange={(e) => setQuery(e.target.value)} />
        {matches.map((c) => (
          <button
            key={c.user_id}
            type="button"
            onClick={() => add({ full_name: c.display_name || c.email?.split("@")[0] || "Member", email: c.email ?? "", user_id: c.user_id })}
            className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-left hover:bg-accent/40"
          >
            <UserPlus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate type-body">{c.display_name || c.email}</span>
            <span className="truncate type-secondary text-muted-foreground">{c.email}</span>
          </button>
        ))}
        {isEmail(query) && !people.some((c) => c.email?.toLowerCase() === query.trim().toLowerCase()) && (
          <Button icon={<UserPlus />} onClick={() => setGuest({ name: "", email: query.trim() })}>
            Add {query.trim()} from outside
          </Button>
        )}
        {guest && (
          <div className="flex flex-col gap-1.5 rounded-md border border-border p-2">
            <Field aria-label="Their legal full name" placeholder="Their legal full name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
            <Field aria-label="Their email" type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} />
            <Button variant="primary" disabled={!guest.name.trim() || !isEmail(guest.email)} onClick={() => add({ full_name: guest.name.trim(), email: guest.email.trim(), user_id: null })}>
              Add
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function AccessCodeField({ recipient, setAccessCode, onSet }: { recipient: DraftRecipient; setAccessCode(key: string, code: string | null): Promise<boolean>; onSet(has: boolean): void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <Field
        aria-label="Access code"
        type="password"
        autoComplete="off"
        placeholder={recipient.has_access_code ? "Code set — type to replace" : "Choose a code (4 or more characters)"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value) return;
          void setAccessCode(recipient.key, value)
            .then((has) => {
              onSet(has);
              setValue("");
              setError(null);
            })
            .catch((err: unknown) => setError(err instanceof Error ? err.message : "That code could not be saved."));
        }}
      />
      {recipient.has_access_code && !error && <span className="type-secondary text-muted-foreground">Code set</span>}
      {error && <span className="type-secondary text-destructive">{error}</span>}
    </div>
  );
}
