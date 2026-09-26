"use client";

// features/mandates/peek/MandatePeek.tsx
//
// THE MANDATE PEEK — the quick look for any mandate, anywhere one is named
// (Arman, 2026-09-26: "as clean and beautiful as the agents peek"). Registered
// as peek kind `mandate` (features/organizations/peek), so every
// `EntityRef token="mandate"` and every `MandatePeekButton` opens this.
//
// It shows exactly: name + description, the inputs in plain words, the output
// shape, who fills it at each level (system → organization → you), the
// status, and the open-in-new-tab door. Nothing else.
//
// Addressed by the definition id OR the mandate key — a caller holding either
// gets the same peek.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Braces, Lightbulb, Workflow } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { createClient } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { AGENT_ICON, INTELLIGENCE_ICON } from "@/components/icons/domain-icons";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { NewTabLink } from "@/components/official/entity-ref/NewTabLink";
import { usePeekHrefOverride } from "@/features/organizations/peek/peekHrefOverride";
import { useAgentNames } from "@/features/surfaces/hooks/useAgentNames";
import {
  MANDATE_HOLDER_COLUMNS,
  holderOfMandate,
  mandateDefinitions,
} from "@/lib/supabase/mandateStorage";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useMandateInputSurface } from "../input-surface";
import { kindPhrase } from "../provision-shapes";
import { personMandateRecordHref } from "../member-list/routes";
import { MandateStatusBadge } from "../status/MandateStatusBadge";
import { mandateStatusOf } from "../status/mandate-status";
import { agentHref } from "../admin/mandate-health";
import {
  useMandateLadder,
  type MandateLadderRow,
  type MandateRung,
} from "../workspace/useMandateLadder";
import { inputDisplayLabel } from "./input-label";
import {
  PEEK_CONTENT_PROPS,
  useTransientPeek,
} from "@/features/organizations/peek/useTransientPeek";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface MandateFacts {
  id: string;
  mandateKey: string;
  label: string;
  description: string | null;
  outputKind: string | null;
  isEnabled: boolean;
  deletedAt: string | null;
  hasOwnHolder: boolean;
}

type FactsState =
  | { status: "loading" }
  | { status: "ready"; facts: MandateFacts }
  | { status: "missing" }
  | { status: "error"; message: string };

function useMandateFacts(idOrKey: string, active: boolean): FactsState {
  const [state, setState] = useState<FactsState>({ status: "loading" });
  useEffect(() => {
    if (!active || !idOrKey) return;
    let live = true;
    setState({ status: "loading" });
    void (async () => {
      const { data, error } = await mandateDefinitions(createClient())
        .select(
          `id, mandate_key, label, description, output_kind, is_enabled, deleted_at, ${MANDATE_HOLDER_COLUMNS}` as const,
        )
        .eq(UUID.test(idOrKey) ? "id" : "mandate_key", idOrKey)
        .maybeSingle();
      if (!live) return;
      if (error) {
        setState({ status: "error", message: error.message });
        return;
      }
      if (!data) {
        setState({ status: "missing" });
        return;
      }
      setState({
        status: "ready",
        facts: {
          id: data.id,
          mandateKey: data.mandate_key,
          label: data.label,
          description: data.description,
          outputKind: data.output_kind ?? null,
          isEnabled: data.is_enabled ?? true,
          deletedAt: data.deleted_at ?? null,
          hasOwnHolder: Boolean(holderOfMandate(data).holderId),
        },
      });
    })();
    return () => {
      live = false;
    };
  }, [idOrKey, active]);
  return state;
}

/** Workflow names for the ladder's workflow holders (agents use useAgentNames). */
function useWorkflowNames(ids: readonly string[]): Record<string, string> {
  const key = [...new Set(ids)].sort().join(",");
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    void createClient()
      .schema("workflow")
      .from("definition")
      .select("id, name")
      .in("id", key.split(","))
      .then(({ data }) => {
        if (!live) return;
        const next: Record<string, string> = {};
        for (const row of data ?? []) next[row.id] = row.name ?? "Unnamed workflow";
        setNames(next);
      });
    return () => {
      live = false;
    };
  }, [key]);
  return names;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h4 className="text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h4>
      {children}
    </section>
  );
}

function Inputs({ mandateKey }: { mandateKey: string }) {
  const state = useMandateInputSurface(mandateKey);
  if (state.status === "loading") {
    return <div className="h-6 w-48 animate-pulse rounded bg-muted" aria-label="Reading inputs" />;
  }
  if (state.status === "error") {
    return (
      <p className="text-xs text-muted-foreground">
        {state.message} <ErrorAlchemyMenu error={state.message} />
      </p>
    );
  }
  const { inputs, acceptsUserInput } = state.surface;
  if (inputs.length === 0 && !acceptsUserInput) {
    return <p className="text-sm text-muted-foreground">None</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {inputs.map((input) => (
        <span
          key={input.name}
          title={input.help || undefined}
          className={cn(
            "inline-flex items-center rounded-md border px-2 py-0.5 text-xs",
            input.sourcing === "require"
              ? "border-primary/30 bg-primary/5 text-foreground"
              : "border-border bg-muted/40 text-muted-foreground",
          )}
        >
          {inputDisplayLabel(input)}
        </span>
      ))}
      {acceptsUserInput ? (
        <span className="inline-flex items-center rounded-md border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground">
          Your text
        </span>
      ) : null}
    </div>
  );
}

const RUNG_LABEL: Record<MandateRung, string> = {
  system: "System",
  org: "Organization",
  user: "You",
};

