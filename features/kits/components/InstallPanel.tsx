"use client";

import { count } from "../format";

// InstallPanel — the detail page's right rail: WHERE it installs (the organization
// the person set), WHAT it will create (said before the click), the live stepper,
// and — after — the doors to what was made, or the honest failure with "Finish
// install" / "Remove what was created".

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Check,
  CircleDashed,
  ExternalLink,
  Loader2,
  PackageCheck,
  Users,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@ai-matrx/design-system";
import { OrganizationPickerPanel } from "@/features/organizations/components/OrganizationPickerPanel";
import { ErrorNotice } from "./ErrorNotice";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import { toast } from "@/lib/toast";
import { cn } from "@/utils/cn";
import { KIT_INSTALLS_TABLE, KIT_ROUTES, KIT_WORD } from "../constants";
import type { useKitInstall } from "../hooks/useKitInstall";
import type { InstallStepView, KitManifest } from "../types";

type KitInstallApi = ReturnType<typeof useKitInstall>;

function StepIcon({ state }: { state: InstallStepView["state"] }) {
  switch (state) {
    case "done":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      );
    case "running":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      );
    case "failed":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground">
          <X className="h-3 w-3" strokeWidth={3} />
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground/50">
          <CircleDashed className="h-4 w-4" />
        </span>
      );
  }
}

