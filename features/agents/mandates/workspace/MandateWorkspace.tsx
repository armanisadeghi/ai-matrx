"use client";

// features/agents/mandates/workspace/MandateWorkspace.tsx
//
// THE mandate workspace — the ONE core component both hosts wrap:
//   · the dedicated route  app/(core)/agents/mandates/[mandateKey]
//   · the window panel     features/window-panels/windows/agents/MandateWindow
// Identical functionality by construction (Arman's rule 3, 2026-08-26);
// divergence only where a host genuinely differs (the window's multi-mandate
// scope list — a shell concern, not a workspace one).
//
// ORDER OF IMPORTANCE (the vision, verbatim doctrine in ../FEATURE.md):
//   §1 Understand the mandate — goal · the Provision (all offered values) ·
//      the required output kind. THE CORE.
//   §2 How the system meets it now — the effective Holder, its version
//      binding (latest vs pinned + DRIFT), view it / duplicate it.
//   §3 Organization context — one line, collapsed. This surface is PERSONAL;
//      org editing lives on the org route.
//   §4 Your override — the stepwise flow (OverrideFlow).
//
// No prose paragraphs. Sections state facts; the data does the talking.

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  ChevronDown,
  CircleCheck,
  Copy,
  Lock,
  MessageSquareText,
  Package,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { cn } from "@/lib/utils";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { MandateResolutionRibbon } from "../components/MandateResolutionRibbon";
import { MandateOverridePanel } from "../components/MandateOverridePanel";
import { MandateNotesPanel } from "../components/MandateNotesPanel";
import { useCopyMandateAgent } from "../useCopyMandateAgent";
import { splitMandateKey } from "../mandate-key";
import type { OfferedValue } from "../provision-shapes";
import {
  useMandateWorkspaceData,
  type MandateBindingRowDb,
  type MandateWorkspaceData,
} from "./useMandateWorkspaceData";

export interface MandateWorkspaceProps {
  /** Mandate key ("podcast.multihost_script") or the row uuid — both open. */
  mandateKeyOrId: string;
  host: "route" | "window";
}

/** The layer that decides the Holder for this caller, plus the winning ref. */
function resolveForCaller(
  data: MandateWorkspaceData,
  userId: string | null,
  orgIds: ReadonlySet<string>,
) {
  const swapping = (b: MandateBindingRowDb) =>
    b.is_enabled && (b.agent_id !== null || b.agent_version_id !== null);
  const userBinding =
    data.bindings.find(
      (b) =>
        b.principal_type === "user" && b.subject_user_id === userId && swapping(b),
    ) ?? null;
  const orgBindings = data.bindings.filter(
    (b) => b.principal_type === "org" && orgIds.has(b.organization_id) && swapping(b),
  );

  const winner = userBinding ?? orgBindings[0] ?? null;
  const layer: "user" | "org" | "system" = userBinding
    ? "user"
    : orgBindings.length > 0
      ? "org"
      : "system";

  const versionId = winner?.agent_version_id ?? (winner ? null : data.mandate.default_agent_version_id);
  const agentIdRaw = winner?.agent_id ?? (winner ? null : data.mandate.default_agent_id);
  const useLatest = winner ? winner.use_latest === true : data.mandate.use_latest === true;

  const version = versionId ? (data.versionsById[versionId] ?? null) : null;
  const agentId = version?.agentId ?? agentIdRaw;
  const agent = agentId ? (data.agentsById[agentId] ?? null) : null;

  const pinned = version?.versionNumber ?? null;
  const latest = agent?.latestVersion ?? null;
  const drift =
    pinned !== null && latest !== null && latest > pinned
      ? `v${pinned} → v${latest}`
      : null;

  return { layer, agent, agentId, useLatest, pinned, latest, drift, orgBindings, userBinding };
}