function Ladder({ rows, loading, error }: { rows: MandateLadderRow[]; loading: boolean; error: string | null }) {
  const agentIds = rows.filter((r) => r.chose_holder && r.holder_type !== "workflow" && r.holder_id).map((r) => r.holder_id as string);
  const workflowIds = rows.filter((r) => r.chose_holder && r.holder_type === "workflow" && r.holder_id).map((r) => r.holder_id as string);
  const agentNames = useAgentNames(agentIds);
  const workflowNames = useWorkflowNames(workflowIds);

  if (loading) {
    return <div className="h-20 animate-pulse rounded-md bg-muted" aria-label="Reading who fills it" />;
  }
  if (error) {
    return (
      <p className="text-xs text-destructive">
        {error} <ErrorAlchemyMenu error={error} />
      </p>
    );
  }
  return (
    <div className="divide-y divide-border/60 rounded-md border border-border bg-muted/20">
      {(["system", "org", "user"] as const).map((rung) => {
        const row = rows.find((entry) => entry.rung === rung);
        const isWorkflow = row?.holder_type === "workflow";
        const Icon = isWorkflow ? Workflow : AGENT_ICON;
        const holderId = row?.chose_holder ? row.holder_id : null;
        return (
          <div key={rung} className="flex min-w-0 items-center gap-3 px-2.5 py-1.5 text-sm">
            <span className="w-24 shrink-0 text-xs text-muted-foreground">{RUNG_LABEL[rung]}</span>
            {holderId ? (
              <span className="flex min-w-0 items-center gap-1.5">
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                {isWorkflow ? (
                  <EntityRef token="workflow" id={holderId} name={workflowNames[holderId]} showIcon={false} alwaysShowActions />
                ) : (
                  <EntityRef token="agent" id={holderId} name={agentNames[holderId]} href={agentHref(holderId, null)} showIcon={false} alwaysShowActions />
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">No choice</span>
            )}
            {row?.dropped_reason ? (
              <span className="ml-auto shrink-0 text-xs text-destructive" title={row.dropped_reason}>
                Needs attention
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export interface MandatePeekModalProps {
  /** The mandate's definition id or its key. */
  mandate: string;
  isOpen: boolean;
  onClose: () => void;
  /** The page to open (seat-aware). Defaults to the person's record page. */
  href?: string | null;
}

export function MandatePeekModal({ mandate, isOpen, onClose, href }: MandatePeekModalProps) {
  const facts = useMandateFacts(mandate, isOpen);
  useTransientPeek(isOpen, onClose);
  const override = usePeekHrefOverride();
  const organizationId = useAppSelector(selectOrganizationId);
  const ready = facts.status === "ready" ? facts.facts : null;
  const ladder = useMandateLadder(ready?.mandateKey ?? "", organizationId);

  const pageHref =
    href !== undefined
      ? href
      : override !== undefined
        ? override
        : ready
          ? personMandateRecordHref(ready.mandateKey)
          : null;

  const status = useMemo(() => {
    if (!ready) return null;
    const anyLive = ladder.rows.some((row) => row.chose_holder && !row.dropped_reason);
    return mandateStatusOf({
      deletedAt: ready.deletedAt,
      isEnabled: ready.isEnabled,
      hasHolder: ready.hasOwnHolder || anyLive,
    });
  }, [ready, ladder.rows]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        {...PEEK_CONTENT_PROPS}
        className="max-w-xl gap-3 border border-border bg-card p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-w-0 items-center gap-2 pr-8">
          <INTELLIGENCE_ICON className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <DialogTitle className="min-w-0 truncate text-base font-semibold text-foreground">
            {ready?.label ?? "Mandate"}
          </DialogTitle>
          {ready ? <NewTabLink href={pageHref} label={ready.label} /> : null}
          {status ? <MandateStatusBadge status={status} size="md" className="ml-auto" /> : null}
        </div>

        <div className="-mr-2 max-h-[65dvh] space-y-4 overflow-y-auto pr-2">
          {facts.status === "loading" ? (
            <div className="space-y-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : facts.status === "error" ? (
            <p className="text-sm text-destructive">
              {facts.message} <ErrorAlchemyMenu error={facts.message} />
            </p>
          ) : facts.status === "missing" ? (
            <p className="text-sm text-muted-foreground">This mandate does not exist or is not shared with you.</p>
          ) : ready ? (
            <>
              {ready.description ? (
                <p className="whitespace-pre-wrap break-words text-sm text-foreground">{ready.description}</p>
              ) : null}
              <Section label="Inputs">
                <Inputs mandateKey={ready.mandateKey} />
              </Section>
              <Section label="Output">
                <p className="flex items-center gap-1.5 text-sm text-foreground">
                  <Braces className="h-3.5 w-3.5 text-primary" aria-hidden />
                  {ready.outputKind
                    ? kindPhrase(ready.outputKind).replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase())
                    : "Text"}
                </p>
              </Section>
              <Section label="Who fills it">
                <Ladder rows={ladder.rows} loading={ladder.loading} error={ladder.error} />
              </Section>
            </>
          ) : null}
        </div>

        {pageHref ? (
          <div className="flex items-center gap-2 border-t border-border pt-3">
            <Button variant="ghost" size="sm" onClick={onClose} className="ml-auto">
              Close
            </Button>
            <Button asChild size="sm">
              <Link href={pageHref} onClick={onClose}>
                Open
                <ArrowRight />
              </Link>
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The Lightbulb that opens a mandate's peek — for any surface that names a
 * mandate without an `EntityRef` (a card title, a header).
 */
export function MandatePeekButton({
  mandate,
  name,
  href,
  className,
}: {
  mandate: string;
  name: string;
  href?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        title={`Quick look at ${name}`}
        aria-label={`Quick look at ${name}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        className={cn(
          "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          className,
        )}
      >
        <Lightbulb className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <MandatePeekModal mandate={mandate} isOpen onClose={() => setOpen(false)} href={href} />
      ) : null}
    </>
  );
}
