"use client";

// features/esign/signer/parts/TopBar.tsx — THE ONE TOP BAR (esign-parity CONTRACT §13.2; champion
// S5.1–S5.8, S9.9, S11.2, S13.2). Who sent it and what it is; "Action required — N required fields
// remaining" with a progress bar; Start / Next field / Next required; Finish, which turns green and
// takes the focus once nothing required is left; and the Actions menu. On a phone it is one row of
// controls over one thin guidance row.

import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Check,
  CircleHelp,
  Clock,
  Download,
  History,
  ListChecks,
  MoreHorizontal,
  Printer,
  ShieldCheck,
  SunDim,
  UserRoundPlus,
  XCircle,
} from "lucide-react";

import { Button } from "@ai-matrx/design-system/controls";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { SaveState } from "../autosave";
import { OrgMark } from "./Panels";

export type GuideMode = "consent" | "start" | "next" | "missed" | "ready" | "viewer";

export interface TopBarProps {
  title: string;
  senderName: string;
  organizationName: string;
  logoUrl: string | null;
  mode: GuideMode;
  remaining: number;
  total: number;
  saveState: SaveState;
  compact: boolean;
  busy: boolean;
  delegationAllowed: boolean;
  formViewAvailable: boolean;
  formView: boolean;
  dark: boolean;
  dim: boolean;
  completed: boolean;
  onGuide: () => void;
  onFinish: () => void;
  onFinishLater: () => void;
  onDecline: () => void;
  onAssign: () => void;
  onPrint: () => void;
  onDownload: () => void;
  onHistory: () => void;
  onHelp: () => void;
  onCertificate: () => void;
  onFormView: () => void;
  onDim: () => void;
}

