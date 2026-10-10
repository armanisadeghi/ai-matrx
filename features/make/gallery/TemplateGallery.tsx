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
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, CircleDashed, ExternalLink, Loader2 } from "lucide-react";
import { storeDoors, supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, templateUpgradeHint, upgradeTemplateInstall, type TemplateDoorAnswer } from "@ai-matrx/records/templates";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { templateAgentArchiver, templateAgentCopier, templateWorkflowCreator } from "@/features/templates/agentCopyHost";
import { addInstalledAgent, agentsLeftBy, hostStepsPending, type Claim } from "./installAgent";
import { InstalledTemplate, type InstalledShow, type TemplateTryIt } from "@/features/templates/components/InstalledTemplate";
import { TEMPLATES_CHANGED_EVENT } from "@/features/templates/events";
import { useOpenSaveTemplateDialog } from "@/features/overlays/openers/saveTemplateDialog";
import { EntityOrgFilter } from "@/lib/entity-list/components/EntityOrgFilter";
import { useOrgFilterParam } from "@/lib/entity-list/orgFilterUrl";
import { templateKnob } from "@/features/templates/knobs";
import { setWorkflowFlag } from "@/features/workflow-runtime/browse/service";
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
  platformCards,
  type GalleryAnswer,
  type GalleryCard,
  type GalleryFilters,
  type MadeObject,
  wordFor,
} from "./catalogue";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** The preview page's address for one card. */
export const templatePreviewHref = (id: string) => `/templates/${encodeURIComponent(id)}`;

// ─────────────────────────────────────────────────────────────────────────────
// The catalogue door.
// ─────────────────────────────────────────────────────────────────────────────

type Read<T> = { phase: "reading" } | { phase: "failed"; why: string } | { phase: "read"; data: T };