export function MandateWorkspace({ mandateKeyOrId, host }: MandateWorkspaceProps) {
  const { data, loading, error, refresh } = useMandateWorkspaceData(mandateKeyOrId);
  const userId = useAppSelector(selectUserId);
  const { organizations } = useUserOrganizations();
  const orgIds = useMemo(
    () => new Set(organizations.map((o) => o.id)),
    [organizations],
  );

  if (loading && !data) {
    return (
      <div className="flex h-full items-center justify-center py-24">
        <SuspenseLoader />
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <p className="text-sm text-destructive">{error ?? "Unknown error."}</p>
        <Button variant="outline" size="sm" onClick={refresh}>
          Retry
        </Button>
      </div>
    );
  }

  const resolution = resolveForCaller(data, userId, orgIds);
  const feature = splitMandateKey(data.mandate.mandate_key).feature;

  return (
    <div
      className={cn(
        "h-full overflow-y-auto",
        host === "route" && "pt-[calc(var(--shell-header-h)+0.5rem)]",
      )}
    >
      <div className="mx-auto w-full max-w-3xl space-y-6 px-4 pb-16 pt-2 sm:px-6">
        {/* Header — identity only. */}
        <header className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {data.mandate.label}
            </h2>
            <Badge variant="outline" className="py-0 text-[10.5px]">
              {feature.replace(/_/g, " ")}
            </Badge>
            {!data.mandate.is_enabled ? (
              <Badge variant="outline" className="py-0 text-[10.5px] text-muted-foreground">
                Disabled
              </Badge>
            ) : null}
          </div>
          <code className="block font-mono text-[11.5px] text-muted-foreground/80">
            {data.mandate.mandate_key}
          </code>
        </header>

        <JobSection data={data} />
        <FulfillmentSection data={data} resolution={resolution} onChanged={refresh} />
        <OrgOverridesDisclosure
          resolution={resolution}
          agentsById={data.agentsById}
          orgNames={organizations}
        />

        {/* §4 — the override flow. TRANSITIONAL: the proven MandateOverridePanel
            runs here until the stepwise OverrideFlow replaces it (same build).
            It gets deleted at cutover, never kept as a twin. */}
        <Section title="Your override">
          <MandateOverridePanel
            mandate={data.mandate}
            bindings={data.bindings}
            agentsById={data.agentsById}
            onChanged={refresh}
          />
        </Section>

        <MandateNotesPanel
          mandateId={data.mandate.id}
          mandateKey={data.mandate.mandate_key}
          surfaceName={host === "window" ? undefined : "matrx-user/mandate-workspace"}
        />
      </div>
    </div>
  );
}

