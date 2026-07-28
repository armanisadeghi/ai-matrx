"use client";

// features/crm/components/record/ContactPointsCard.tsx
//
// Contact methods, ALWAYS rendered from the joined medium (the email/phone
// string lives on crm.contact_medium — the point only says who/how/why).
// Deliverability state (suppression, bounce, unsubscribe, DNC) is the
// medium's, shown wherever the value is shown. The primary star flips ONLY
// through the crm_set_primary_contact_point RPC.

import { useState } from "react";
import { toast } from "@/lib/toast";
import {
  AtSign,
  Globe,
  Hash,
  Link2,
  MessageSquare,
  Phone,
  Plus,
  Star,
  Trash2,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { cn } from "@/lib/utils";
import {
  addContactPoint,
  removeContactPoint,
  setPrimaryContactPoint,
} from "../../service";
import type { ContactChannel, ContactPoint } from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";

const CHANNEL_ICONS: Record<string, LucideIcon> = {
  email: AtSign,
  phone: Phone,
  social: Hash,
  messaging: MessageSquare,
  url: Link2,
  external_id: Globe,
};

const ADDABLE_CHANNELS: { value: ContactChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "social", label: "Social" },
  { value: "url", label: "URL" },
];

interface Props {
  partyId: string;
  orgId: string;
  points: ContactPoint[];
  onChanged: () => Promise<void>;
}

function deliverabilityBadge(point: ContactPoint) {
  const m = point.medium;
  const problems: string[] = [];
  if (m.suppressed_at) problems.push("Suppressed");
  if (m.unsubscribed_at) problems.push("Unsubscribed");
  if (m.dnc_state === "listed") problems.push("DNC listed");
  if (m.bounce_type === "hard" || m.bounce_type === "block")
    problems.push("Bounced");
  if (m.complaint_at) problems.push("Complaint");
  if (m.verification_status === "invalid") problems.push("Invalid");
  if (problems.length === 0) return null;
  return (
    <span
      title={problems.join(" · ")}
      className="inline-flex shrink-0 items-center rounded-full border border-destructive/20 bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-destructive"
    >
      {problems[0]}
    </span>
  );
}

export function ContactPointsCard({ partyId, orgId, points, onChanged }: Props) {
  const [adding, setAdding] = useState(false);
  const [channel, setChannel] = useState<ContactChannel>("email");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!value.trim()) return;
    setSaving(true);
    try {
      const hasPrimaryForChannel = points.some(
        (p) => p.channel === channel && p.is_primary,
      );
      await addContactPoint({
        partyId,
        orgId,
        channel,
        value,
        label: label || undefined,
        // First entry on a channel becomes its primary automatically.
        makePrimary: !hasPrimaryForChannel,
      });
      setValue("");
      setLabel("");
      setAdding(false);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSaving(false);
    }
  };

  const makePrimary = async (point: ContactPoint) => {
    try {
      await setPrimaryContactPoint(point.id);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to set primary");
    }
  };

  const remove = async (point: ContactPoint) => {
    const ok = await confirm({
      title: `Remove ${point.medium.display_value ?? point.medium.value_raw}?`,
      description:
        "The value itself (and its deliverability history) stays on the org — only this record's link is removed.",
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!ok) return;
    try {
      await removeContactPoint(point.id);
      await onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  };

  return (
    <SectionCard
      title="Contact"
      Icon={AtSign}
      count={points.length}
      action={
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-label={adding ? "Cancel add" : "Add contact method"}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {adding ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
        </button>
      }
    >
      {adding && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded border border-border bg-muted/30 p-1.5">
          <Select
            value={channel}
            onValueChange={(v) => setChannel(v as ContactChannel)}
          >
            <SelectTrigger className="h-7 w-24 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADDABLE_CHANNELS.map((c) => (
                <SelectItem key={c.value} value={c.value} className="text-xs">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            placeholder={
              channel === "email"
                ? "name@company.com"
                : channel === "phone"
                  ? "+1 310 555 1234"
                  : "Value"
            }
            className="h-7 min-w-[10rem] flex-1 text-xs"
            autoFocus
          />
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label"
            className="h-7 w-20 text-xs"
          />
          <Button
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={submit}
            disabled={saving || !value.trim()}
          >
            Add
          </Button>
        </div>
      )}

      {points.length === 0 && !adding ? (
        <SectionEmpty>No contact methods yet</SectionEmpty>
      ) : (
        <ul className="space-y-0.5">
          {points.map((point) => {
            const Icon = CHANNEL_ICONS[point.channel ?? ""] ?? Globe;
            const display =
              point.medium.display_value ?? point.medium.value_raw;
            return (
              <li
                key={point.id}
                className="group flex items-center gap-2 rounded px-1.5 py-1 hover:bg-accent/50"
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 truncate text-sm text-foreground">
                  {display}
                </span>
                {point.label && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {point.label}
                  </span>
                )}
                {deliverabilityBadge(point)}
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={
                      point.is_primary
                        ? "Primary contact method"
                        : "Make primary"
                    }
                    onClick={() => {
                      if (!point.is_primary) void makePrimary(point);
                    }}
                    className={cn(
                      "rounded p-0.5",
                      point.is_primary
                        ? "text-amber-500"
                        : "text-muted-foreground/40 opacity-0 hover:text-amber-500 group-hover:opacity-100",
                    )}
                  >
                    <Star
                      className={cn(
                        "h-3.5 w-3.5",
                        point.is_primary && "fill-amber-400",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    aria-label="Remove contact method"
                    onClick={() => void remove(point)}
                    className="rounded p-0.5 text-muted-foreground/40 opacity-0 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}
