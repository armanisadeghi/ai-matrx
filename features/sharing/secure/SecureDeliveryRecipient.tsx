"use client";

// features/sharing/secure/SecureDeliveryRecipient.tsx — THE PAGE A SECURE LINK OPENS.
//
// Somebody was sent something private — a password, a Social Security number, a record — the way
// an accountant or a hospital sends it: a link on one channel, a code on the other, opened once.
// They have no account and never need one (the capture-a-secret ruling: no sign-in wall, ever).
//
// Four moments, each one screen:
//   1. WHO sent it and WHERE the code will go — nothing about WHAT it is (the name of a medical
//      record is itself what the code protects). One button: "Send me the code". Opening the page
//      sends nothing, so a mail scanner that prefetches the link texts nobody.
//   2. The code field — six digits, the tries left on a wrong one, "send a new code".
//   3. The item, ONCE, with copy buttons. Never stored in the browser; leaving the page loses it,
//      and the page says so before the code is entered.
//   4. Every dead end names itself and its remedy: already opened (and when), expired, turned off
//      by the sender, locked — "Ask the sender for a new link."

import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, Loader2, Lock, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import { useAppDispatch } from "@/lib/redux/hooks";

import {
  openSecureDelivery,
  requestSecureDeliveryCode,
  type SecureDeliveryPage,
  SecureDeliveryRefusal,
  viewSecureDelivery,
} from "./secureDeliveryService";

type Phase =
  | { kind: "loading" }
  | { kind: "page"; page: SecureDeliveryPage }
  | { kind: "unreachable"; message: string };

function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function channelWord(channel: string | null | undefined): string {
  return channel === "sms" ? "a text" : "an email";
}