export function InstallStepper({ steps }: { steps: InstallStepView[] }) {
  return (
    <ol className="relative space-y-0">
      {steps.map((s, i) => (
        <li key={s.id} className="relative flex gap-2.5 pb-3 last:pb-0">
          {i < steps.length - 1 && (
            <span
              className={cn(
                "absolute left-[9.5px] top-5 h-[calc(100%-1.25rem)] w-px",
                s.state === "done" ? "bg-success/40" : "bg-border",
              )}
              aria-hidden
            />
          )}
          <StepIcon state={s.state} />
          <div className="min-w-0 flex-1 pt-px">
            <p
              className={cn(
                "text-[13px] leading-snug",
                s.state === "pending" ? "text-muted-foreground" : "text-foreground",
                s.state === "running" && "font-medium",
              )}
            >
              {s.label}
            </p>
            {s.detail && (
              <p className={cn("mt-0.5 break-words text-xs", s.state === "failed" ? "text-destructive" : "text-muted-foreground")}>
                {s.detail}
              </p>
            )}
            {s.links && s.links.length > 0 && (
              <div className="mt-0.5 flex flex-wrap gap-x-3">
                {s.links.map((l) => (
                  <Link key={l.href} href={l.href} className="inline-flex items-center gap-0.5 text-xs font-medium text-primary hover:underline">
                    {l.label}
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function consequence(manifest: KitManifest, orgName: string): string {
  const parts: string[] = [];
  const rows = manifest.tables.reduce((n, t) => n + t.records.length, 0);
  if (manifest.tables.length > 0) {
    parts.push(
      `${count(manifest.tables.length, "table")}${rows > 0 ? ` with ${count(rows, "example row")}` : ""}`,
    );
  }
  if (manifest.agents.length > 0) parts.push(manifest.agents.length === 1 ? "a copy of 1 agent" : `copies of ${manifest.agents.length} agents`);
  if (manifest.workflows.length > 0) parts.push(manifest.workflows.length === 1 ? "1 workflow" : `${manifest.workflows.length} workflows`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}` : parts[0] ?? "nothing";
  return `Creates ${list} in ${orgName}. Nothing you already have is changed.`;
}

export function InstallPanel({ manifest, api }: { manifest: KitManifest; api: KitInstallApi }) {
  const { organizations } = useUserOrganizations();
  const orgName = organizations.find((o) => o.id === api.organizationId)?.name ?? "your organization";
  const { install, phase, steps, runError, readError } = api;
  const busy = phase === "installing" || phase === "removing";
  const installed = install?.status === "installed";
  const partial = !!install && install.status !== "installed";

  const onInstall = async () => {
    const done = await api.runInstall();
    if (done) toast.success(`"${manifest.name}" is installed in ${orgName}.`);
  };

  const onRemove = async () => {
    if (!install) return;
    let facts;
    try {
      facts = await api.removalFacts();
    } catch (err) {
      toast.error(`Could not read what would be removed: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    if (!facts) return;
    const tableLines = facts.tables.map(
      (t) =>
        `the "${t.name}" table and every row in it (${t.rows === 1 ? "1 example row" : `${t.rows} example rows`} plus anything added since) — restorable from the table archive for ${
          t.retentionDays ? `${t.retentionDays} days` : "as long as the table's own retention setting allows"
        }`,
    );
    const what = [
      ...tableLines,
      facts.optionTables > 0 &&
        `${facts.optionTables === 1 ? "the choice list" : `${facts.optionTables} choice lists`} the store made for ${facts.tables.length === 1 ? "that table's" : "those tables'"} choice columns`,
      facts.agents > 0 &&
        `${facts.agents === 1 ? "the agent copy" : `${facts.agents} agent copies`} — archived, so it is restorable from the Archived view of your agents list`,
      facts.workflows > 0 &&
        `${facts.workflows === 1 ? "the workflow" : `${facts.workflows} workflows`} — archived, so restorable from the Archived view of your workflows list`,
    ].filter((x): x is string => typeof x === "string");
    const breaks = [
      facts.conversations && facts.conversations > 0
        ? `${facts.conversations} ${facts.conversations === 1 ? "conversation" : "conversations"} with the agent copy will no longer be able to continue.`
        : null,
      "Any workflow, agent or schedule you built on these tables or this agent stops working until they are restored.",
    ].filter(Boolean);
    const ok = await confirm({
      title: `Remove what "${manifest.name}" created in ${orgName}?`,
      description: `This archives exactly what this install made: ${what.join("; ")}. ${breaks.join(" ")} Nothing else you have is touched.`,
      confirmLabel: "Archive them",
      variant: "destructive",
    });
    if (!ok) return;
    if (await api.remove()) toast.success(`Removed what "${manifest.name}" created.`);
  };

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="border-b border-border p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Install</p>
        {api.organizationState === "ready" && api.organizationId ? (
          <div className="mt-1.5 flex items-center gap-1.5 text-sm text-foreground">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate font-medium">{orgName}</span>
            {!busy && (
              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className="ml-1 text-xs font-medium text-primary hover:underline">
                    change
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-0">
                  <OrganizationPickerPanel />
                </PopoverContent>
              </Popover>
            )}
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-4">
        {api.organizationState !== "ready" ? (
          <OrganizationContextNotice state={api.organizationState} what={`Installing a ${KIT_WORD.oneLower}`} compact />
        ) : api.store.state !== "on" ? (
          <UnifiedDataSwitchNotice gate={api.store} what="Data records" />
        ) : phase === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking whether this {KIT_WORD.oneLower} is already installed here…
          </div>
        ) : readError ? (
          <ErrorNotice title="We could not check whether it is installed here." error={readError} onRetry={api.retryRead} retryLabel="Check again" />
        ) : (
          <>
            {installed && !busy ? (
              <div className="flex items-start gap-2 rounded-lg bg-success/10 p-3">
                <PackageCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-foreground">Installed in {orgName}.</p>
              </div>
            ) : !install && !busy ? (
              <p className="text-sm leading-relaxed text-muted-foreground">{consequence(manifest, orgName)}</p>
            ) : null}

            {api.attached && (
              <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
                <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span>{api.attached}</span>
              </div>
            )}

            {runError && !busy && (
              <ErrorNotice title="The install stopped." error={runError}>
                Everything already created is listed below and kept. Finishing picks up where it stopped.
              </ErrorNotice>
            )}

            {(install || busy || api.attached) && <InstallStepper steps={steps} />}

            <div className="flex flex-col gap-2">
              {installed && !busy ? (
                <Button asChild className="w-full">
                  <Link href={KIT_ROUTES.installed(manifest.key)}>
                    Open your installed {KIT_WORD.oneLower}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <Button className="w-full" onClick={onInstall} disabled={busy || !!api.attached}>
                  {phase === "installing" ? (
                    <>
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                      Installing…
                    </>
                  ) : partial ? (
                    <>
                      <RotateCw className="mr-1.5 h-4 w-4" />
                      Finish install
                    </>
                  ) : (
                    <>Install in {orgName}</>
                  )}
                </Button>
              )}
              {install && !busy && !api.attached && (
                <Button variant="ghost" size="sm" className="w-full text-muted-foreground hover:text-destructive" onClick={onRemove}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  {partial ? "Remove what was created" : `Remove this ${KIT_WORD.oneLower}`}
                </Button>
              )}
              {phase === "removing" && (
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Archiving what this install created…
                </p>
              )}
            </div>
          </>
        )}
      </div>

      {install && (
        <div className="border-t border-border px-4 py-2.5">
          <Link
            href={KIT_ROUTES.table(install.ledger_table_id)}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
          >
            The install record lives in your “{KIT_INSTALLS_TABLE.name}” table
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