/** Every card the filter matches: the door pages at 200, so a long catalogue is read to its end. */
async function readCatalogue(filter: Record<string, unknown>): Promise<{ total: number; cards: GalleryCard[] }> {
  const doors = storeDoors(createClient());
  const cards: GalleryCard[] = [];
  let offset = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await doors.templates({ ...filter, offset });
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
  useFinishInterruptedRemovals(shown.phase === "read" ? shown.data.cards : [], organizationId, shown.reload);

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

      <OrganizationsRow installedIn={organizationId} />

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

/** A removal the person left half-done (tab closed) finishes by itself when any card of the gallery shows it. */
function useFinishInterruptedRemovals(cards: GalleryCard[], organizationId: string | null, reload: () => void) {
  const dispatch = useAppDispatch();
  const [started] = useState(() => new Set<string>());
  useEffect(() => {
    if (!organizationId) return;
    for (const card of cards) {
      const inst = card.installed;
      if (!inst || inst.state !== "uninstalling" || started.has(inst.install_id)) continue;
      started.add(inst.install_id);
      void runTemplateDoor(supabaseDataSource(createClient()), "template_uninstall", organizationId, inst.install_id, { maxCalls: 400 }).then(
        async (done) => {
          if (done.ok && done.answer?.done) await archiveLeftAgents(done.answer, dispatch);
          reload();
        },
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `started` guards each install to one resume
  }, [cards, organizationId]);
}

/**
 * "Your organizations' templates": every template the person's organizations saved, beside the
 * platform's. The active organization is NOT a filter (access ladder): a page-local organization
 * filter narrows it, defaulting to All organizations. Save as template opens from here too.
 */
function OrganizationsRow({ installedIn }: { installedIn: string | null }) {
  const [orgFilter, setOrgFilter] = useOrgFilterParam();
  const [changed, setChanged] = useState(0);
  useEffect(() => {
    const again = () => setChanged((n) => n + 1);
    window.addEventListener(TEMPLATES_CHANGED_EVENT, again);
    return () => window.removeEventListener(TEMPLATES_CHANGED_EVENT, again);
  }, []);
  const openSave = useOpenSaveTemplateDialog();
  const read = useCatalogue(
    `orgs:${orgFilter ?? "all"}:${installedIn ?? ""}:${changed}`,
    galleryFilter({}, { scope: "org", organizationId: orgFilter, installedIn }),
  );
  const cards = read.phase === "read" ? read.data.cards.filter((c) => c.scope === "org" && (!orgFilter || c.owner_organization_id === orgFilter)) : [];
  return (
    <div className="flex flex-col gap-2" data-make-org-row={orgFilter ?? "all"}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="truncate text-xs font-medium text-muted-foreground">Your organizations’ templates</h3>
        <EntityOrgFilter orgId={orgFilter} onChange={setOrgFilter} />
        <Button variant="outline" className="ml-auto" onClick={() => openSave({})} data-make-save-template="">
          Save as template
        </Button>
      </div>
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
      <SelectTrigger className="w-auto min-w-[8rem]" aria-label={label} data-make-facet={wordKey}>
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
      <Button variant="outline" onClick={retry}>
        Try again
      </Button>
    <ErrorAlchemyMenu /></div>
  );
}

/**
 * "Made from your descriptions": the one-offs a describe run installed here and nobody removed.
 * The gallery's own cards and `TemplatePreview` (Show what it made · Remove · Save as my template)
 * serve it unchanged, so a thing the describe box made can be taken back after its result card is gone.
 */
export function InstalledOneOffs() {
  // org-filter: write-target — the installs of the organization they were made in
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const read = useCatalogue(
    organizationId ? `one-offs:${organizationId}` : null,
    galleryFilter({}, { installedIn: organizationId, installedOneOffs: true }),
  );
  if (!organizationId || read.phase !== "read" || read.data.cards.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="make-one-offs" data-make-one-offs="">
      <h2 id="make-one-offs" className="text-sm font-medium text-muted-foreground">
        Made from your descriptions
      </h2>
      <ul className="flex flex-col gap-2">
        {read.data.cards.map((card) => (
          <li key={card.id} className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" data-make-one-off={card.id}>
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
              <span className="truncate text-sm font-medium text-foreground">{card.name}</span>
              {card.footprint?.line ? <span className="truncate text-xs text-muted-foreground">{card.footprint.line}</span> : null}
            </div>
            <TemplatePreview templateId={card.id} bare installedOneOff />
          </li>
        ))}
      </ul>
    </section>
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

/** The door leaves a copied agent for the host: archive each; the lines say which could not be. */
async function archiveLeftAgents(answer: TemplateDoorAnswer, dispatch: ReturnType<typeof useAppDispatch>): Promise<string[]> {
  const archive = templateAgentArchiver(dispatch);
  const lines: string[] = [];
  for (const agentId of agentsLeftBy(answer)) {
    try {
      await archive(agentId);
    } catch (err) {
      lines.push(`The assistant was not archived — ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return lines;
}

/**
 * One template's install, its live progress and its landing. `bare` leaves the summary out (the
 * public page /templates/<slug> draws its own); `autoInstall` presses Install once the card is read
 * (a guest who signed up from "Use this template" comes back with ?install=1).
 */
export function TemplatePreview({
  templateId,
  bare = false,
  autoInstall = false,
  onInstalled,
  productName,
  installLabel = "Install",
  installedOneOff = false,
}: {
  templateId: string;
  /** A one-off a describe run already installed (/make's "Made from your descriptions"): no Install, no gallery-template actions; Show what it made, Remove, Save as my template stay. */
  installedOneOff?: boolean;
  /** The install button's name where the host calls the act something else (an Applet template: "Use this template"). */
  installLabel?: string;
  bare?: boolean;
  /** What the person installed, when it is not the data template itself (an Applet template's own name). */
  productName?: string;
  autoInstall?: boolean;
  /** A host step after the install lands (an Applet template copies its Applet here); fires once per install. */
  onInstalled?: (answer: TemplateDoorAnswer, organizationId: string) => void;
}) {
  // org-filter: write-target the active organization is where this template installs; with none chosen the install asks
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const read = useCatalogue(`card:${templateId}:${organizationId ?? ""}`, galleryFilter({}, { installedIn: organizationId, id: templateId }));
  const card = read.phase === "read" ? (read.data.cards.find((c) => c.id === templateId) ?? null) : null;
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const [askOrganization, setAskOrganization] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const dispatch = useAppDispatch();
  // The agent is the host's step of an install; `copying` while it runs, `failed` says why.
  const [agent, setAgent] = useState<AgentStep>({ phase: "idle" });
  const [agentNote, setAgentNote] = useState<string | null>(null);
  // An install made from an older version: Upgrade runs custom.template_upgrade over it.
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeWhy, setUpgradeWhy] = useState<string | null>(null);

  const addAgent = async (answer: TemplateDoorAnswer, orgId: string) => {
    if (!hostStepsPending(answer)) return;
    setAgent({ phase: "copying" });
    const supabase = createClient();
    const result = await addInstalledAgent(answer, orgId, {
      copier: templateAgentCopier(dispatch),
      // Extra agents are copied without the records tool (their own tools are kept).
      extraCopier: templateAgentCopier(dispatch, { attachRecordsTool: false }),
      createWorkflow: templateWorkflowCreator(dispatch),
      archiveAgent: templateAgentArchiver(dispatch),
      archiveWorkflow: (workflowId) => setWorkflowFlag(workflowId, { is_archived: true }),
      claim: async (installId, kind, label, sourceId) => {
        const lease = await templateKnob("run_lease_seconds");
        const { data, error } = await storeDoors(supabase).templateInstallClaim({ organizationId: orgId, installId, kind, label, sourceId, leaseSeconds: lease });
        if (error) throw new Error(error.message);
        const claim = (data as unknown as { claim: Claim & { claimed_at?: string } }).claim;
        if (claim.state !== "held") return claim;
        // When the other tab's hold runs out: its claim time plus the lease.
        const at = claim.claimed_at ? Date.parse(claim.claimed_at) + lease * 1000 : NaN;
        return { state: "held", retryAt: Number.isFinite(at) ? new Date(at).toISOString() : null };
      },
      note: async (installId, agentId, label, kind) => {
        const { data, error } = await storeDoors(supabase).templateInstallNote({ organizationId: orgId, installId, kind: kind ?? "agent", id: agentId, label });
        if (error) throw new Error(error.message);
        return data as TemplateDoorAnswer;
      },
    });
    setRun({ phase: "installed", answer: result.answer });
    setAgent(result.ok ? { phase: "idle" } : { phase: "failed", why: result.why, retryAt: result.retryAt ?? null });
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
      const lines = await archiveLeftAgents(done.answer, dispatch);
      setAgentNote(lines.length ? lines.join(" ") : null);
    }
    read.reload();
  };
  const install = () => void go("template_install", templateId);

  const upgrade = async (installIdNow: string, templateIdNow: string) => {
    if (!organizationId) return;
    setUpgrading(true);
    setUpgradeWhy(null);
    const done = await upgradeTemplateInstall(supabaseDataSource(createClient()), organizationId, installIdNow, templateIdNow);
    setUpgrading(false);
    if (!done.ok || !done.answer) {
      setUpgradeWhy(refusalLine(done));
      return;
    }
    setAgent({ phase: "idle" });
    setRun({ phase: "installed", answer: done.answer });
    await addAgent(done.answer, organizationId);
    read.reload();
  };

  // AN INTERRUPTED RUN FINISHES ITSELF (2026-10-07): Remove and Install run from the browser in chunks, so a closed
  // tab leaves the install "uninstalling" / "installing" for good. Seeing one, resume it once, without a press.
  const [resumed, setResumed] = useState<string | null>(null);
  useEffect(() => {
    if (read.phase !== "read" || run.phase !== "idle" || !organizationId) return;
    const found = read.data.cards.find((c) => c.id === templateId)?.installed;
    if (!found || resumed === found.install_id) return;
    if (found.state === "uninstalling") {
      setResumed(found.install_id);
      void go("template_uninstall", found.install_id);
    } else if (found.state === "installing") {
      setResumed(found.install_id);
      install();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resumes once per install, when the card lands
  }, [read.phase, run.phase, organizationId, resumed]);

  // The organization asked for on the first press has been chosen: install now (ask, then replay).
  useEffect(() => {
    if (!askOrganization || !organizationId) return;
    setAskOrganization(false);
    install();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replays once, when the organization lands
  }, [askOrganization, organizationId]);

  // The install landed and its own host steps are done: hand it to the caller's step, once per install.
  const [handedOff, setHandedOff] = useState<string | null>(null);
  useEffect(() => {
    if (!onInstalled || run.phase !== "installed" || agent.phase === "copying" || !organizationId) return;
    const key = run.answer.install_id ?? "installed";
    if (handedOff === key) return;
    setHandedOff(key);
    onInstalled(run.answer, organizationId);
  }, [onInstalled, run, agent.phase, organizationId, handedOff]);

  // A guest who came back from sign-up asked to install: press Install once, when the card is read.
  const [autoPressed, setAutoPressed] = useState(false);
  useEffect(() => {
    if (!autoInstall || autoPressed || read.phase !== "read") return;
    const found = read.data.cards.find((c) => c.id === templateId);
    if (!found || found.installed?.state === "installed") return;
    setAutoPressed(true);
    install();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- presses once, when the card lands
  }, [autoInstall, autoPressed, read.phase]);

  if (read.phase === "reading") return <Skeleton className={bare ? "h-10 w-48" : "h-64 w-full"} />;
  if (read.phase === "failed") return <Failed why={read.why} retry={read.reload} />;
  if (!card) return <p className="text-sm text-muted-foreground">This template is not in the gallery</p>;

  // A refused or half-made install also has an id: Remove archives whatever it made so far.
  const installId =
    run.phase === "removed" ? null : ((run.phase !== "idle" ? run.answer?.install_id : null) ?? card.installed?.install_id ?? null);
  const isInstalled = run.phase === "installed" || (run.phase !== "removed" && card.installed?.state === "installed");
  // A STUCK INSTALL SAYS SO (CHAIR-DESCRIBE-4): left part-way (the page closed, a step never came back) it
  // offers Finish install (the door resumes at its next step) and Remove (archives what it made so far).
  const stuck = run.phase === "idle" && (card.installed?.state === "installing" || card.installed?.state === "refused");
  const answerNow = run.phase !== "idle" ? run.answer : null;
  // Parts the card counts that leave no `made` entry (a stage rule set lives on its table) join the
  // landing as rows that open, so every count on the card has a row.
  const unrecorded = (((answerNow?.["show"] as { unrecorded?: MadeObject[] } | undefined)?.unrecorded ?? []) as Array<Omit<MadeObject, "id">>).map(
    (u) => ({ ...u, id: u.table_id }) as MadeObject,
  );
  const made = [...((answerNow?.made ?? []) as MadeObject[]), ...unrecorded];
  // "Newer version available": the install answer's hint, or the card's own version against the install's.
  const hint = run.phase === "installed" ? templateUpgradeHint(run.answer) : null;
  const upgradeFrom =
    hint ??
    (run.phase === "idle" && card.installed?.state === "installed" && card.version > card.installed.version
      ? { install_id: card.installed.install_id, template_id: card.id, to_version: card.version }
      : null);

  return (
    <div className="flex flex-col gap-6" data-make-template-preview={card.catalogue_id}>
      {bare ? null : <TemplateSummary card={card} />}

      <section className="flex flex-col gap-3" aria-labelledby="make-template-install">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="make-template-install" className="sr-only">
            Install
          </h2>
          {isInstalled ? (
            <>
              <Button variant="primary" onClick={install} disabled={run.phase === "running" || upgrading} data-make-template-open="">
                Show what it made
              </Button>
              {upgradeFrom ? (
                <Button
                  variant="outline"
                  icon={upgrading ? <Loader2 className="animate-spin" /> : null}
                  onClick={() => void upgrade(upgradeFrom.install_id, upgradeFrom.template_id)}
                  disabled={run.phase === "running" || upgrading}
                  data-make-template-upgrade={upgradeFrom.to_version}
                >
                  {`Upgrade to v${upgradeFrom.to_version}`}
                </Button>
              ) : null}
            </>
          ) : installedOneOff && !stuck && run.phase !== "running" ? null : (
            <Button icon={run.phase === "running" && run.door === "template_install" ? <Loader2 className="animate-spin" /> : null} variant="primary" onClick={install} disabled={run.phase === "running"} data-make-template-install={stuck ? "finish" : ""}>
              {stuck ? "Finish install" : installLabel}
            </Button>
          )}
          {installId ? (
            <Button variant="outline" onClick={() => setConfirmRemove(true)} disabled={run.phase === "running"} data-make-template-remove="">
              Remove
            </Button>
          ) : null}
          {stuck ? (
            <span className="text-sm text-muted-foreground" data-make-template-stuck="">
              Stopped part-way
            </span>
          ) : null}
          <SavesTo />
          {card.scope === "org" && card.ephemeral ? <KeepOneOff templateId={card.id} kept={read.reload} /> : null}
          {card.scope === "org" && !installedOneOff ? <ArchiveOrgTemplate templateId={card.id} name={card.name} /> : null}
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
        {upgradeWhy ? (
          <p className="text-sm text-destructive" role="alert" data-make-template-upgrade-refused="">
            {upgradeWhy}
          <ErrorAlchemyMenu error={upgradeWhy} /></p>
        ) : null}
        {run.phase === "refused" ? (
          <div className="flex flex-wrap items-center gap-2 text-sm" role="alert" data-make-template-refused="">
            <span className="text-destructive">{run.why}</span>
            <Button variant="outline" onClick={() => void go(run.door, run.door === "template_install" ? templateId : (installId ?? ""))}>
              Try again
            </Button>
          <ErrorAlchemyMenu /></div>
        ) : null}
        {run.phase === "removed" ? <p className="text-sm text-muted-foreground" data-make-template-removed="">Removed — everything it made is in Trash</p> : null}
        {run.phase === "removed" && agentNote ? <p className="text-sm text-destructive" role="alert" data-make-template-agent-archive-failed="">{agentNote}<ErrorAlchemyMenu /></p> : null}
        {run.phase === "installed" ? (
          <Landing
            made={made}
            agent={agent}
            retryAgent={() => organizationId && void addAgent(run.answer, organizationId)}
          />
        ) : null}
        {run.phase === "installed" && agent.phase === "idle" && typeof run.answer.organization_id === "string" ? (
          <InstalledTemplate
            organizationId={run.answer.organization_id}
            made={made}
            tryIts={tryItsOf(run.answer)}
            show={(run.answer["show"] ?? null) as InstalledShow | null}
          />
        ) : null}
      </section>

      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={(open) => !open && setConfirmRemove(false)}
        title={`Remove ${productName ?? card.name}?`}
        description="Its tables, rows, views, forms, dashboards, agents, workflows and app are archived. Restore them from Trash."
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

/** Live progress: every object ticks as the install makes it (the gallery and the describe box). */
export function Progress({ run }: { run: { door: "template_install" | "template_uninstall"; answer: TemplateDoorAnswer | null } }) {
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
              <li key={`${m.kind}:${m.ref}:${m.id ?? ""}`} className="flex min-w-0 items-center gap-2" data-make-template-made={m.kind}>
                <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="truncate">{m.title ?? m.ref}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{madeWord(m)}</span>
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

/**
 * An organization's own template is archived, never deleted (custom.template_archive: the person who
 * saved it or an organization admin; anyone else is told so by the door). Installs stay as they are.
 */
/** A describe run's one-off joins the organization's templates only when the person keeps it. */
function KeepOneOff({ templateId, kept }: { templateId: string; kept: () => void }) {
  const [why, setWhy] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const keep = async () => {
    setBusy(true);
    const { error } = await storeDoors(createClient()).templateKeep(templateId);
    setBusy(false);
    if (error) {
      setWhy(error.message);
      return;
    }
    window.dispatchEvent(new Event(TEMPLATES_CHANGED_EVENT));
    kept();
  };
  return (
    <>
      <Button variant="outline" onClick={() => void keep()} disabled={busy} data-make-template-keep="">
        Save as my template
      </Button>
      {why ? <span className="text-sm text-destructive" role="alert">{why}<ErrorAlchemyMenu error={why} /></span> : null}
    </>
  );
}

function ArchiveOrgTemplate({ templateId, name }: { templateId: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [why, setWhy] = useState<string | null>(null);
  const archive = async () => {
    setConfirm(false);
    const { error } = await storeDoors(createClient()).templateArchive(templateId);
    if (error) {
      setWhy(error.message);
      return;
    }
    window.dispatchEvent(new Event(TEMPLATES_CHANGED_EVENT));
    router.push("/templates");
  };
  return (
    <>
      <Button variant="quiet" onClick={() => setConfirm(true)} data-make-template-archive="">
        Archive template
      </Button>
      {why ? <span className="text-sm text-destructive" role="alert">{why}<ErrorAlchemyMenu error={why} /></span> : null}
      <ConfirmDialog
        open={confirm}
        onOpenChange={(open) => !open && setConfirm(false)}
        title={`Archive ${name}?`}
        description="It leaves your organization's templates. What it already installed stays."
        confirmLabel="Archive"
        variant="destructive"
        onConfirm={() => void archive()}
      />
    </>
  );
}

/** The word a landing row says for what it is (the card's words). */
function madeWord(m: MadeObject): string {
  if (m.kind === "rule") return /^notifications\./.test(m.ref) ? "notification" : /^digests\./.test(m.ref) ? "digest" : "rule";
  if (m.kind === "stage_rules") return "stage rule set";
  return m.kind;
}

type AgentStep = { phase: "idle" | "copying" } | { phase: "failed"; why: string; retryAt?: string | null };

/**
 * Retry, honestly: while another tab's claim holds, it says when the hold runs out, stays off until
 * then, and tries once by itself at that moment.
 */
function RetryAt({ retryAt, retry }: { retryAt: string | null; retry: () => void }) {
  const at = retryAt ? Date.parse(retryAt) : NaN;
  const [now, setNow] = useState(() => Date.now());
  const waiting = Number.isFinite(at) && now < at;
  useEffect(() => {
    if (!Number.isFinite(at)) return;
    const ms = at - Date.now();
    if (ms <= 0) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
      retry();
    }, ms + 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one automatic retry per hold
  }, [at]);
  return (
    <>
      {waiting ? (
        <span className="text-xs text-muted-foreground" data-make-template-retry-at={retryAt ?? ""}>
          {`Tries again at ${new Date(at).toLocaleTimeString()}`}
        </span>
      ) : null}
      <Button variant="outline" onClick={retry} disabled={waiting}>
        Retry
      </Button>
    </>
  );
}

/** The landing: every object the install made that a person opens, each one a link. */
export function Landing({
  made,
  agent = { phase: "idle" },
  retryAgent,
}: {
  made: MadeObject[];
  agent?: AgentStep;
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
          {retryAgent ? <RetryAt retryAt={agent.retryAt ?? null} retry={retryAgent} /> : null}
        <ErrorAlchemyMenu /></div>
      ) : null}
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {rows.map((m) => (
          <li key={`${m.kind}:${m.ref}:${m.id ?? ""}`}>
            <Link
              href={hrefForMade(m) ?? "#"}
              target="_blank"
              data-make-template-landing-row={m.kind}
              className={cn("flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted")}
            >
              <span className="min-w-0 flex-1 truncate text-sm">{m.title ?? m.ref}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{madeWord(m)}</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
