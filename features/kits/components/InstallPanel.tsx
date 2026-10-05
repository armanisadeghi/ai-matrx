"use client";

import { count } from "@/features/templates/format";

// InstallPanel — the detail page's right rail: WHERE it installs (the organization
// the person set), WHAT it will create (said before the click), the live stepper,
// and — after — the doors to what was made, or the honest failure with "Finish
// install" / "Remove what was created".

import Link from "next/link";
import { useState } from "react";
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
import { OrganizationPickerPopover } from "@/features/organizations/components/OrganizationPickerPopover";
import { ErrorNotice } from "./ErrorNotice";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { useUserOrganizations } from "@/features/organizations/hooks";
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
        <span className="flex h-5 w-5 items-center justify-center text-muted-foreground">
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
                "text-foreground",
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

/** What an install adds, as one short line: "1 table (7 rows), 1 agent copy, 1 workflow". */
function consequence(manifest: KitManifest): string {
  const rows = manifest.tables.reduce((n, t) => n + t.records.length, 0);
  const parts = [
    manifest.tables.length > 0 && `${count(manifest.tables.length, "table")}${rows > 0 ? ` (${count(rows, "row")})` : ""}`,
    manifest.agents.length > 0 && count(manifest.agents.length, "agent copy", "agent copies"),
    manifest.workflows.length > 0 && count(manifest.workflows.length, "workflow"),
  ].filter((x): x is string => typeof x === "string");
  return `Adds ${parts.join(", ")}`;
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

  // Reading what a removal would archive takes a few reads; until the dialog opens the
  // button shows it is working and refuses a second press — a second press used to
  // queue a second dialog that reopened after the first removal finished.
  const [checkingRemoval, setCheckingRemoval] = useState(false);
  const onRemove = async () => {
    if (!install || checkingRemoval) return;
    setCheckingRemoval(true);
    let facts;
    try {
      facts = await api.removalFacts();
    } catch (err) {
      toast.error("Could not check what would be removed", { description: err instanceof Error ? err.message : String(err) });
      return;
    } finally {
      setCheckingRemoval(false);
    }
    if (!facts) return;
    // ≤ 140 chars, two sentences: what is archived, then what stops and for how long.
    // (Agents and workflows fall to the platform floor — never purged; tables keep their
    // own retention_days.)
    const rows = facts.tables.reduce((n, t) => n + t.rows, 0);
    const days = facts.tables.map((t) => t.retentionDays).find((d): d is number => typeof d === "number");
    const what = [
      facts.tables.length > 0 && `${count(facts.tables.length, "table")} (${count(rows, "row")})`,
      facts.optionTables > 0 && count(facts.optionTables, "choice list"),
      facts.agents > 0 && count(facts.agents, "agent copy", "agent copies"),
      facts.workflows > 0 && count(facts.workflows, "workflow"),
    ].filter((x): x is string => typeof x === "string");
    const stops =
      facts.conversations && facts.conversations > 0
        ? `${count(facts.conversations, "conversation")} and anything built on them pause`
        : "Anything built on them pauses";
    const ok = await confirm({
      title: `Remove what "${manifest.name}" created in ${orgName}?`,
      description: `Archives ${what.join(", ")}. ${stops} until restored${days ? ` (within ${days} days)` : ""}.`,
      confirmLabel: "Archive them",
      variant: "destructive",
    });
    if (!ok) return;
    if (await api.remove()) toast.success(`Removed what "${manifest.name}" created.`);
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <p className="text-sm font-semibold text-foreground">Install</p>
        {api.organizationState === "ready" && api.organizationId ? (
          <div className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="truncate font-medium">{orgName}</span>
            {!busy && !api.organizationPinned && (
              <OrganizationPickerPopover
                trigger={
                  <button type="button" className="ml-1 text-xs font-medium text-primary hover:underline">
                    change
                  </button>
                }
              />
            )}
          </div>
        ) : null}
      </div>

      {/* The compact notice brings its own padding; the body adds only the difference. */}
      <div className={cn("space-y-4", api.organizationState !== "ready" ? "p-1" : "p-4")}>
        {api.organizationState !== "ready" ? (
          <OrganizationContextNotice
            state={api.organizationState}
            what={`Installing a ${KIT_WORD.oneLower}`}
            title="Choose where to install"
            description=""
            compact
          />
        ) : phase === "loading" ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" aria-busy="true">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking installs…
          </div>
        ) : readError ? (
          <ErrorNotice title="We could not check whether it is installed here." error={readError} onRetry={api.retryRead} retryLabel="Check again" />
        ) : (
          <>
            {installed && !busy ? (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <PackageCheck className="h-4 w-4 shrink-0" />
                Installed
              </p>
            ) : !install && !busy ? (
              <p className="text-sm text-foreground">{consequence(manifest)}</p>
            ) : null}

            {api.attached && (
              <p className="flex items-start gap-2 text-sm text-foreground">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{api.attached}</span>
              </p>
            )}

            {runError && !busy && (
              <ErrorNotice title="The install stopped." error={runError}>
                What was created is kept; Finish install resumes.
              </ErrorNotice>
            )}

            {/* The step log is for work in flight or unfinished; a finished install shows only its doors. */}
            {(busy || partial || api.attached) && <InstallStepper steps={steps} />}
            {installed && !busy && (
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {steps.flatMap((s) => s.links ?? []).map((l) => (
                  <Link key={l.href} href={l.href} className="inline-flex items-center gap-0.5 text-sm font-medium text-primary hover:underline">
                    {l.label}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ))}
              </div>
            )}

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
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-foreground hover:text-destructive"
                  onClick={onRemove}
                  disabled={checkingRemoval}
                  aria-busy={checkingRemoval}
                >
                  {checkingRemoval ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
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
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            target="_blank"
            rel="noopener noreferrer"
          >
            {KIT_INSTALLS_TABLE.name}
            <ExternalLink className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
