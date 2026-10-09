"use client";

// features/esign/signer/parts/Panels.tsx — the consent gate over the visible document, and every
// end screen (esign-parity CONTRACT §13.2; champion S2.1–S2.4, S11.3–S11.6).

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { CheckCircle2, Download, FileSignature, Printer, ShieldCheck, Undo2, UserRoundCheck, XCircle } from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import { Checkbox } from "@/components/ui/checkbox";
import { ErrorNotice } from "@ai-matrx/design-system";
import { Spinner } from "@/components/ui/loaders/Spinner";
import { usePublishPageBottomDock } from "@/lib/layout/usePublishPageBottomDock";
import { loginHref, signUpHref } from "@/utils/auth/auth-destination";
import { withSignerHint } from "@/utils/auth/signer-hint-link";

import type { RecordedRow } from "./Dialogs";

export interface LandingFacts {
  senderName: string;
  organizationName: string;
  logoUrl: string | null;
  title: string;
  pages: number | null;
  documents: number;
  message: string | null;
  privateMessage: string | null;
  expiresAt: string | null;
}

export function OrgMark({ name, logoUrl, size = 28 }: { name: string; logoUrl: string | null; size?: number }) {
  if (logoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- the sending organization's own logo URL
    return <img src={logoUrl} alt={name} style={{ height: size, width: size }} className="shrink-0 rounded object-contain" />;
  }
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      aria-hidden
      style={{ height: size, width: size }}
      className="flex shrink-0 items-center justify-center rounded bg-primary/15 text-xs font-semibold text-primary"
    >
      {letters || "AM"}
    </span>
  );
}

/** Who is asking, for what, and their words — the landing facts every signer sees first. */
export function LandingHeader({ facts }: { facts: LandingFacts }) {
  const pages =
    facts.pages !== null
      ? `${facts.pages} page${facts.pages === 1 ? "" : "s"}${facts.documents > 1 ? ` in ${facts.documents} documents` : ""}`
      : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <OrgMark name={facts.organizationName} logoUrl={facts.logoUrl} size={32} />
        <div className="min-w-0">
          <p className="truncate type-body font-medium text-foreground">{facts.organizationName}</p>
          <p className="truncate type-secondary text-muted-foreground">{facts.senderName} sent you a document to sign</p>
        </div>
      </div>
      <div>
        <p className="type-title text-foreground">{facts.title}</p>
        {pages ? <p className="type-secondary text-muted-foreground">{pages}</p> : null}
      </div>
      {facts.message ? (
        <blockquote className="whitespace-pre-line border-l-2 border-primary/50 pl-3 type-body text-foreground">
          {facts.message}
        </blockquote>
      ) : null}
      {facts.privateMessage ? (
        <blockquote className="whitespace-pre-line border-l-2 border-primary/50 pl-3 type-body text-foreground">
          {facts.privateMessage}
        </blockquote>
      ) : null}
    </div>
  );
}

/** The gate: left panel on desktop, top sheet on a phone — never a bottom banner (S2.3). */
export function ConsentPanel({
  facts,
  disclosure,
  agreed,
  onAgreed,
  ready,
  busy,
  error,
  onContinue,
}: {
  facts: LandingFacts;
  disclosure: { title: string; text: string } | null;
  agreed: boolean;
  onAgreed: (next: boolean) => void;
  ready: boolean;
  busy: boolean;
  error: string | null;
  onContinue: () => void;
}) {
  return (
    <aside
      aria-label="Before you sign"
      className="absolute inset-x-0 top-0 z-40 flex max-h-[78dvh] flex-col gap-4 overflow-y-auto border-b border-border bg-card p-4 shadow-xl sm:inset-x-auto sm:bottom-4 sm:left-4 sm:top-4 sm:max-h-none sm:w-[380px] sm:rounded-lg sm:border"
    >
      <LandingHeader facts={facts} />
      {disclosure ? (
        <details className="rounded-md border border-border bg-background/60 px-3 py-2">
          <summary className="type-secondary font-medium text-foreground">{disclosure.title}</summary>
          <p className="mt-2 whitespace-pre-line type-secondary text-muted-foreground">{disclosure.text}</p>
        </details>
      ) : null}
      <label htmlFor="esign-consent" className="flex min-h-11 items-start gap-3">
        <Checkbox
          id="esign-consent"
          size="md"
          className="mt-0.5"
          checked={agreed}
          onCheckedChange={(next) => onAgreed(next === true)}
        />
        <span className="type-body text-foreground">I agree to use electronic records and signatures.</span>
      </label>
      {error ? <ErrorNotice size="inline" message={error} operation="Agree to electronic signing" className="type-body" /> : null}
      <Button
        variant="primary"
        disabled={!agreed || !ready || busy}
        icon={busy || !ready ? <Spinner size="xs" className="text-current" /> : undefined}
        onClick={onContinue}
      >
        {ready ? "Continue" : "Opening the document"}
      </Button>
    </aside>
  );
}

export type EndKind = "finalized" | "already_signed" | "declined" | "assigned" | "later" | "reviewed" | "refused";

