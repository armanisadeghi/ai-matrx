"use client";

// features/make/gallery/TemplateGallery.tsx — LANE MAKE-HOME (v6 Unified Data System), wave 4.
//
// THE ONE TEMPLATE GALLERY on /make, serving lane 8 (TEMPLATES). Champions: Notion's template
// gallery and Airtable Universe — filter by industry, job and feature; every card says what it
// installs; preview before install; one-click install with live progress.
//
// ONE SOURCE (G3): every card is read through the catalogue door `custom.templates` (card fields
// only; `installed_in` marks what the active organization already has). Install, remove and
// restore go through the family's budgeted doors with `runTemplateDoor` from
// `@ai-matrx/records/templates` — each call does what fits its budget and the progress ticks per
// call from the install's own `made` list.
//
// WHY THE STORE LINES ARE IN THIS ONE FILE: `pnpm check:campaign-entry-points` makes each file that
// imports `@ai-matrx/records*` a registered runtime entry that reads the store switch. This file is
// that one entry ("make-template-gallery"). No store switch is asked — the store is never off.
//
// ORGANIZATIONS (access ladder): the catalogue read is not filtered by the active organization
// (platform cards are everyone's). The active organization only names where an install lands and
// whose saved templates fill "Your organization's" row. With none chosen, Install asks for one and
// then proceeds — it never picks a default.
//
// "SAVE MY SETUP AS A TEMPLATE" IS NOT DRAWN: the family has no door that turns an organization's
// tables into a template spec (template_declare takes a finished spec + plan). Absent beats dead;
// the missing door goes to the chair (store doors are the chair's).

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, CircleDashed, ExternalLink, Loader2 } from "lucide-react";
import { supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, type TemplateDoorAnswer } from "@ai-matrx/records/templates";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { templateAgentArchiver, templateAgentCopier, templateWorkflowCreator } from "@/features/templates/agentCopyHost";
import { addInstalledAgent, agentsLeftBy, hostStepsPending, type Claim } from "./installAgent";
import { InstalledTemplate, type TemplateTryIt } from "@/features/templates/components/InstalledTemplate";
import { templateKnob } from "@/features/templates/knobs";
import { setWorkflowFlag } from "@/features/workflow-runtime/browse/service";
import { selectActiveOrganizationName } from "@/features/scopes/redux/selectors/active-context";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

import { SAVED_WHERE_CHOSEN, SavesTo } from "../MakeMount";
import { TemplateCardGrid, TemplateSummary } from "./TemplateCards";
import {
  GALLERY_PAGE,
  facetValues,
  galleryFilter,
  hrefForMade,
  openableMade,
  orgRowCards,
  orgRowFilter,
  platformCards,
  type GalleryAnswer,
  type GalleryCard,
  type GalleryFilters,
  type MadeObject,
  wordFor,
} from "./catalogue";

/** The preview page's address for one card. */
export const templatePreviewHref = (id: string) => `/make/templates/${id}`;

// ─────────────────────────────────────────────────────────────────────────────
// The catalogue door.
// ─────────────────────────────────────────────────────────────────────────────

type Read<T> = { phase: "reading" } | { phase: "failed"; why: string } | { phase: "read"; data: T };

/** Every card the filter matches: the door pages at 200, so a long catalogue is read to its end. */
async function readCatalogue(filter: Record<string, unknown>): Promise<{ total: number; cards: GalleryCard[] }> {
  const source = supabaseDataSource(createClient());
  const cards: GalleryCard[] = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await source.rpc("templates", { p_filter: { ...filter, offset } }, { schema: "custom" });
    if (error) throw new Error(error.message);
    const answer = data as unknown as GalleryAnswer;
    total = answer.total;
    cards.push(...answer.cards);
    offset += GALLERY_PAGE;
    if (answer.cards.length < GALLERY_PAGE || offset >= total) break;
  }
  return { total, cards };
}