// ── Section chrome (ShortcutEditorNext anatomy — eyebrow title, calm body) ──

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {title}
        </h3>
        {hint ? (
          <span className="text-[11px] text-muted-foreground/70">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

// ── §1 The Job ───────────────────────────────────────────────────────────────

function JobSection({ data }: { data: MandateWorkspaceData }) {
  return (
    <Section title="The job">
      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
        {data.mandate.description ? (
          <p className="text-[13.5px] leading-relaxed text-foreground">
            {data.mandate.description}
          </p>
        ) : (
          <p className="text-[13px] italic text-muted-foreground">
            No written goal — a registry gap worth fixing.
          </p>
        )}

        {/* Inputs — the Provision IS the input declaration. */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <Package className="h-3 w-3" />
            {data.offer
              ? `Inputs — ${data.offer.values.length} values offered`
              : "Inputs"}
          </div>
          {data.offer ? (
            <ul className="divide-y divide-border/40 rounded-lg border border-border/50">
              {data.offer.values.map((value) => (
                <OfferedValueRow
                  key={value.name}
                  value={value}
                  pinned={data.pinnedContext.includes(value.name)}
                />
              ))}
            </ul>
          ) : data.contract.requiredVariables.length > 0 ? (
            <div className="rounded-lg border border-border/50 px-3 py-2">
              <p className="text-[11px] text-muted-foreground">
                Legacy contract — required variables (no Provision yet):
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {data.contract.requiredVariables.map((name) => (
                  <code key={name} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {name}
                  </code>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground">
              No declared inputs — this job runs on user text alone.
            </p>
          )}
          {/* The user-text channel is platform-default-accepted; no mandate
              forbids it today. Stated, not implied. */}
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/80">
            <MessageSquareText className="h-3 w-3" />
            Free text from the caller is accepted (platform default).
          </p>
          {Object.keys(data.pins).length > 0 ? (
            <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground/80">
              <Lock className="h-3 w-3" />
              Pinned behaviors:{" "}
              {Object.entries(data.pins)
                .map(([k, v]) => `${k}=${String(v)}`)
                .join(" · ")}{" "}
              (platform-locked)
            </p>
          ) : null}
        </div>

        {/* Output — the exact acceptable shape. */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <ArrowRight className="h-3 w-3" />
            Output
          </div>
          {data.mandate.output_kind ? (
            <EntityRef
              token="shape"
              id={data.mandate.output_kind}
              name={data.mandate.output_kind}
              href={`/shapes/${encodeURIComponent(data.mandate.output_kind)}`}
              showIcon={false}
              className="font-mono text-[12px]"
            />
          ) : (
            <p className="text-[12px] text-amber-700 dark:text-amber-400">
              No output kind declared
              {data.contract.requiredOutputKeys.length > 0
                ? " — consumers require these keys:"
                : " — unspecified."}
            </p>
          )}
          {data.contract.requiredOutputKeys.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.contract.requiredOutputKeys.map((key) => (
                <code key={key} className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                  {key}
                </code>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}

function OfferedValueRow({
  value,
  pinned,
}: {
  value: OfferedValue;
  pinned: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40"
      >
        <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
          {value.name}
        </span>
        <code className="shrink-0 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
          {value.kind}
        </code>
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 py-0 text-[9.5px]",
            value.guaranteed
              ? "border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
              : "border-border/70 text-muted-foreground",
          )}
        >
          {value.guaranteed ? "Guaranteed" : "Optional"}
        </Badge>
        {value.lazy ? (
          <Badge variant="outline" className="shrink-0 py-0 text-[9.5px] text-muted-foreground">
            Lazy
          </Badge>
        ) : null}
        {pinned ? <Lock className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground/60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="px-3 pb-2 text-[11.5px] leading-relaxed text-muted-foreground">
          {value.description || "No description."}
          {pinned
            ? " — delivered automatically as locked context; never mapped by hand."
            : null}
        </div>
      ) : null}
    </li>
  );
}

// ── §2 Current fulfillment ───────────────────────────────────────────────────

function FulfillmentSection({
  data,
  resolution,
  onChanged,
}: {
  data: MandateWorkspaceData;
  resolution: ReturnType<typeof resolveForCaller>;
  onChanged: () => void;
}) {
  const { copying, copyAndOpen } = useCopyMandateAgent();
  const { agent, layer, useLatest, pinned, drift } = resolution;

  return (
    <Section title="Fulfilled by">
      <div className="space-y-3 rounded-xl border border-border/60 bg-card p-4">
        <MandateResolutionRibbon provenance={layer} />
        <div className="flex flex-wrap items-center gap-2">
          {agent ? (
            <EntityRef
              token="agent"
              id={agent.id}
              name={agent.name}
              className="text-[13.5px] font-medium"
            />
          ) : (
            <span className="text-[13px] text-destructive">
              The effective agent could not be read — it may be deleted or not
              shared with you.
            </span>
          )}
          {agent?.agentType === "builtin" ? (
            <Badge variant="outline" className="gap-1 py-0 text-[10px] text-muted-foreground">
              <ShieldCheck className="h-2.5 w-2.5" />
              System agent
            </Badge>
          ) : null}
          {agent?.isArchived ? (
            <Badge variant="outline" className="py-0 text-[10px] text-rose-600 dark:text-rose-400">
              Archived
            </Badge>
          ) : null}
          <Badge variant="outline" className="py-0 font-mono text-[10px]">
            {useLatest ? "latest" : pinned !== null ? `v${pinned}` : "pinned"}
          </Badge>
          {drift ? (
            <Badge
              variant="outline"
              className="border-amber-500/40 bg-amber-500/10 py-0 font-mono text-[10px] text-amber-700 dark:text-amber-400"
            >
              {drift}
            </Badge>
          ) : null}
        </div>
        {drift ? (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            This job runs the pinned version; the agent has moved on. Updating
            the pin is {layer === "system" ? "an admin decision" : "yours"} —
            nothing changes until it is made deliberately.
          </p>
        ) : null}
        {agent ? (
          <div>
            <Button
              variant="outline"
              size="sm"
              disabled={copying}
              className="gap-1.5"
              onClick={() => {
                void copyAndOpen(
                  {
                    defaultAgentId: data.mandate.default_agent_id,
                    defaultAgentVersionId: data.mandate.default_agent_version_id,
                  },
                  { connect: () => onChanged() },
                );
              }}
            >
              <Copy className="h-3.5 w-3.5" />
              {copying ? "Duplicating…" : "Duplicate & customize"}
            </Button>
            <p className="mt-1.5 text-[11.5px] text-muted-foreground/80">
              Copies the running agent into your own editable version and opens
              the builder — modify it, then swap it in below.
            </p>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

// ── §3 Organization context — one line, collapsed ────────────────────────────

function OrgOverridesDisclosure({
  resolution,
  agentsById,
  orgNames,
}: {
  resolution: ReturnType<typeof resolveForCaller>;
  agentsById: MandateWorkspaceData["agentsById"];
  orgNames: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const { orgBindings, userBinding } = resolution;

  if (orgBindings.length === 0) {
    return (
      <p className="flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        No organization overrides.
      </p>
    );
  }

  const nameOf = (id: string) => orgNames.find((o) => o.id === id)?.name ?? "Organization";

  return (
    <div className="rounded-lg border border-border/50 bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="flex-1 text-[12.5px] text-foreground">
          {orgBindings.length === 1
            ? `${nameOf(orgBindings[0].organization_id)} overrides this job`
            : `${orgBindings.length} of your organizations override this job`}
        </span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border/40 px-3 py-2.5">
          {orgBindings.map((b) => {
            const agentId = b.agent_version_id
              ? null // version identity resolves via the workspace load when needed
              : b.agent_id;
            const agent = agentId ? agentsById[agentId] : null;
            return (
              <div key={b.id} className="flex flex-wrap items-center gap-2 text-[12px]">
                <EntityRef
                  token="organization"
                  id={b.organization_id}
                  name={nameOf(b.organization_id)}
                  showIcon={false}
                  className="font-medium"
                />
                <span className="text-muted-foreground">runs</span>
                {agent ? (
                  <EntityRef token="agent" id={agent.id} name={agent.name} showIcon={false} />
                ) : (
                  <span className="text-muted-foreground">a pinned version</span>
                )}
              </div>
            );
          })}
          <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted-foreground/80">
            <CircleCheck className="mt-0.5 h-3 w-3 shrink-0" />
            {userBinding
              ? "Your personal override wins over these for everything you run."
              : "What applies to you: the first matching organization above — unless you set a personal override below, which then wins everywhere you run."}
          </p>
        </div>
      ) : null}
    </div>
  );
}
