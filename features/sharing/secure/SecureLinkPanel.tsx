"use client";

// features/sharing/secure/SecureLinkPanel.tsx — "SECURE LINK — CODE REQUIRED", the sender's half.
//
// The third way to share, beside People and Public, for anything that must not travel in a plain
// link: the recipient gets a single-use link on one channel and a code on the other, and it opens
// once (aidream `services/secure_delivery/FEATURE.md`). It is ONE component, mounted by the ONE
// share dialog (`ShareModal`, the "Secure" tab) and by the vault item's own Share panel — never a
// second surface, never a per-feature variant.
//
// WHAT THIS PANEL NEVER HOLDS: a protected value or the link. It asks the server which protected
// fields this person may include, sends names and addresses, and draws the receipt the server
// writes. The list below comes from the door `platform.secure_delivery_sent` — the sender's own
// rows only; the delivery table itself is closed to signed-in clients (aidream 1350g).

import { useCallback, useEffect, useState } from "react";
import { Loader2, Mail, MessageSquare, ShieldCheck } from "lucide-react";

import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAppDispatch } from "@/lib/redux/hooks";
import { VaultRevealReauthDialog } from "@/features/secrets/components/SecretValue";

import {
  fetchSecureDeliveryOptions,
  listSentSecureDeliveries,
  revokeSecureDelivery,
  type SecureDeliveryOptions,
  SecureDeliveryRefusal,
  sendSecureDelivery,
  type SentSecureDelivery,
} from "./secureDeliveryService";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface SecureLinkPanelProps {
  resourceType: string;
  resourceId: string;
  resourceName: string;
}