function useCatalogue(key: string | null, filter: Record<string, unknown>): Read<{ total: number; cards: GalleryCard[] }> & { reload: () => void } {
  const [read, setRead] = useState<Read<{ total: number; cards: GalleryCard[] }>>({ phase: "reading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    setRead({ phase: "reading" });
    readCatalogue(filter)
      .then((data) => alive && setRead({ phase: "read", data }))
      .catch((err: unknown) => alive && setRead({ phase: "failed", why: err instanceof Error ? err.message : String(err) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names everything `filter` holds
  }, [key, attempt]);
  return { ...read, reload: () => setAttempt((n) => n + 1) };
}

// ─────────────────────────────────────────────────────────────────────────────
// The /make section: filters, the catalogue's cards, and "Your organization's".
// ─────────────────────────────────────────────────────────────────────────────

export function TemplateGallerySection() {
  // org-filter: write-target the active organization is where an install lands and whose saved templates fill its own row; the catalogue itself is read unfiltered
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const [filters, setFilters] = useState<GalleryFilters>({});
  // Facets come from the whole catalogue, so a filter never offers a value that returns nothing.
  const all = useCatalogue("all", galleryFilter({}));
  const filterKey = JSON.stringify({ ...filters, organizationId });
  const shown = useCatalogue(filterKey, galleryFilter(filters, { scope: "platform", installedIn: organizationId }));
  const facets = all.phase === "read" ? platformCards(all.data.cards) : [];

  return (
    <section className="flex flex-col gap-3" aria-labelledby="make-templates" data-make-gallery="">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="make-templates" className="text-sm font-medium text-muted-foreground">
          Start from a template
          {all.phase === "read" ? <span className="ml-1.5 tabular-nums" data-make-gallery-total={platformCards(all.data.cards).length}>({platformCards(all.data.cards).length})</span> : null}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Facet label="Industry" value={filters.industry ?? null} options={facetValues(facets, "industry")} wordKey="industry" onChange={(v) => setFilters((f) => ({ ...f, industry: v }))} />
          <Facet label="Job" value={filters.job ?? null} options={facetValues(facets, "job")} wordKey="job" onChange={(v) => setFilters((f) => ({ ...f, job: v }))} />
          <Facet label="Feature" value={filters.teaches ?? null} options={facetValues(facets, "teaches")} wordKey="teaches" onChange={(v) => setFilters((f) => ({ ...f, teaches: v }))} />
        </div>
      </div>

      {organizationId ? <OrganizationRow organizationId={organizationId} /> : null}

      {shown.phase === "reading" ? (
        <Skeleton className="h-28 w-full" />
      ) : shown.phase === "failed" ? (
        <Failed why={shown.why} retry={shown.reload} />
      ) : platformCards(shown.data.cards).length === 0 ? (
        <p className="text-sm text-muted-foreground">{Object.values(filters).some(Boolean) ? "No template matches these filters" : "No templates yet"}</p>
      ) : (
        <CardGrid cards={platformCards(shown.data.cards)} attr="data-make-gallery-cards" />
      )}
    </section>
  );
}

function OrganizationRow({ organizationId }: { organizationId: string }) {
  // org-filter: write-target the row names the active organization because its rows are that organization's saved templates
  const name = useAppSelector(selectActiveOrganizationName);
  const read = useCatalogue(`org:${organizationId}`, orgRowFilter(organizationId));
  const cards = read.phase === "read" ? orgRowCards(read.data.cards, organizationId) : [];
  return (
    <div className="flex flex-col gap-2" data-make-org-row={organizationId}>
      <h3 className="truncate text-xs font-medium text-muted-foreground">{name ? `${name}’s templates` : "Your organization’s templates"}</h3>
      {read.phase === "reading" ? (
        <Skeleton className="h-10 w-full" />
      ) : read.phase === "failed" ? (
        <Failed why={read.why} retry={read.reload} />
      ) : cards.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-make-org-row-empty="">No saved templates yet</p>
      ) : (
        <CardGrid cards={cards} attr="data-make-org-cards" />
      )}
    </div>
  );
}

function Facet({
  label,
  value,
  options,
  wordKey,
  onChange,
}: {
  label: string;
  value: string | null;
  options: string[];
  wordKey: "industry" | "job" | "teaches";
  onChange: (v: string | null) => void;
}) {
  return (
    <Select value={value ?? "__all"} onValueChange={(v) => onChange(v === "__all" ? null : v)}>
      <SelectTrigger className="h-8 w-auto min-w-[8rem] text-xs" aria-label={label} data-make-facet={wordKey}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__all">{`Any ${label.toLowerCase()}`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o} data-make-facet-option={o}>
            {wordFor(wordKey, o)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CardGrid({ cards, attr }: { cards: GalleryCard[]; attr: string }) {
  return <TemplateCardGrid cards={cards} hrefFor={(card) => templatePreviewHref(card.id)} attr={attr} />;
}

function Failed({ why, retry }: { why: string; retry: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
      <span className="text-destructive">{why}</span>
      <Button size="sm" variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The preview page: what it installs, then one-click install with live progress.
// ─────────────────────────────────────────────────────────────────────────────

type Run =
  | { phase: "idle" }
  | { phase: "running"; door: "template_install" | "template_uninstall"; answer: TemplateDoorAnswer | null }
  | { phase: "installed"; answer: TemplateDoorAnswer }
  | { phase: "removed"; answer: TemplateDoorAnswer }
  | { phase: "refused"; door: "template_install" | "template_uninstall"; why: string; answer: TemplateDoorAnswer | null };

function refusalLine(run: { answer: TemplateDoorAnswer | null; error?: { message: string } }): string {
  const r = run.answer?.refusal as { message?: string } | null | undefined;
  return r?.message ?? run.error?.message ?? "It stopped before it finished.";
}

export function TemplatePreview({ templateId }: { templateId: string }) {
  // org-filter: write-target the active organization is where this template installs; with none chosen the install asks
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const read = useCatalogue(`card:${templateId}:${organizationId ?? ""}`, galleryFilter({}, { installedIn: organizationId }));
  const card = read.phase === "read" ? (read.data.cards.find((c) => c.id === templateId) ?? null) : null;
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const [askOrganization, setAskOrganization] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dispatch = useAppDispatch();
  // The agent is the host's step of an install; `copying` while it runs, `failed` says why.
  const [agent, setAgent] = useState<{ phase: "idle" | "copying" } | { phase: "failed"; why: string }>({ phase: "idle" });
  const [agentNote, setAgentNote] = useState<string | null>(null);

  const addAgent = async (answer: TemplateDoorAnswer, orgId: string) => {
    if (!hostStepsPending(answer)) return;
    setAgent({ phase: "copying" });
    const supabase = createClient();
    const result = await addInstalledAgent(answer, orgId, {
      copier: templateAgentCopier(dispatch),
      // Extra agents (Kits → Template merge) are copied as the kit copied them: no records tool added.
      extraCopier: templateAgentCopier(dispatch, { attachRecordsTool: false }),
      createWorkflow: templateWorkflowCreator(dispatch),
      archiveAgent: templateAgentArchiver(dispatch),
      archiveWorkflow: (workflowId) => setWorkflowFlag(workflowId, { is_archived: true }),
      claim: async (installId, kind, label, sourceId) => {
        const { data, error } = await supabase
          .schema("custom")
          .rpc("template_install_claim", {
            p_organization_id: orgId,
            p_install_id: installId,
            p_kind: kind,
            p_label: label,
            ...(sourceId ? { p_source_id: sourceId } : {}),
            p_lease_seconds: await templateKnob("run_lease_seconds"),
          });
        if (error) throw new Error(error.message);
        return (data as { claim: Claim }).claim;
      },
      note: async (installId, agentId, label, kind) => {
        const { data, error } = await supabase
          .schema("custom")
          .rpc("template_install_note", {
            p_organization_id: orgId,
            p_install_id: installId,
            p_kind: kind ?? "agent",
            p_id: agentId,
            p_label: label,
          });
        if (error) throw new Error(error.message);
        return data as TemplateDoorAnswer;
      },
    });
    setRun({ phase: "installed", answer: result.answer });
    setAgent(result.ok ? { phase: "idle" } : { phase: "failed", why: result.why });
  };

  const go = async (door: "template_install" | "template_uninstall", id: string) => {
    if (!organizationId) {
      setAskOrganization(true);
      return;
    }
    setRun({ phase: "running", door, answer: null });
    const done = await runTemplateDoor(supabaseDataSource(createClient()), door, organizationId, id, {
      maxCalls: 400,
      onCall: (answer) => setRun({ phase: "running", door, answer }),
    });
    if (!done.ok || !done.answer?.done) {
      setRun({ phase: "refused", door, why: refusalLine(done), answer: done.answer });
      return;
    }
    setAgent({ phase: "idle" });
    setAgentNote(null);
    setRun(door === "template_install" ? { phase: "installed", answer: done.answer } : { phase: "removed", answer: done.answer });
    if (door === "template_install") {
      await addAgent(done.answer, organizationId);
    } else {
      // The door leaves a copied agent for the host: archive it here.
      const archive = templateAgentArchiver(dispatch);
      const lines: string[] = [];
      for (const agentId of agentsLeftBy(done.answer)) {
        try {
          await archive(agentId);
        } catch (err) {
          lines.push(`The assistant was not archived — ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      setAgentNote(lines.length ? lines.join(" ") : null);
    }
    read.reload();
  };
  const install = () => void go("template_install", templateId);

  // The organization asked for on the first press has been chosen: install now (ask, then replay).
  useEffect(() => {
    if (!askOrganization || !organizationId) return;
    setAskOrganization(false);
    install();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replays once, when the organization lands
  }, [askOrganization, organizationId]);

  if (read.phase === "reading") return <Skeleton className="h-64 w-full" />;
  if (read.phase === "failed") return <Failed why={read.why} retry={read.reload} />;
  if (!card) return <p className="text-sm text-muted-foreground">This template is not in the gallery</p>;

  // A refused or half-made install also has an id: Remove archives whatever it made so far.
  const installId =
    run.phase === "removed" ? null : ((run.phase !== "idle" ? run.answer?.install_id : null) ?? card.installed?.install_id ?? null);
  const isInstalled = run.phase === "installed" || (run.phase !== "removed" && card.installed?.state === "installed");
  const made = ((run.phase !== "idle" ? run.answer?.made : null) ?? []) as MadeObject[];

  return (
    <div className="flex flex-col gap-6" data-make-template-preview={card.catalogue_id}>
      <TemplateSummary card={card} />

      <section className="flex flex-col gap-3" aria-labelledby="make-template-install">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="make-template-install" className="sr-only">
            Install
          </h2>
          {isInstalled ? (
            <>
              <Button onClick={install} disabled={run.phase === "running"} data-make-template-open="">
                Show what it made
              </Button>
            </>
          ) : (
            <Button onClick={install} disabled={run.phase === "running"} data-make-template-install="">
              {run.phase === "running" && run.door === "template_install" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Install
            </Button>
          )}
          {installId ? (
            <Button variant="outline" onClick={() => setConfirmRemove(true)} disabled={run.phase === "running"} data-make-template-remove="">
              Remove
            </Button>
          ) : null}
          <SavesTo />
        </div>

        {askOrganization && !organizationId ? (
          <OrganizationContextNotice
            state={active.organizationState === "ready" ? "required" : active.organizationState}
            what="Templates"
            description={SAVED_WHERE_CHOSEN}
            compact
          />
        ) : null}

        {run.phase === "running" ? <Progress run={run} /> : null}
        {run.phase === "refused" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="alert" data-make-template-refused="">
            <span className="text-destructive">{run.why}</span>
            <Button size="sm" variant="outline" onClick={() => void go(run.door, run.door === "template_install" ? templateId : (installId ?? ""))}>
              Try again
            </Button>
          </div>
        ) : null}
        {run.phase === "removed" ? <p className="text-sm text-muted-foreground" data-make-template-removed="">Removed — everything it made is in Trash</p> : null}
        {run.phase === "removed" && agentNote ? <p className="text-sm text-destructive" role="alert" data-make-template-agent-archive-failed="">{agentNote}</p> : null}
        {run.phase === "installed" ? (
          <Landing
            made={made}
            agent={agent}
            retryAgent={() => organizationId && void addAgent(run.answer, organizationId)}
          />
        ) : null}
        {run.phase === "installed" && agent.phase === "idle" && typeof run.answer.organization_id === "string" ? (
          <InstalledTemplate organizationId={run.answer.organization_id} made={made} tryIts={tryItsOf(run.answer)} />
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(false)}
        title={`Remove ${card.name}?`}
        description="Every table, form, view and row it made is archived. You can restore them from Trash."
        confirmLabel="Remove"
        variant="destructive"
        onConfirm={() => {
          setConfirmRemove(false);
          if (installId) void go("template_uninstall", installId);
        }}
      />
    </div>
  );
}

/** Try-it prompts by agent title: the template's agent and its extra agents (the install's host block). */
function tryItsOf(answer: TemplateDoorAnswer): Record<string, TemplateTryIt> {
  const out: Record<string, TemplateTryIt> = {};
  const agent = answer.agent as (Record<string, unknown> & { name?: string }) | null | undefined;
  const own = (agent?.["tryIt"] ?? agent?.["try_it"]) as TemplateTryIt | undefined;
  if (agent?.name && own) out[agent.name] = own;
  const host = (answer["host"] ?? null) as { extra_agents?: Array<{ name: string; tryIt?: TemplateTryIt }> | null } | null;
  for (const x of host?.extra_agents ?? []) if (x.tryIt) out[x.name] = x.tryIt;
  return out;
}

/** Live progress: every object ticks as the install makes it. */
function Progress({ run }: { run: Extract<Run, { phase: "running" }> }) {
  const made = (run.answer?.made ?? []) as MadeObject[];
  const steps = typeof run.answer?.steps === "number" ? run.answer.steps : null;
  const step = run.answer?.next_step ?? 0;
  return (
    <div className="flex flex-col gap-2" data-make-template-progress={run.door}>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {run.door === "template_install" ? "Installing" : "Removing"}
        {steps ? <span className="tabular-nums">{`${Math.min(step, steps)} of ${steps} steps`}</span> : null}
      </p>
      {run.door === "template_install" ? (
        <ul className="flex flex-col gap-1 text-sm">
          {made
            .filter((m) => m.kind !== "field")
            .map((m) => (
              <li key={`${m.kind}:${m.ref}`} className="flex min-w-0 items-center gap-2" data-make-template-made={m.kind}>
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{m.title ?? m.ref}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{m.kind}</span>
              </li>
            ))}
          <li className="flex items-center gap-2 text-muted-foreground">
            <CircleDashed className="h-3.5 w-3.5 animate-spin" />
            <span>…</span>
          </li>
        </ul>
      ) : null}
    </div>
  );
}

/** The landing: every object the install made that a person opens, each one a link. */
export function Landing({
  made,
  agent = { phase: "idle" },
  retryAgent,
}: {
  made: MadeObject[];
  agent?: { phase: "idle" | "copying" } | { phase: "failed"; why: string };
  retryAgent?: () => void;
}) {
  const rows = openableMade(made);
  return (
    <div className="flex flex-col gap-2" data-make-template-landing={rows.length}>
      <p className="flex items-center gap-2 text-sm text-foreground">
        <Check className="h-4 w-4 text-primary" /> Installed
      </p>
      {agent.phase === "copying" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" data-make-template-agent="copying">
          <Loader2 className="h-4 w-4 animate-spin" /> Adding the assistant
        </p>
      ) : null}
      {agent.phase === "failed" ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" role="alert" data-make-template-agent="failed">
          <span className="text-destructive">{`The assistant was not added — ${agent.why}`}</span>
          {retryAgent ? (
            <Button size="sm" variant="outline" onClick={retryAgent}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((m) => (
          <li key={`${m.kind}:${m.ref}`}>
            <Link
              href={hrefForMade(m) ?? "#"}
              target="_blank"
              data-make-template-landing-row={m.kind}
              className={cn("flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted")}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{m.title ?? m.ref}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{m.kind}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
