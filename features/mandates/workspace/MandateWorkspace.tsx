"use client";

// features/mandates/workspace/MandateWorkspace.tsx
//
// THE mandate workspace — the ONE core component every host wraps:
//   · the dedicated route  app/(core)/mandates/[mandateKey]
//   · the admin route      app/(admin)/administration/mandates/[mandateKey]
//   · the window panel     features/window-panels/windows/mandates/MandateWindow
// Identical functionality by construction (Arman's rule 3, 2026-08-26);
// divergence only where a HOST genuinely differs — the window's multi-mandate
// scope list, and the admin shell's header offset. There is no second mandate
// detail implementation anywhere: the admin console's row click lands HERE
// (2026-08-29), it no longer opens a drawer of its own.
//
// ORDER OF IMPORTANCE (the vision, verbatim doctrine in ../FEATURE.md):
//   §1 THE TRIAD — INPUT → GOAL → OUTPUT (TriadSections.tsx). Arman: "INPUT ->
//      Charge (Goal) -> Output. The UI should show this clearly and since the
//      goal lives ONLY HERE, it needs to be easy to read and quickly edit."
//   §2 How the system meets it now — the effective Holder, its version
//      binding (latest vs pinned + DRIFT), view it / duplicate it.
//   §3 Organization context — one line, collapsed. This surface is PERSONAL;
//      org editing lives on the org route.
//   §4 Your override — the stepwise flow (OverrideFlow).
// Plus, ON THE ADMIN ROUTE ONLY (Arman, 2026-08-29 — mandate MANAGEMENT is
// admin-side; the user route is browse + their own override):
//   · goal editing and draft-input editing (§1)
//   · RUN THIS JOB — run the mandate you are looking at, agent holder or
//     workflow holder alike (also super-admin gated inside; the server
//     endpoints are `require_super_admin`, aidream 304fe1848).
//
// No prose paragraphs. Sections state facts; the data does the talking.

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Building2,
  ChevronDown,
  CircleCheck,
  Copy,
  Expand,
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
import { MandateNotesPanel } from "../components/MandateNotesPanel";
import {
  TriadFlowMark,
  TriadGoalSection,
  TriadInputSection,
  TriadOutputSection,
} from "./TriadSections";
import { useCopyMandateAgent } from "../useCopyMandateAgent";
import { splitMandateKey } from "../mandate-key";
import {
  agentHolderOfBinding,
  holderOfMandate,
  isFloatingBinding,
  isFloatingMandate,
} from "@/lib/supabase/mandateStorage";
import { OverrideFlow, type WorkspacePrincipal } from "./OverrideFlow";
import { RunThisJobSection } from "./RunThisJobSection";
import { Section } from "./Section";
import {
  useMandateWorkspaceData,
  type MandateBindingRowDb,
  type MandateWorkspaceData,
} from "./useMandateWorkspaceData";

export interface MandateWorkspaceProps {
  /** Mandate key ("podcast.multihost_script") or the row uuid — both open. */
  mandateKeyOrId: string;
  /**
   * Which shell wraps this workspace. `route` is the (core) page (its own
   * `<PageHeader>` floats, so the body owns the offset); `admin-route` is the
   * same page inside the admin shell, where content already sits below the
   * header; `window` is the draggable panel. Chrome only — every host renders
   * the identical workspace.
   */
  host: "route" | "admin-route" | "window";
  /** Whose binding §4 edits. Defaults to the personal principal. */
  principal?: WorkspacePrincipal;
}

/**
 * The layer that decides the Holder, plus the winning ref — FOR THE PRINCIPAL
 * THIS SURFACE SPEAKS FOR.
 *
 * On the personal route that is the caller: their own binding wins, then any
 * of their orgs', then the system default. On the ORG route it is the
 * organization: the admin's personal binding is not part of the answer at all,
 * and only the route's org may decide. This page used to compute the caller's
 * own resolution either way, so an org admin with a personal override saw
 * "Fulfilled by <their own agent> — yours" on a page that binds for everyone.
 */