const STATUS_WORDS: Record<string, string> = {
  pending: "Waiting to be opened",
  viewed: "Opened",
  revoked: "Turned off",
  expired: "Expired unopened",
  undeliverable: "Not delivered",
  locked: "Closed after wrong codes",
};

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function SecureLinkPanel({ resourceType, resourceId, resourceName }: SecureLinkPanelProps) {
  const dispatch = useAppDispatch();
  const [options, setOptions] = useState<SecureDeliveryOptions | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [linkChannel, setLinkChannel] = useState<"email" | "sms">("email");
  const [fields, setFields] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "warn" | "error"; text: string; remedy?: string | null } | null>(null);
  const [sent, setSent] = useState<SentSecureDelivery[] | null>(null);
  // Sending a password is a reveal: it needs the SAME fresh sign-in the vault asks for, through
  // the vault's own re-authentication dialog — never a second one.
  const [reauthOpen, setReauthOpen] = useState(false);

  const refreshSent = useCallback(() => {
    listSentSecureDeliveries(resourceType, resourceId)
      .then(setSent)
      .catch(() => setSent([]));
  }, [resourceType, resourceId]);

  useEffect(() => {
    let live = true;
    fetchSecureDeliveryOptions(dispatch, resourceType, resourceId)
      .then((o) => live && setOptions(o))
      .catch((err: unknown) =>
        live &&
        setOptionsError(
          err instanceof SecureDeliveryRefusal ? err.message : "Could not load what can be sent.",
        ),
      );
    refreshSent();
    return () => {
      live = false;
    };
  }, [dispatch, resourceType, resourceId, refreshSent]);

  const hasBoth = email.trim() !== "" && phone.trim() !== "";
  const canSend = email.trim() !== "" && !sending;

  async function send() {
    setSending(true);
    setResult(null);
    try {
      const receipt = await sendSecureDelivery(dispatch, {
        resource_type: resourceType,
        resource_id: resourceId,
        recipient_email: email.trim() || null,
        recipient_phone: phone.trim() || null,
        field_keys: fields,
        link_channel: hasBoth ? linkChannel : null,
        note: note.trim() || null,
      });
      setResult({ tone: receipt.same_channel ? "warn" : "ok", text: receipt.sentence });
      setEmail("");
      setPhone("");
      setNote("");
      setFields([]);
      refreshSent();
    } catch (err: unknown) {
      if (err instanceof SecureDeliveryRefusal && err.code === "recent_auth_required") {
        setResult({
          tone: "warn",
          text: "Confirm it is you, then press Send secure link again.",
        });
        setReauthOpen(true);
      } else if (err instanceof SecureDeliveryRefusal) {
        setResult({ tone: "error", text: err.message, remedy: err.remedy });
      } else {
        setResult({ tone: "error", text: "The secure link could not be sent. Try again." });
      }
    } finally {
      setSending(false);
    }
  }

  async function turnOff(row: SentSecureDelivery) {
    const ok = await confirm({
      title: "Turn off this secure link?",
      description: `The link to ${row.recipient_email ?? row.recipient_phone ?? "this person"} stops working at once and what it carries is deleted. They will have to ask you for a new one.`,
      confirmLabel: "Turn it off",
    });
    if (!ok) return;
    try {
      await revokeSecureDelivery(dispatch, row.id);
    } finally {
      refreshSent();
    }
  }

  const protectedFields = options?.protected_fields ?? [];

  return (
    <div className="space-y-4">
      <VaultRevealReauthDialog open={reauthOpen} onClose={() => setReauthOpen(false)} />
      <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          They get a link that opens once, and a code on a separate channel. No account needed.
          {options ? ` The link works for ${Math.round(options.link_ttl_minutes / 60)} hours.` : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="secure-email" className="text-xs">Their email</Label>
          <Input
            id="secure-email"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="name@example.com"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="secure-phone" className="text-xs">Their mobile, for the code</Label>
          <Input
            id="secure-phone"
            type="tel"
            autoComplete="off"
            value={phone}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)}
            placeholder="+1 310 555 0123"
          />
        </div>
      </div>

      {hasBoth ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Send the link by</span>
          <ToggleGroup
            type="single"
            size="sm"
            variant="outline"
            value={linkChannel}
            onValueChange={(v) => v && setLinkChannel(v as "email" | "sms")}
          >
            <ToggleGroupItem value="email" aria-label="Link by email">
              <Mail className="mr-1 h-3.5 w-3.5" /> Email
            </ToggleGroupItem>
            <ToggleGroupItem value="sms" aria-label="Link by text">
              <MessageSquare className="mr-1 h-3.5 w-3.5" /> Text
            </ToggleGroupItem>
          </ToggleGroup>
          <span>and the code by {linkChannel === "email" ? "text" : "email"}.</span>
        </div>
      ) : email.trim() !== "" ? (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          Without a mobile number, the link and the code both go by email — anyone who can read that
          inbox could open it.
        </p>
      ) : null}

      {optionsError ? (
        <p className="text-xs text-destructive">
          {optionsError}
          <ErrorAlchemyMenu error={optionsError} operation="Load the secure-link options" />
        </p>
      ) : null}
      {protectedFields.length > 0 ? (
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium">Include protected fields from {resourceName}</legend>
          {protectedFields.map((f) => (
            <div key={f.key} className="flex items-start gap-2">
              <Checkbox
                id={`secure-field-${f.key}`}
                checked={fields.includes(f.key)}
                disabled={!f.available}
                onCheckedChange={(checked) =>
                  setFields((cur) =>
                    checked ? [...cur, f.key] : cur.filter((k) => k !== f.key),
                  )
                }
              />
              <div>
                <Label htmlFor={`secure-field-${f.key}`} className="text-sm">
                  {f.label}
                </Label>
                {!f.available && f.reason ? (
                  <p className="text-xs text-muted-foreground">{f.reason}</p>
                ) : null}
              </div>
            </div>
          ))}
        </fieldset>
      ) : null}

      <div className="space-y-1">
        <Label htmlFor="secure-note" className="text-xs">Message (optional, shown once with it)</Label>
        <Textarea
          id="secure-note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <Button className="w-full" onClick={send} disabled={!canSend}>
        {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        Send secure link
      </Button>

      {result ? (
        <div
          className={
            result.tone === "error"
              ? "rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-sm text-destructive"
              : result.tone === "warn"
                ? "rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm"
                : "rounded-md border border-border bg-muted/40 p-2.5 text-sm"
          }
        >
          <p>{result.text}</p>
          {result.remedy ? <p className="mt-1 text-xs opacity-80">{result.remedy}</p> : null}
        </div>
      ) : null}

      {sent && sent.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-medium">Sent securely</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {sent.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-2 p-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate">{row.recipient_email ?? row.recipient_phone}</p>
                  <p className="text-xs text-muted-foreground">
                    {STATUS_WORDS[row.status] ?? row.status}
                    {row.status === "viewed" && row.viewed_at ? ` ${when(row.viewed_at)}` : ""}
                    {row.status === "pending" ? ` · until ${when(row.expires_at)}` : ""}
                    {row.field_keys.length > 0 ? ` · with ${row.field_keys.join(", ")}` : ""}
                  </p>
                </div>
                {row.status === "pending" ? (
                  <Button size="sm" variant="outline" onClick={() => void turnOff(row)}>
                    Turn off
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