export function TopBar(p: TopBarProps) {
  const finishRef = useRef<HTMLButtonElement | null>(null);
  // The last required field just got done: the finish action takes the focus (S11.2).
  const wasReady = useRef(false);
  useEffect(() => {
    if (p.mode === "ready" && !wasReady.current) finishRef.current?.focus();
    wasReady.current = p.mode === "ready";
  }, [p.mode]);

  const done = p.total - p.remaining;
  const pct = p.total === 0 ? 100 : Math.round((done / p.total) * 100);
  const guideLabel =
    p.mode === "start" ? "Start" : p.mode === "missed" ? "Next required" : p.mode === "viewer" ? "" : "Next field";
  const status =
    p.mode === "consent"
      ? null
      : p.mode === "viewer"
        ? "Review the document"
        : p.mode === "ready"
          ? "All required fields are done"
          : p.mode === "missed"
            ? `${p.remaining} required field${p.remaining === 1 ? "" : "s"} missed`
            : `Action required — ${p.remaining} required field${p.remaining === 1 ? "" : "s"} remaining`;
  const tone = p.mode === "ready" ? "bg-success" : p.mode === "missed" ? "bg-destructive" : "bg-primary";

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="quiet" icon={<MoreHorizontal />} aria-label="More actions" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {p.mode !== "consent" && p.mode !== "viewer" ? (
          <DropdownMenuItem onSelect={p.onFinishLater}>
            <Clock className="h-4 w-4" /> Finish later
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={p.onDecline}>
          <XCircle className="h-4 w-4" /> Decline to sign
        </DropdownMenuItem>
        {p.delegationAllowed ? (
          <DropdownMenuItem onSelect={p.onAssign}>
            <UserRoundPlus className="h-4 w-4" /> Assign to someone else
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        {p.formViewAvailable ? (
          <DropdownMenuItem onSelect={p.onFormView}>
            <ListChecks className="h-4 w-4" /> {p.formView ? "Show the document" : "Form view"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={p.onPrint}>
          <Printer className="h-4 w-4" /> Print
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={p.onDownload}>
          <Download className="h-4 w-4" /> Download
        </DropdownMenuItem>
        {p.dark ? (
          <DropdownMenuItem onSelect={p.onDim}>
            <SunDim className="h-4 w-4" /> {p.dim ? "Full brightness page" : "Dim the page"}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={p.onHistory}>
          <History className="h-4 w-4" /> History
        </DropdownMenuItem>
        {p.completed ? (
          <DropdownMenuItem onSelect={p.onCertificate}>
            <ShieldCheck className="h-4 w-4" /> Certificate
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={p.onHelp}>
          <CircleHelp className="h-4 w-4" /> Help
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const guideButton =
    p.mode !== "consent" && p.mode !== "ready" && p.mode !== "viewer" ? (
      <Button variant={p.mode === "start" ? "primary" : "outline"} iconEnd={<ArrowRight />} onClick={p.onGuide}>
        {guideLabel}
      </Button>
    ) : null;

  const finishButton =
    p.mode === "viewer" ? (
      <Button ref={finishRef} variant="primary" icon={<Check />} disabled={p.busy} onClick={p.onFinish}>
        Done reviewing
      </Button>
    ) : p.mode !== "consent" ? (
      <Button
        ref={finishRef}
        variant={p.mode === "ready" ? "success" : "outline"}
        icon={<Check />}
        disabled={p.busy}
        onClick={p.onFinish}
      >
        Finish
      </Button>
    ) : null;

  const saved =
    p.saveState === "saving" ? "Saving…" : p.saveState === "saved" ? "Saved" : p.saveState === "retrying" ? "Not saved — retrying" : null;

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center gap-2 px-2 sm:px-4">
        <OrgMark name={p.organizationName} logoUrl={p.logoUrl} />
        <div className="min-w-0 flex-1">
          <p className="truncate type-body font-medium text-foreground">{p.title}</p>
          {!p.compact ? (
            <p className="truncate type-secondary text-muted-foreground">
              {p.senderName} · {p.organizationName}
            </p>
          ) : null}
        </div>
        {!p.compact && status ? (
          <div className="hidden w-[min(34vw,380px)] flex-col gap-1 md:flex" aria-live="polite">
            <span
              className={cn(
                "truncate type-secondary font-medium",
                p.mode === "missed" ? "text-destructive" : p.mode === "ready" ? "text-success" : "text-foreground",
              )}
            >
              {status}
            </span>
            {p.mode !== "viewer" ? (
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Required fields done">
                <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${pct}%` }} />
              </div>
            ) : null}
          </div>
        ) : null}
        {!p.compact && saved ? <span className="hidden type-secondary text-muted-foreground lg:inline">{saved}</span> : null}
        {!p.compact && p.mode !== "consent" ? (
          <div className="hidden items-center gap-1 lg:flex">
            {p.delegationAllowed && p.mode !== "viewer" ? (
              <Button variant="quiet" icon={<UserRoundPlus />} onClick={p.onAssign}>
                Assign
              </Button>
            ) : null}
            <Button variant="quiet" icon={<XCircle />} onClick={p.onDecline}>
              Decline
            </Button>
            <Button variant="quiet" icon={<Download />} aria-label="Download" onClick={p.onDownload} />
            <Button variant="quiet" icon={<Printer />} aria-label="Print" onClick={p.onPrint} />
          </div>
        ) : null}
        {guideButton}
        {/* A phone carries one action at a time: Next until ready, then Finish (S13.2). */}
        {!p.compact || p.mode === "ready" || p.mode === "viewer" ? finishButton : null}
        {menu}
      </div>
      {status ? (
        <div className={cn("flex items-center gap-2 px-3 pb-1.5", !p.compact && "md:hidden")} aria-live="polite">
          <span
            className={cn(
              "shrink-0 type-secondary font-medium",
              p.mode === "missed" ? "text-destructive" : p.mode === "ready" ? "text-success" : "text-foreground",
            )}
          >
            {p.mode === "ready" ? "Ready to finish" : p.mode === "viewer" ? status : `${p.remaining} required left`}
          </span>
          {p.mode !== "viewer" ? (
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${pct}%` }} />
            </div>
          ) : null}
          {saved ? <span className="shrink-0 type-secondary text-muted-foreground">{saved}</span> : null}
        </div>
      ) : null}
    </header>
  );
}