function resolveForPrincipal(
  data: MandateWorkspaceData,
  userId: string | null,
  orgIds: ReadonlySet<string>,
  principal: WorkspacePrincipal,
) {
  const swapping = (b: MandateBindingRowDb) => {
    const holder = agentHolderOfBinding(b);
    return b.is_enabled && (holder.holderId !== null || holder.versionId !== null);
  };
  const userBinding =
    principal.kind === "org"
      ? null
      : (data.bindings.find(
          (b) =>
            b.principal_type === "user" &&
            b.subject_user_id === userId &&
            swapping(b),
        ) ?? null);
  const orgBindings = data.bindings.filter(
    (b) =>
      b.principal_type === "org" &&
      swapping(b) &&
      (principal.kind === "org"
        ? b.organization_id === principal.orgId
        : orgIds.has(b.organization_id)),
  );

  const winner = userBinding ?? orgBindings[0] ?? null;
  const layer: "user" | "org" | "system" = userBinding
    ? "user"
    : orgBindings.length > 0
      ? "org"
      : "system";

  // The WINNING layer answers alone: a binding that wins supplies its own
  // Holder and its own float/pin state, and the mandate default is consulted
  // only when no binding won at all.
  const systemHolder = holderOfMandate(data.mandate);
  const winnerHolder = winner ? agentHolderOfBinding(winner) : null;
  const versionId = winnerHolder
    ? winnerHolder.versionId
    : systemHolder.versionId;
  const agentIdRaw = winnerHolder ? winnerHolder.holderId : systemHolder.holderId;
  const useLatest = winner
    ? isFloatingBinding(winner)
    : isFloatingMandate(data.mandate);

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

export function MandateWorkspace({
  mandateKeyOrId,
  host,
  principal = { kind: "user" },
}: MandateWorkspaceProps) {
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

  const resolution = resolveForPrincipal(data, userId, orgIds, principal);
  const feature = splitMandateKey(data.mandate.mandate_key).feature;
  // WHERE, not who: a mandate's goal, its declared inputs and running it are
  // SYSTEM management, so they exist only on the admin route. The user route
  // and the window panel show the same triad, read-only, and keep the one
  // thing that is genuinely the user's: their own override.
  const authoring = host === "admin-route";

  return (
    <div
      className={cn(
        // The admin shell's page owns the scroll (the workspace shares that
        // page with the Admin controls section), so it must not open a second
        // scroll container of its own here.
        host !== "admin-route" && "h-full overflow-y-auto",
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
          <div className="flex flex-wrap items-center gap-2">
            <code className="block font-mono text-[11.5px] text-muted-foreground/80">
              {data.mandate.mandate_key}
            </code>
            {host === "window" ? (
              <Link
                href={`/mandates/${encodeURIComponent(data.mandate.mandate_key)}`}
                className="inline-flex items-center gap-1 text-[11.5px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Expand className="h-3 w-3" />
                Open full page
              </Link>
            ) : null}
          </div>
        </header>

        {/* THE TRIAD — INPUT → GOAL → OUTPUT, the mandate's own order.
            Editable on the admin route only (see `authoring`). */}
        <TriadInputSection data={data} onChanged={refresh} authoring={authoring} />
        <TriadFlowMark />
        <TriadGoalSection data={data} onChanged={refresh} authoring={authoring} />
        <TriadFlowMark />
        <TriadOutputSection data={data} />

        <FulfillmentSection data={data} resolution={resolution} onChanged={refresh} />

        {/* Run it — mandate management, so it lives where management lives:
            the admin route. Still super-admin gated inside (the server endpoint
            is require_super_admin). */}
        {authoring ? <RunThisJobSection data={data} /> : null}
        {principal.kind === "user" ? (
          <OrgOverridesDisclosure
            resolution={resolution}
            agentsById={data.agentsById}
            orgNames={organizations}
          />
        ) : null}

        {/* §4 — the stepwise override flow (choose → validate → map → settings).
            PERSONAL only — org bindings are edited on the org route. */}
        <Section
          title={
            principal.kind === "org" ? "Organization override" : "Your override"
          }
        >
          <OverrideFlow
            data={data}
            userId={userId}
            principal={principal}
            onChanged={refresh}
          />
        </Section>

        <MandateNotesPanel
          mandateId={data.mandate.id}
          mandateKey={data.mandate.mandate_key}
          surfaceName={
            host === "window"
              ? undefined
              : host === "admin-route"
                ? "matrx-admin/mandates"
                : "matrx-user/mandate-workspace"
          }
        />
      </div>
    </div>
  );
}

// ── §2 Current fulfillment ───────────────────────────────────────────────────

function FulfillmentSection({
  data,
  resolution,
  onChanged,
}: {
  data: MandateWorkspaceData;
  resolution: ReturnType<typeof resolveForPrincipal>;
  onChanged: () => void;
}) {
  const { copying, copyAndOpen } = useCopyMandateAgent();
  const { agent, agentId, layer, useLatest, pinned, drift } = resolution;
  // A mandate may exist before its intelligence does (user-created, no Holder
  // yet). That is a normal state, not a read failure — say so plainly.
  const holderless = agentId === null && holderOfMandate(data.mandate).versionId === null;

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
          ) : holderless ? (
            <span className="text-[13px] text-muted-foreground">
              No Holder bound yet — this job is waiting for its intelligence.
              Bind one below.
            </span>
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
                    defaultAgentId: holderOfMandate(data.mandate).holderId,
                    defaultAgentVersionId: holderOfMandate(data.mandate)
                      .versionId,
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
  resolution: ReturnType<typeof resolveForPrincipal>;
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
            const bindingHolder = agentHolderOfBinding(b);
            const agentId = bindingHolder.versionId
              ? null // version identity resolves via the workspace load when needed
              : bindingHolder.holderId;
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