export function SecureDeliveryRecipient({ token }: { token: string }) {
  const dispatch = useAppDispatch();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"code" | "view" | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    openSecureDelivery(dispatch, token)
      .then((page) => live && setPhase({ kind: "page", page }))
      .catch((err: unknown) =>
        live &&
        setPhase({
          kind: "unreachable",
          message:
            err instanceof SecureDeliveryRefusal
              ? err.message
              : "We could not reach AI Matrx just now. Your link is fine — try again in a moment.",
        }),
      );
    return () => {
      live = false;
    };
  }, [dispatch, token]);

  async function sendCode() {
    setBusy("code");
    setNotice(null);
    try {
      const page = await requestSecureDeliveryCode(dispatch, token);
      if (page.code_sent) {
        setCodeSent(true);
        setPhase({ kind: "page", page });
      } else if (page.state === "ready") {
        setNotice(page.message ?? "The code could not be sent. Try again in a minute.");
      } else {
        setPhase({ kind: "page", page });
      }
    } catch {
      setNotice("We could not send the code just now. Try again in a minute.");
    } finally {
      setBusy(null);
    }
  }

  async function view() {
    setBusy("view");
    setNotice(null);
    try {
      const page = await viewSecureDelivery(dispatch, token, code);
      if (page.state === "wrong_code") {
        setNotice(page.message ?? "That code is not right.");
        setCode("");
      } else {
        setPhase({ kind: "page", page });
      }
    } catch {
      setNotice("We could not check the code just now. Try again in a moment.");
    } finally {
      setBusy(null);
    }
  }

  if (phase.kind === "loading") {
    return (
      <Shell>
        <div className="flex justify-center py-10" aria-busy="true">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  if (phase.kind === "unreachable") {
    return (
      <Shell>
        <p className="text-sm text-muted-foreground">{phase.message}</p>
        <Button className="mt-6 w-full" variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </Shell>
    );
  }

  const page = phase.page;
  const from = page.sender_name
    ? `${page.sender_name}${page.organization_name ? ` of ${page.organization_name}` : ""}`
    : "Someone";

  if (page.state === "opened") {
    return <Opened page={page} from={from} />;
  }

  if (page.state !== "ready") {
    return (
      <Shell>
        <Lock className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-4 text-base font-medium">
          {page.message ?? "This secure link is not valid."}
        </p>
        {page.state === "viewed" && page.viewed_at ? (
          <p className="mt-2 text-sm text-muted-foreground">
            It was opened {when(page.viewed_at)}. If that was not you, tell {from} now.
          </p>
        ) : null}
        {page.remedy ? <p className="mt-2 text-sm text-muted-foreground">{page.remedy}</p> : null}
        {page.state === "locked" && page.locked_until ? (
          <p className="mt-2 text-sm text-muted-foreground">
            You can try again after {when(page.locked_until)}.
          </p>
        ) : null}
      </Shell>
    );
  }

  return (
    <Shell>
      <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
      <h1 className="mt-4 text-xl font-medium">{from} sent you something secure</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        It opens once. You will see it on this page only — copy what you need before you leave.
      </p>

      {!codeSent ? (
        <div className="mt-8">
          <p className="text-sm text-muted-foreground">
            We will send a six-digit code by {channelWord(page.code_channel)} to{" "}
            <span className="font-medium text-foreground">{page.masked_target}</span>.
          </p>
          <Button className="mt-4 w-full" onClick={sendCode} disabled={busy !== null}>
            {busy === "code" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Send me the code
          </Button>
        </div>
      ) : (
        <form
          className="mt-8 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            void view();
          }}
        >
          <Label htmlFor="secure-code">
            Code sent by {channelWord(page.code_channel)} to {page.masked_target}
          </Label>
          <Input
            id="secure-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className="mt-2 text-center text-lg tracking-[0.4em]"
            autoFocus
          />
          <Button className="mt-4 w-full" type="submit" disabled={code.length !== 6 || busy !== null}>
            {busy === "view" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Open
          </Button>
          <Button
            type="button"
            variant="ghost"
            className="mt-2 w-full"
            onClick={sendCode}
            disabled={busy !== null}
          >
            Send a new code
          </Button>
        </form>
      )}
      {notice ? <p className="mt-4 text-sm text-destructive">{notice}</p> : null}
      <p className="mt-8 text-xs text-muted-foreground">
        The link stops working {when(page.expires_at)}. Not expecting this? Close this page — nothing
        opens without the code.
      </p>
    </Shell>
  );
}

function Opened({ page, from }: { page: SecureDeliveryPage; from: string }) {
  const record = Object.entries(page.record ?? {}).filter(
    ([, v]) => v !== null && v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col px-5 pb-safe pt-10 matrx-touch-targets">
      <p className="text-xs text-muted-foreground">From {from}</p>
      <h1 className="mt-1 text-xl font-medium">{page.label}</h1>
      <p className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        This is the only time it will show. Copy what you need now — it is already deleted from our
        side, and it will not come back if you leave or reload.
      </p>
      {page.note ? <p className="mt-4 whitespace-pre-wrap text-sm">{page.note}</p> : null}
      {(page.fields ?? []).length > 0 ? (
        <div className="mt-6 space-y-3">
          {(page.fields ?? []).map((f) => (
            <FieldRow key={f.key ?? f.label ?? ""} label={f.label ?? f.key ?? ""} value={f.value ?? ""} secret={f.secret ?? false} />
          ))}
        </div>
      ) : null}
      {record.length > 0 ? (
        <div className="mt-6 space-y-3">
          {record.map(([k, v]) => (
            <FieldRow
              key={k}
              label={k.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
              value={Array.isArray(v) ? v.join(", ") : String(v)}
              secret={false}
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}

function FieldRow({ label, value, secret }: { label: string; value: string; secret: boolean }) {
  const [shown, setShown] = useState(!secret);
  const [copied, setCopied] = useState(false);
  const multiline = value.includes("\n") || value.length > 80;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="flex items-center gap-1">
          {secret ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setShown((s) => !s)}
              aria-label={shown ? `Hide ${label}` : `Show ${label}`}
            >
              {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Copy ${label}`}
            onClick={async () => {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
      </div>
      <div className={`mt-1 break-words font-mono text-sm ${multiline ? "whitespace-pre-wrap" : ""}`}>
        {shown ? value : "•".repeat(Math.min(Math.max(value.length, 8), 24))}
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-5 pb-safe pt-8 text-center matrx-touch-targets">
      {children}
    </main>
  );
}