export function EndScreen({
  kind,
  title,
  senderName,
  everyoneSigned,
  remaining,
  waitingOn = [],
  signedAt,
  recorded,
  outsider,
  signupHint,
  message,
  downloading,
  onDownload,
  onPrint,
  onCertificate,
  onReturn,
}: {
  kind: EndKind;
  title: string;
  senderName: string;
  everyoneSigned: boolean;
  remaining: number;
  /** Names of the people who have not signed yet (may be shorter than `remaining`). */
  waitingOn?: string[];
  signedAt: string | null;
  recorded: RecordedRow[];
  outsider: boolean;
  signupHint: string | null;
  /** refused: the one sentence; assigned: who it went to. */
  message?: string;
  downloading: boolean;
  onDownload?: () => void;
  onPrint?: () => void;
  onCertificate?: () => void;
  /** Finish later / back to the document. */
  onReturn?: () => void;
}) {
  const head = HEADS[kind];
  const Icon = head.icon;
  const next =
    kind === "finalized" || kind === "already_signed"
      ? everyoneSigned
        ? onDownload
          ? `Everyone has signed. We emailed ${senderName}. Your signed copy is ready to download.`
          : `Everyone has signed. We emailed ${senderName}. Your signed copy is still being put together.`
        : `We emailed ${senderName} that you signed. ${remaining > 0 ? `${waitingOn.length > 0 ? `Still to sign: ${waitingOn.join(", ")}.` : `${remaining} more ${remaining === 1 ? "person signs" : "people sign"}.`} Then everyone gets the signed copy.` : "You get the signed copy by email when it is complete."}`
      : kind === "declined"
        ? `We told ${senderName} you declined, with your reason.`
        : kind === "assigned"
          ? `We sent it to ${message ?? "them"} and told ${senderName}.`
          : kind === "later"
            ? "Everything you entered is saved. Open the link in your email to finish."
            : kind === "reviewed"
              ? `We told ${senderName} you reviewed it.`
              : (message ?? "");
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-8">
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-5 py-6 text-center">
        <Icon className={head.tone} style={{ height: 40, width: 40 }} />
        <h1 className="text-xl font-semibold text-foreground">{head.title}</h1>
        <p className="type-body text-foreground">{title}</p>
        <p className="type-body text-muted-foreground">{next}</p>
        {signedAt && (kind === "finalized" || kind === "already_signed") ? (
          <p className="flex items-center gap-1.5 type-secondary text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            Recorded {new Date(signedAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
          </p>
        ) : null}
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onDownload ? (
            <Button
              variant="primary"
              icon={downloading ? <Spinner size="xs" className="text-current" /> : <Download />}
              disabled={downloading}
              onClick={onDownload}
            >
              {everyoneSigned ? "Download signed copy" : "Download"}
            </Button>
          ) : null}
          {onPrint ? (
            <Button variant="outline" icon={<Printer />} onClick={onPrint}>
              Print
            </Button>
          ) : null}
          {onCertificate && everyoneSigned ? (
            <Button variant="outline" icon={<ShieldCheck />} onClick={onCertificate}>
              Certificate
            </Button>
          ) : null}
          {onReturn ? (
            <Button variant="outline" icon={<Undo2 />} onClick={onReturn}>
              Back to the document
            </Button>
          ) : null}
        </div>
      </div>

      {recorded.length > 0 ? (
        <section aria-label="What was recorded" className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border px-4 py-2 type-secondary font-medium text-foreground">What was recorded</h2>
          <ul className="divide-y divide-border">
            {recorded.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-1.5">
                <span className="truncate type-secondary text-muted-foreground">{row.label}</span>
                {row.markUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a data: URL of the signer's own mark
                  <img src={row.markUrl} alt={row.value} className="h-7 max-w-[10rem] rounded-sm bg-white object-contain" />
                ) : (
                  <span className="max-w-[60%] truncate text-right type-body text-foreground">{row.value}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {outsider && kind !== "refused" ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-card px-4 py-4">
          <div className="flex items-center gap-2 type-title text-foreground">
            <FileSignature className="h-4 w-4" />
            Keep your signed documents
          </div>
          <p className="type-body text-muted-foreground">A free AI Matrx account — and send your own for signature.</p>
          <Button variant="primary" asChild>
            <Link href={withSignerHint(signUpHref("/esign"), signupHint)}>Create free account</Link>
          </Button>
          <Button variant="quiet" asChild>
            <Link href={loginHref("/esign")}>I have an account</Link>
          </Button>
        </div>
      ) : !outsider ? (
        <Button variant="outline" asChild>
          <Link href="/esign">Back to E-Signatures</Link>
        </Button>
      ) : null}
    </div>
  );
}

const HEADS: Record<EndKind, { title: string; icon: typeof CheckCircle2; tone: string }> = {
  finalized: { title: "Finalized!", icon: CheckCircle2, tone: "text-success" },
  already_signed: { title: "You signed this document", icon: CheckCircle2, tone: "text-success" },
  declined: { title: "You declined to sign", icon: XCircle, tone: "text-muted-foreground" },
  assigned: { title: "Assigned", icon: UserRoundCheck, tone: "text-success" },
  later: { title: "Saved for later", icon: CheckCircle2, tone: "text-success" },
  reviewed: { title: "Thanks for reviewing", icon: CheckCircle2, tone: "text-success" },
  refused: { title: "This document cannot be opened", icon: XCircle, tone: "text-muted-foreground" },
};

/** The phone's input drawer. It publishes its height so the assists launcher and the admin error badge rest above it. */
export function PhoneDrawer({ label, children }: { label: string; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  usePublishPageBottomDock(ref, true);
  return (
    <section
      ref={ref}
      aria-label={label}
      data-matrx-floating-bottom
      className="absolute inset-x-0 bottom-0 z-40 flex max-h-[60dvh] flex-col gap-3 overflow-y-auto rounded-t-xl border-t border-border bg-card p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
    >
      {children}
    </section>
  );
}
