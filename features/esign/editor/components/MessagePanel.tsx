"use client";

// features/esign/editor/components/MessagePanel.tsx — the email's subject and message, then how
// the envelope behaves once sent: expiry, reminders, hand-off, fill-all, form view, date format.

import { Select, Switch } from "@ai-matrx/design-system/controls";
import { ProTextarea } from "@/components/official/ProTextarea";

import type { EnvelopeDraftV1 } from "../../contract/draft";
import { useSenderName } from "../useSenderName";
import { DATE_FORMATS } from "../model";
import { ProInput } from "@/components/official/ProInput";

const EXPIRY = [7, 14, 30, 60, 90, 180, 365].map((d) => ({ value: String(d), label: `${d} days` }));
const CADENCE: { value: string; label: string; days: number[] }[] = [
  { value: "3-7", label: "After 3 and 7 days", days: [3, 7] },
  { value: "2-4-6", label: "Every 2 days, 3 times", days: [2, 4, 6] },
  { value: "7-14", label: "Weekly, twice", days: [7, 14] },
  { value: "1", label: "Next day", days: [1] },
];
const WARNING = [
  { value: "0", label: "No warning" },
  { value: "1", label: "1 day before" },
  { value: "3", label: "3 days before" },
  { value: "7", label: "7 days before" },
];

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="type-body">{label}</span>
      {children}
    </div>
  );
}

interface Props {
  draft: EnvelopeDraftV1;
  edit(fn: (d: EnvelopeDraftV1) => EnvelopeDraftV1, key?: string | null): void;
  templateMode?: boolean;
}

export function MessagePanel({ draft, edit, templateMode }: Props) {
  const sender = useSenderName();
  const s = draft.settings;
  const setting = <K extends keyof typeof s>(k: K, v: (typeof s)[K]) => edit((d) => ({ ...d, settings: { ...d.settings, [k]: v } }));
  const cadenceKey = CADENCE.find((c) => JSON.stringify(c.days) === JSON.stringify(s.reminders.cadence_days))?.value ?? "3-7";
  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2">
        <h3 className="type-title text-foreground">{templateMode ? "Template email" : "Email to recipients"}</h3>
        <ProInput aria-label="Envelope name" placeholder="Envelope name" value={draft.title} onChange={(e) => edit((d) => ({ ...d, title: e.target.value }), "title")} />
        <ProInput
          aria-label="Email subject"
          placeholder={draft.title.trim() ? (sender ? `${sender} sent you ${draft.title.trim()} to sign` : `You have ${draft.title.trim()} to sign`) : "Email subject"}
          maxLength={200}
          value={draft.email_subject}
          onChange={(e) => edit((d) => ({ ...d, email_subject: e.target.value }), "subject")}
        />
        <ProTextarea
          aria-label="Message to everyone"
          placeholder="Message to everyone (optional)"
          rows={4}
          maxLength={4000}
          value={draft.message}
          onChange={(e) => edit((d) => ({ ...d, message: e.target.value }), "message")}
        />
      </section>
      <section className="flex flex-col gap-2.5">
        <h3 className="type-title text-foreground">After it is sent</h3>
        <Row label="Expires after">
          <Select aria-label="Expires after" value={String(s.expires_in_days)} options={EXPIRY} onValueChange={(v) => setting("expires_in_days", Number(v))} />
        </Row>
        <Row label="Warn before it expires">
          <Select aria-label="Expiry warning" value={String(s.expiry_warning_days ?? 0)} options={WARNING} onValueChange={(v) => setting("expiry_warning_days", Number(v) || null)} />
        </Row>
        <Row label="Send reminders">
          <Switch aria-label="Send reminders" checked={s.reminders.enabled} onCheckedChange={(v) => setting("reminders", { ...s.reminders, enabled: v })} />
        </Row>
        {s.reminders.enabled && (
          <Row label="Reminder schedule">
            <Select
              aria-label="Reminder schedule"
              value={cadenceKey}
              options={CADENCE.map(({ value, label }) => ({ value, label }))}
              onValueChange={(v) => setting("reminders", { ...s.reminders, cadence_days: CADENCE.find((c) => c.value === v)?.days ?? [3, 7] })}
            />
          </Row>
        )}
        <Row label="Let signers assign it">
          <Switch aria-label="Let signers assign it" checked={s.allow_delegation} onCheckedChange={(v) => setting("allow_delegation", v)} />
        </Row>
        <Row label="Offer Fill all signatures">
          <Switch aria-label="Offer fill all" checked={s.allow_fill_all} onCheckedChange={(v) => setting("allow_fill_all", v)} />
        </Row>
        <Row label="Form view">
          <Select
            aria-label="Form view"
            value={s.form_view}
            options={[{ value: "off", label: "Off" }, { value: "available", label: "Available" }, { value: "default", label: "Opens first" }]}
            onValueChange={(v) => setting("form_view", v)}
          />
        </Row>
        <Row label="Date format">
          <Select aria-label="Date format" value={s.date_format_default} options={DATE_FORMATS} onValueChange={(v) => setting("date_format_default", v)} />
        </Row>
      </section>
    </div>
  );
}
