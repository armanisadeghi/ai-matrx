"use client";

import { humanizeIdentifier } from "@ai-matrx/kit/text-case";
/**
 * The tracker editor — ONE editor for both monitor lenses (coverage: who writes
 * about us; opportunity: news we can join). BRIEFS-STRATEGY-AND-ORG-CHART §5.1,
 * NEWS-ENGINE-SPEC §12 Lane G. Hosted from the brand's Monitoring front door
 * and from the site's Coverage tab; both open this route.
 *
 * Nothing the platform already knows is typed twice: the company comes from the
 * brand, and "Suggest from what we know" runs the monitor setup proposer, whose
 * every item carries the source it came from (the chip on each row). Items the
 * proposer could not trace are dropped by the server and listed here, never
 * hidden. Counts outside the suggested ranges warn; nothing blocks a save.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Save,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, Input } from "@ai-matrx/design-system/controls";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import {
  useBrand,
  useBrandSites,
  useBusinessFacts,
} from "@/features/marketing/data/hooks";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationMembers } from "@/features/organizations/hooks";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { DeliveryControls } from "@/features/marketing/news-monitor/DeliveryControls";
import { ArchiveRecordButton } from "@/features/trash/components/ArchiveRecordButton";
import { useWizardDraft } from "@/lib/wizard-draft/useWizardDraft";
import { WizardDraftRestored } from "@/lib/wizard-draft/WizardDraftRestored";
import { toast } from "@/lib/toast";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { cn } from "@/lib/utils";

import {
  getSetupFacts,
  proposeMonitorSetup,
  runMonitorNow,
  saveMonitor,
  type MonitorRunStarted,
  type ScheduleView,
  getMonitorSchedule,
  saveMonitorSchedule,
  type ProposalRef,
  type ProposalResult,
  type SetupCostEstimate,
  type SetupFacts,
} from "./api";
import {
  addProof,
  addSpokesperson,
  factText,
  isProof,
  isSpokesperson,
  saveBriefNote,
  useBriefNote,
  useInvalidateMonitorSetup,
  useRunMentions,
  useTracker,
} from "./data";
import {
  acceptPersonOffer,
  applyProposal,
  basisChip,
  beatsOutsideWordRange,
  briefMarkdown,
  countWarning,
  defaultSchedule,
  dismissPersonOffer,
  draftFromTracker,
  newDraft,
  nextEditorSession,
  parseBriefMarkdown,
  projectSchedules,
  scheduleCostAdvice,
  scheduleOptions,
  toDeclareBody,
  USER_BASIS,
  type Basis,
  type DraftItem,
  type EditorSession,
  type MonitorDraft,
  type OfferTarget,
  type PeopleIndex,
  type PersonOffer,
  blankedFieldsSentence,
  fittingSchedule,
  opportunityDraftSentence,
} from "./model";

import { ProTextarea } from "@/components/official/ProTextarea";
import { useFocusEditTarget, useIsEditTarget } from "@/features/marketing/lib/useEditTarget";
const NO_PROOF_SENTENCE =
  "Without a spokesperson or proof on file, pitch-ready stories will be marked 'needs a spokesperson'.";

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function allTimezones(current: string): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  const zones = supported ? supported("timeZone") : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function splitWords(value: string): string[] {
  return value
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
}

// ── small pieces ──────────────────────────────────────────────────────────

function Section({
  step,
  title,
  lede,
  children,
}: {
  step: number;
  title: string;
  lede?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-card p-3">
      <h2 className="text-sm font-semibold text-foreground">
        <span className="mr-2 text-muted-foreground">{step}.</span>
        {title}
      </h2>
      {lede ? (
        <p className="mt-0.5 text-xs text-muted-foreground">{lede}</p>
      ) : null}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Warning({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-xs text-warning">{text}</p>;
}

function BasisChip({
  basis,
  refs,
}: {
  basis: Basis;
  refs: Map<string, ProposalRef>;
}) {
  const source = refs.get(basis.ref);
  const title = source
    ? source.label
    : basis.kind === "user"
      ? "You typed this"
      : basis.ref;
  const chip = (
    <Chip
      tone={basis.kind === "user" ? "neutral" : "primary"}
      icon={source?.url ? <ExternalLink /> : undefined}
      label={basisChip(basis)}
      title={title}
    />
  );
  return source?.url ? (
    <a href={source.url} target="_blank" rel="noopener noreferrer">
      {chip}
    </a>
  ) : (
    chip
  );
}

function ItemList({
  label,
  items,
  onChange,
  refs,
  placeholder,
  warning,
  editTarget,
}: {
  editTarget?: string;
  label: string;
  items: DraftItem[];
  onChange: (next: DraftItem[]) => void;
  refs: Map<string, ProposalRef>;
  placeholder: string;
  warning?: string | null;
}) {
  const [adding, setAdding] = useState("");
  const add = () => {
    const text = adding.trim();
    if (!text) return;
    onChange([...items, { text, basis: USER_BASIS }]);
    setAdding("");
  };
  return (
    <div data-list={label}>
      <p className="text-xs font-medium text-foreground">
        {label} <span className="text-muted-foreground">({items.length})</span>
      </p>
      <ul className="mt-1 flex flex-col gap-1">
        {items.map((item, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              value={item.text}
              aria-label={`${label} ${index + 1}`}
              onChange={(e) => {
                const next = [...items];
                next[index] = { text: e.target.value, basis: USER_BASIS };
                onChange(next);
              }}
            />
            <BasisChip basis={item.basis} refs={refs} />
            <Button
              icon={<X />}
              variant="quiet"
              className="shrink-0"
              aria-label={`Remove ${item.text}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            />
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-2">
        <Input
          value={adding}
          data-edit-target={editTarget}
          placeholder={placeholder}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          icon={<Plus />}
          variant="outline"
          onClick={add}
          disabled={!adding.trim()}
        > Add
        </Button>
      </div>
      <Warning text={warning ?? null} />
    </div>
  );
}

const OFFER_TARGET_LABEL: Record<OfferTarget, string> = {
  keywords: "coverage keywords",
  competitors: "competitors",
  topics: "beats",
  searchTerms: "search terms",
  standing: "standing",
};

/** Names setup found but did not add: a person is never watched unless someone picks them. */
function PersonOffers({
  offers,
  rosterError,
  onAccept,
  onDismiss,
}: {
  offers: PersonOffer[];
  /** Why the roster could not be read, when it could not. */
  rosterError: string | null;
  onAccept: (offer: PersonOffer) => void;
  onDismiss: (offer: PersonOffer) => void;
}) {
  if (!offers.length) return null;
  const unchecked = offers.some((o) => o.why === "unchecked");
  return (
    <section
      className="rounded-md border border-border bg-card p-3"
      data-surface-value="setup_person_offers"
    >
      <h2 className="text-sm font-semibold text-foreground">
        Names we did not add
      </h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {unchecked ? (
          <>
            We could not read your organization&apos;s people, so we could not
            tell whether these brand names are people. Add one only if you want
            articles that name it.{" "}
            {rosterError ? <ErrorAlchemyMenu error={rosterError} /> : null}
          </>
        ) : (
          "These name a person. We never watch a person's name unless you choose to — add one only if you want articles about them."
        )}
      </p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {offers.map((offer) => (
          <li
            key={`${offer.target}:${offer.text}`}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs"
            data-person-offer={offer.text}
          >
            <span className="rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
              {offer.why === "person" ? "person" : "not checked"}
            </span>
            <span className="text-foreground">{offer.text}</span>
            <Button
              icon={<Plus />}
              variant="quiet"
              onClick={() => onAccept(offer)}
            > Add to{" "}
              {OFFER_TARGET_LABEL[offer.target]}
            </Button>
            <Button
              icon={<X />}
              variant="quiet"
              aria-label={`Leave out ${offer.text}`}
              onClick={() => onDismiss(offer)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── the editor ────────────────────────────────────────────────────────────

/**
 * One editor session per record: moving from one monitor — or from an edit —
 * to "new" remounts the editor, so no id, draft or recipient of one monitor is
 * carried into another. A new monitor's own id, adopted on its first save,
 * keeps the session (so "Save and run now" keeps following its run).
 */
export function MonitorSetupEditor() {
  const trackerParam = useSearchParams().get("tracker");
  const [session, setSession] = useState<EditorSession>({
    param: trackerParam,
    key: 0,
    adopted: null,
  });
  const next = nextEditorSession(session, trackerParam);
  if (next !== session) setSession(next);
  return (
    <MonitorSetupEditorBody
      key={next.key}
      onAdopt={(id) => setSession((s) => ({ ...s, adopted: id }))}
    />
  );
}

function MonitorSetupEditorBody({
  onAdopt,
}: {
  onAdopt: (trackerId: string) => void;
}) {
  const brandCtx = useMarketingBrand();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dispatch = useAppDispatch();
  const { format: formatCostDisplay } = useCostDisplay();
  const invalidate = useInvalidateMonitorSetup();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  useClippedContentGuard(scrollRef, { label: "monitor setup editor" });

  const trackerParam = searchParams.get("tracker");
  const siteParam = searchParams.get("site");
  const [trackerId, setTrackerId] = useState<string | null>(trackerParam);

  const brand = useBrand(brandCtx.id);
  const sites = useBrandSites(brandCtx.id);
  const facts = useBusinessFacts(brandCtx.id);
  const currentUserId = useAppSelector(selectUserId);
  const roster = useOrganizationMembers(brandCtx.organizationId);
  const [run, setRun] = useState<MonitorRunStarted | null>(null);
  const [polling, setPolling] = useState(false);
  const tracker = useTracker(trackerParam, polling ? 5000 : false);
  // Stop re-reading the monitor once the run it started has written its result.
  const lastRunAt = tracker.data?.last_run_at ?? null;
  useEffect(() => {
    if (!polling || !run || !lastRunAt) return;
    if (new Date(lastRunAt).getTime() >= new Date(run.startedAt).getTime()) {
      setPolling(false);
      setRunKey((k) => k + 1);
    }
  }, [polling, run, lastRunAt]);
  const brief = useBriefNote(tracker.data?.brief_source_id ?? null);

  const [setup, setSetup] = useState<SetupFacts | null>(null);
  const [setupError, setSetupError] = useState<unknown>(null);
  const [setupAttempt, setSetupAttempt] = useState(0);
  const [draft, setDraft] = useState<MonitorDraft | null>(null);
  // The readiness link `?edit=topics|brief` names fields that exist only with the opportunity lens. On a
  // coverage-only monitor that lens is switched on in the (unsaved, visible) form so the field is there.
  const wantsOpportunityField = useIsEditTarget("topics") || useIsEditTarget("brief");
  const switchedLens = useRef(false);
  useEffect(() => {
    if (!wantsOpportunityField || !draft || switchedLens.current) return;
    switchedLens.current = true;
    if (!draft.opportunity) setDraft({ ...draft, opportunity: true });
  }, [wantsOpportunityField, draft]);
  useFocusEditTarget("topics", draft !== null);
  useFocusEditTarget("brief", draft !== null);
  // NEVER LOSE THE FORM (defect 3, 2026-10-05): the unsaved draft is kept per
  // brand + monitor in the shared wizard-draft store, so a remount (a reload, a
  // dev refresh, an error boundary retry, a session re-key) puts it back — and
  // says so — instead of re-seeding a fresh form from the brand.
  const keptDraft = useWizardDraft<MonitorDraft | null>(
    `news-monitor-setup:${brandCtx.id}:${trackerParam ?? "new"}`,
    {
      restore: (data) =>
        data.draft && typeof data.draft === "object"
          ? { values: data.draft as MonitorDraft }
          : { values: null, rejectedKeys: data.draft === undefined ? [] : ["draft"] },
    },
  );
  // The draft as seeded (from the brand or the saved monitor): only a change
  // the person made after it is worth keeping.
  const seededDraft = useRef<MonitorDraft | null>(null);
  const lastKept = useRef<MonitorDraft | null>(null);
  const keepDraft = keptDraft.patch;
  const keptStatus = keptDraft.status;
  const applyKept = keptDraft.applyOnce;
  useEffect(() => {
    if (!draft || draft === seededDraft.current || draft === lastKept.current) return;
    lastKept.current = draft;
    keepDraft({ draft });
  }, [draft, keepDraft]);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [proposing, setProposing] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "run" | null>(null);
  const [schedule, setSchedule] = useState<ScheduleView | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [newSpokesperson, setNewSpokesperson] = useState({
    name: "",
    title: "",
  });
  const [newProof, setNewProof] = useState({ summary: "", url: "" });
  const [factError, setFactError] = useState<string | null>(null);
  const runMentions = useRunMentions(trackerId, runKey);
  // Who hears about it: an unsaved choice is committed right after the monitor saves.
  const deliveryCommit = useRef<((trackerId: string) => Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    setSetupError(null);
    getSetupFacts(dispatch, brandCtx.id, brandCtx.organizationId)
      .then((next) => live && setSetup(next))
      .catch((error: unknown) => live && setSetupError(error));
    return () => {
      live = false;
    };
  }, [dispatch, brandCtx.id, brandCtx.organizationId, setupAttempt]);

  // A saved monitor's schedule preselects its choice.
  useEffect(() => {
    if (!trackerParam) return;
    let live = true;
    getMonitorSchedule(dispatch, trackerParam, brandCtx.organizationId)
      .then((view) => {
        if (!live) return;
        setSchedule(view);
      })
      .catch(
        (error: unknown) =>
          live &&
          toast.error(error instanceof Error ? error.message : String(error)),
      );
    return () => {
      live = false;
    };
  }, [dispatch, trackerParam, brandCtx.organizationId]);

  const brandRow = brand.data;
  const aliases = (() => {
    const profile = (brandRow?.profile ?? {}) as Record<string, unknown>;
    const raw = profile.brand_aliases;
    return Array.isArray(raw) ? raw.map((a) => String(a)) : [];
  })();
  const siteRows = sites.data ?? [];
  // Who is a person (defect A) — structured signals only: the organization's
  // members and the brand's spokesperson facts. An unreadable roster is null,
  // and every alias is then offered rather than preselected.
  const spokespersonFacts = (facts.data ?? []).filter(isSpokesperson);
  const people: PeopleIndex = {
    names: roster.error
      ? null
      : [
          ...roster.members.flatMap((m) =>
            m.user?.displayName ? [m.user.displayName] : [],
          ),
          ...spokespersonFacts.flatMap((f) => {
            const value = (f.value ?? {}) as Record<string, unknown>;
            const name = String(value.name ?? value.text ?? "").trim();
            return name ? [name] : [];
          }),
        ],
    refs: new Set(spokespersonFacts.map((f) => `fact:${f.id}`)),
  };

  // The draft is built once, from the saved monitor or from the brand.
  useEffect(() => {
    if (draft || !brandRow || sites.isPending) return;
    if (trackerParam && tracker.isPending) return;
    if (keptStatus === "loading") return;
    // A kept, unsaved draft wins over a fresh seed — exactly once, announced.
    if (keptStatus === "found") {
      applyKept((kept) => {
        if (kept) {
          seededDraft.current = kept;
          setDraft(kept);
        }
      });
      return;
    }
    // A new draft waits for who-is-a-person, so no alias is preselected by a race.
    if (!trackerParam && (roster.loading || facts.isPending)) return;
    // ...and for the server's name-shape check on the aliases (a CEO's name saved as an alias).
    if (!trackerParam && !setup && !setupError) return;
    const personShapedAliases = setup
      ? ((setup as SetupFacts & { alias_person_names?: string[] })
          .alias_person_names ?? [])
      : null;
    const tz = browserTimezone();
    if (tracker.data) {
      const fallback = newDraft({
        brandName: brandRow.name,
        aliases,
        siteId: null,
        timezone: tz,
        people,
      });
      const seeded = draftFromTracker(tracker.data, fallback.keywords, tz);
      seededDraft.current = seeded;
      setDraft(seeded);
      return;
    }
    const siteId =
      siteRows.find((s) => s.id === siteParam)?.id ?? siteRows[0]?.id ?? null;
    const seeded = newDraft({
      brandName: brandRow.name,
      aliases,
      siteId,
      timezone: tz,
      people,
      personShapedAliases,
    });
    seededDraft.current = seeded;
    setDraft(seeded);
    // `people` is rebuilt every render from the two reads gated above.
  }, [
    draft,
    brandRow,
    sites.isPending,
    siteRows,
    siteParam,
    trackerParam,
    tracker.isPending,
    tracker.data,
    aliases,
    roster.loading,
    facts.isPending,
    setup,
    setupError,
    keptStatus,
    applyKept,
  ]);

  // A saved schedule preselects its choice once — whichever of the draft and
  // the schedule read arrives last applies it.
  const scheduleApplied = useRef(false);
  useEffect(() => {
    if (scheduleApplied.current || !draft || !schedule) return;
    scheduleApplied.current = true;
    // An inactive saved schedule reads back as "off" — preselect "No schedule".
    if (!schedule.preset || schedule.preset === "custom") return;
    setScheduleTouched(true);
    setDraft({
      ...draft,
      schedule: schedule.preset,
      timezone: schedule.timezone ?? draft.timezone,
    });
  }, [draft, schedule]);

  // A saved brief is read back into its four sections once.
  const briefLoaded = useRef(false);
  useEffect(() => {
    if (briefLoaded.current || !draft || !brief.data) return;
    briefLoaded.current = true;
    setDraft({ ...draft, brief: parseBriefMarkdown(brief.data.content ?? "") });
  }, [brief.data, draft]);

  if (brand.isError)
    return (
      <QueryError error={brand.error} onRetry={() => void brand.refetch()} />
    );
  if (tracker.isError)
    return (
      <QueryError
        error={tracker.error}
        onRetry={() => void tracker.refetch()}
      />
    );
  if (!draft || !brandRow)
    return <LoadingSurface label="Loading the monitor…" />;

  const update = (patch: Partial<MonitorDraft>) =>
    setDraft({ ...draft, ...patch });
  const refs = new Map((proposal?.refs ?? []).map((r) => [r.ref, r]));
  const counts = (setup?.counts ?? {}) as Record<string, [number, number]>;
  const catalog = (setup?.feed_catalog ?? []) as Array<Record<string, unknown>>;
  const spokespeople = (facts.data ?? []).filter(isSpokesperson);
  const proofs = (facts.data ?? []).filter(isProof);
  const descriptionFact = (facts.data ?? []).find(
    (f) => f.kind === "description",
  );
  const description =
    brandRow.description ||
    (descriptionFact ? factText(descriptionFact) : "") ||
    "";
  const presets = scheduleOptions(setup?.schedule_presets);
  const xLocations = (setup?.x_trends_locations ?? []).flatMap((loc) => {
    const woeid = Number(loc.woeid);
    return Number.isFinite(woeid)
      ? [{ woeid, label: String(loc.label ?? woeid) }]
      : [];
  });
  const cost = setup?.cost as
    (NonNullable<SetupFacts["cost"]> & SetupCostEstimate) | undefined;
  // One run's cost: the measured average, or with no runs yet the org's
  // `news.setup.estimated_run_usd` setting (served since aidream e14812d1e4).
  const estimatedRunUsd = cost?.estimated_run_usd ?? cost?.average_run_usd;
  const projections = cost
    ? projectSchedules(presets, estimatedRunUsd, cost.monthly_ceiling_usd)
    : [];
  // What starts preselected, and what is marked recommended, fits the
  // organization's monthly ceiling (the knob's choice when it fits).
  const startingSchedule = (opportunity: boolean) =>
    fittingSchedule(
      defaultSchedule(opportunity, setup?.schedule_default),
      presets,
      projections,
    );
  const recommendedId = fittingSchedule(
    presets.find((p) => p.recommended)?.id ?? "",
    presets,
    projections,
  );
  const scheduleId = draft.schedule || startingSchedule(draft.opportunity);
  const preset = presets.find((p) => p.id === scheduleId);
  const costAdvice = cost ? scheduleCostAdvice(projections, scheduleId) : null;
  const brandSeg = brandCtx.seg;

  const setLens = (lens: "coverage" | "opportunity", on: boolean) => {
    const next = { ...draft, [lens]: on };
    if (!scheduleTouched)
      next.schedule = startingSchedule(next.opportunity);
    setDraft(next);
  };

  const propose = async () => {
    setProposing("Starting…");
    try {
      const result = await proposeMonitorSetup(
        dispatch,
        brandCtx.id,
        brandCtx.organizationId,
        trackerId,
        setProposing,
      );
      setProposal(result);
      setDraft((current) =>
        current
          ? applyProposal(
              current,
              result.proposal,
              people,
              result.held_person_names ?? [],
            )
          : current,
      );
      const dropped = result.proposal.dropped_without_basis?.length ?? 0;
      toast.success(
        dropped
          ? `Suggestions added. ${dropped} were removed because they did not trace to your materials.`
          : "Suggestions added — each shows where it came from.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The proposal could not be made.",
      );
    } finally {
      setProposing(null);
    }
  };

  const save = async (andRun: boolean) => {
    setSaving(andRun ? "run" : "save");
    try {
      let briefSourceId = draft.briefSourceId;
      const markdown = briefMarkdown(draft.brief);
      if (draft.opportunity && markdown) {
        briefSourceId = await saveBriefNote({
          organizationId: brandRow.organization_id,
          noteId: briefSourceId,
          brandName: brandRow.name,
          content: markdown,
        });
      }
      const brandKey =
        brandRow.slug ||
        brandRow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const saved = await saveMonitor(
        dispatch,
        toDeclareBody(
          { ...draft, briefSourceId },
          {
            brandId: brandCtx.id,
            brandKey,
            // A new monitor names no declarer intent: a shared ref here made
            // every new opportunity monitor the same row (defect B).
            declaredRef:
              (tracker.data?.declared_ref as
                Record<string, unknown> | undefined) ?? {},
            xTrendsWoeids: xLocations.map((loc) => loc.woeid),
            savedSiteId: tracker.data?.site_id ?? null,
            trackerId,
          },
        ),
        brandRow.organization_id,
      );
      const blanked = blankedFieldsSentence(saved);
      if (blanked) toast.warning(blanked);
      keptDraft.clear();
      const draftSentence = opportunityDraftSentence(saved);
      if (draftSentence) toast.info(draftSentence);
      const savedDraft = { ...draft, briefSourceId };
      seededDraft.current = savedDraft;
      setDraft(savedDraft);
      setTrackerId(saved.id);
      void invalidate();
      if (saved.id !== trackerParam) {
        onAdopt(saved.id);
        const params = new URLSearchParams(searchParams.toString());
        params.set("tracker", saved.id);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
      // The schedule is the customer's own trigger, saved through the schedule
      // route (never a client write). "No schedule" on a monitor that never had
      // one saves nothing.
      if (scheduleId && (scheduleId !== "off" || schedule?.has_schedule)) {
        const savedSchedule = await saveMonitorSchedule(
          dispatch,
          saved.id,
          brandRow.organization_id,
          scheduleId as Parameters<typeof saveMonitorSchedule>[3],
          draft.timezone,
        );
        setSchedule(savedSchedule);
      }
      if (deliveryCommit.current) await deliveryCommit.current(saved.id);
      if (!andRun) {
        toast.success("Monitor saved.");
        return;
      }
      const result = await runMonitorNow(
        dispatch,
        saved.id,
        brandRow.organization_id,
      );
      setRun(result);
      setPolling(true);
      setRunKey((k) => k + 1);
      void invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "The monitor could not be saved.",
      );
    } finally {
      setSaving(null);
    }
  };

  const addFact = async (which: "spokesperson" | "proof") => {
    setFactError(null);
    try {
      if (which === "spokesperson") {
        await addSpokesperson({
          organizationId: brandRow.organization_id,
          brandId: brandCtx.id,
          name: newSpokesperson.name,
          title: newSpokesperson.title,
        });
        setNewSpokesperson({ name: "", title: "" });
      } else {
        await addProof({
          organizationId: brandRow.organization_id,
          brandId: brandCtx.id,
          summary: newProof.summary,
          url: newProof.url,
        });
        setNewProof({ summary: "", url: "" });
      }
      await facts.refetch();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setFactError(
        /permission|policy|row-level/i.test(message)
          ? "You can't add facts to this brand. An owner or admin of its organization can add them."
          : message,
      );
    }
  };

  const topicWords = beatsOutsideWordRange(draft.topics, counts.topic_words);
  const savedMonitor = tracker.data;
  const runStillGoing = Boolean(
    run &&
    (!savedMonitor?.last_run_at ||
      new Date(savedMonitor.last_run_at).getTime() <
        new Date(run.startedAt).getTime()),
  );
  const runSummary = (savedMonitor?.last_run_summary ?? null) as Record<
    string,
    unknown
  > | null;
  const runHeadline =
    runSummary && typeof runSummary.headline === "string"
      ? runSummary.headline
      : null;

  return (
    // The actions sit OUTSIDE the scroll area: the shell pads scroll areas at
    // their end (inline padding-bottom), which drags a sticky footer up into
    // the middle of the page.
    <div className="flex h-full flex-col bg-textured">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 pt-[calc(var(--shell-header-h)+0.75rem)]">
          {keptDraft.didRestore ? (
            <WizardDraftRestored
              what="your unsaved monitor setup"
              onStartFresh={() => {
                keptDraft.discard();
                seededDraft.current = null;
                lastKept.current = null;
                setDraft(null);
              }}
              onDismiss={keptDraft.acknowledge}
            />
          ) : null}
          <header className="flex flex-wrap items-start justify-between gap-2 px-0.5">
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground">
                {trackerId ? `Edit ${draft.name}` : "Set up news monitoring"}
              </h1>
              <p className="max-w-2xl text-xs text-muted-foreground">
                Watch who writes about {brandRow.name} and the news you can
                join. Start from what we already know — every suggestion shows
                where it came from.
              </p>
            </div>
            <Button
              icon={proposing ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Wand2 />
              )}
              variant="primary"
              onClick={() => void propose()}
              disabled={Boolean(proposing)}
            >
              {proposing ? "Suggesting…" : "Suggest from what we know"}
            </Button>
          </header>

          {proposing ? (
            <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
              {proposing}
            </p>
          ) : null}

          {proposal ? (
            <div
              className="rounded-md border border-border bg-card px-3 py-2 text-xs"
              data-surface-value="setup_proposal_summary"
            >
              <p className="text-foreground">
                Read {proposal.inputs.facts ?? 0} confirmed facts,{" "}
                {proposal.inputs.site_pages ?? 0} pages of your site and{" "}
                {proposal.inputs.recent_coverage ?? 0} recent stories naming
                you.
              </p>
              {proposal.proposal.missing?.length ? (
                <div className="mt-1">
                  <p data-error-box className="font-medium text-foreground">
                    What we could not find:
                  <ErrorAlchemyMenu /></p>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {proposal.proposal.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {proposal.proposal.dropped_without_basis?.length ? (
                <div className="mt-1">
                  <p className="font-medium text-warning">
                    Removed because they did not trace to your materials:
                  </p>
                  <ul className="ml-4 list-disc text-muted-foreground">
                    {proposal.proposal.dropped_without_basis.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          {setupError ? (
            <QueryError
              error={setupError}
              onRetry={() => setSetupAttempt((n) => n + 1)}
            />
          ) : null}

          <Section step={1} title="What to watch">
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={draft.coverage}
                onCheckedChange={(v) => setLens("coverage", v === true)}
                aria-label="Coverage: who writes about us"
              />
              <span>
                <span className="font-medium">
                  Coverage: who writes about us
                </span>
                <span className="block text-xs text-muted-foreground">
                  Articles that name your company or the competitors you list.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={draft.opportunity}
                onCheckedChange={(v) => setLens("opportunity", v === true)}
                aria-label="Opportunities: news we can join"
              />
              <span>
                <span className="font-medium">
                  Opportunities: news we can join
                </span>
                <span className="block text-xs text-muted-foreground">
                  Stories in your beats where you have something real to add.
                </span>
              </span>
            </label>
            {draft.coverage ? (
              siteRows.length ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">Website:</span>
                  <Select
                    value={draft.siteId ?? undefined}
                    onValueChange={(v) => update({ siteId: v })}
                  >
                    <SelectTrigger className="w-72">
                      <SelectValue placeholder="Choose the website" />
                    </SelectTrigger>
                    <SelectContent>
                      {siteRows.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.domain}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-xs text-warning">
                  Coverage watches for articles about a website&apos;s brand,
                  and this brand has no website yet.{" "}
                  <Link
                    className="text-primary"
                    href={marketingRoutes.brandWebsites(brandSeg)}
                  >
                    Add a website
                  </Link>{" "}
                  or keep only opportunities.
                </p>
              )
            ) : null}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Name</span>
              <Input
                value={draft.name}
                aria-label="Monitor name"
                onChange={(e) => update({ name: e.target.value })}
                className="max-w-md"
              />
            </div>
          </Section>

          <Section
            step={2}
            title="Your company"
            lede="From the brand. Nothing here is typed twice."
          >
            <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd className="text-foreground">{brandRow.name}</dd>
              <dt className="text-muted-foreground">Website</dt>
              <dd className="text-foreground">
                {brandRow.website_url || "Not on the brand"}
              </dd>
              <dt className="text-muted-foreground">Description</dt>
              <dd className="text-foreground">
                {description || "Not on the brand"}
              </dd>
            </dl>
            <Link
              href={marketingRoutes.brandIdentity(brandSeg)}
              className="text-xs font-medium text-primary"
            >
              Edit in brand
            </Link>
          </Section>

          <PersonOffers
            offers={draft.personOffers}
            rosterError={roster.error}
            onAccept={(offer) => setDraft(acceptPersonOffer(draft, offer))}
            onDismiss={(offer) => setDraft(dismissPersonOffer(draft, offer))}
          />

          {draft.coverage ? (
            <Section
              step={3}
              title="Coverage keywords"
              lede="The names we search for. Each says which company it means, so a same-name company is not counted as you."
            >
              {draft.keywords.map((k, index) => (
                <div
                  key={`kw-${index}`}
                  className="rounded border border-border p-2"
                  data-keyword={k.keyword}
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={k.keyword}
                      aria-label={`Keyword ${index + 1}`}
                      onChange={(e) => {
                        const next = [...draft.keywords];
                        next[index] = {
                          ...k,
                          keyword: e.target.value,
                          basis: USER_BASIS,
                        };
                        update({ keywords: next });
                      }}
                    />
                    <BasisChip basis={k.basis} refs={refs} />
                    <Button
                      icon={<X />}
                      variant="quiet"
                      className="shrink-0"
                      aria-label={`Remove ${k.keyword}`}
                      onClick={() =>
                        update({
                          keywords: draft.keywords.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    />
                  </div>
                  <Input
                    value={k.means}
                    placeholder="Means: which company this is, e.g. the California e-waste recycler"
                    aria-label={`What ${k.keyword} means`}
                    onChange={(e) => {
                      const next = [...draft.keywords];
                      next[index] = { ...k, means: e.target.value };
                      update({ keywords: next });
                    }}
                    className="mt-1"
                  />
                  {!k.means.trim() ? (
                    <p className="mt-0.5 text-xs text-warning">
                      Wrong-company matches will get through.
                    </p>
                  ) : null}
                  <Input
                    value={k.excludeHints.join(", ")}
                    placeholder="Ignore words, comma separated (optional)"
                    aria-label={`Ignore words for ${k.keyword}`}
                    onChange={(e) => {
                      const next = [...draft.keywords];
                      next[index] = {
                        ...k,
                        excludeHints: splitWords(e.target.value),
                      };
                      update({ keywords: next });
                    }}
                    className="mt-1"
                  />
                </div>
              ))}
              <Button
                icon={<Plus />}
                variant="outline"
                className="self-start"
                onClick={() =>
                  update({
                    keywords: [
                      ...draft.keywords,
                      {
                        keyword: "",
                        means: "",
                        excludeHints: [],
                        basis: USER_BASIS,
                      },
                    ],
                  })
                }
              > Add a keyword
              </Button>
            </Section>
          ) : null}

          <Section
            step={draft.coverage ? 4 : 3}
            title="What to watch in the news"
            lede="Durable subjects, the companies you are compared with, and the exact phrases to search. Each shows where it came from."
          >
            <div data-list="Competitors">
              <p className="text-xs font-medium text-foreground">
                Competitors{" "}
                <span className="text-muted-foreground">
                  ({draft.competitors.length})
                </span>
              </p>
              {draft.competitors.map((c, index) => (
                <div
                  key={`c-${index}`}
                  className="mt-1 rounded border border-border p-2"
                >
                  <div className="flex items-center gap-2">
                    <Input
                      value={c.name}
                      aria-label={`Competitor ${index + 1}`}
                      onChange={(e) => {
                        const next = [...draft.competitors];
                        next[index] = {
                          ...c,
                          name: e.target.value,
                          basis: USER_BASIS,
                        };
                        update({ competitors: next });
                      }}
                    />
                    <BasisChip basis={c.basis} refs={refs} />
                    <Button
                      icon={<X />}
                      variant="quiet"
                      className="shrink-0"
                      aria-label={`Remove ${c.name}`}
                      onClick={() =>
                        update({
                          competitors: draft.competitors.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    />
                  </div>
                  {draft.coverage ? (
                    <>
                      <Input
                        value={c.means}
                        placeholder="Means: which company this is"
                        aria-label={`What ${c.name} means`}
                        onChange={(e) => {
                          const next = [...draft.competitors];
                          next[index] = { ...c, means: e.target.value };
                          update({ competitors: next });
                        }}
                        className="mt-1"
                      />
                      {!c.means.trim() ? (
                        <p className="mt-0.5 text-xs text-warning">
                          Wrong-company matches will get through.
                        </p>
                      ) : null}
                    </>
                  ) : null}
                </div>
              ))}
              <Button
                icon={<Plus />}
                variant="outline"
                className="mt-1"
                onClick={() =>
                  update({
                    competitors: [
                      ...draft.competitors,
                      {
                        name: "",
                        means: "",
                        excludeHints: [],
                        basis: USER_BASIS,
                      },
                    ],
                  })
                }
              > Add a competitor
              </Button>
              <Warning
                text={countWarning(
                  "competitors",
                  draft.competitors.length,
                  counts.competitors,
                )}
              />
            </div>

            {draft.opportunity ? (
              <>
                <ItemList
                  label="Beats"
                  editTarget="topics"
                  items={draft.topics}
                  onChange={(topics) => update({ topics })}
                  refs={refs}
                  placeholder="A subject you live in, 2–3 words"
                  warning={
                    countWarning("beats", draft.topics.length, counts.topics) ??
                    (topicWords.length
                      ? `Longer than ${counts.topic_words?.[1] ?? 3} words: ${topicWords.join(", ")}. Shorter beats catch subjects, not headlines.`
                      : null)
                  }
                />
                <ItemList
                  label="Search terms"
                  items={draft.searchTerms}
                  onChange={(searchTerms) => update({ searchTerms })}
                  refs={refs}
                  placeholder="An exact phrase to search"
                  warning={countWarning(
                    "search terms",
                    draft.searchTerms.length,
                    counts.search_terms,
                  )}
                />
                <ItemList
                  label="Where you can speak with authority"
                  items={draft.standing}
                  onChange={(standing) => update({ standing })}
                  refs={refs}
                  placeholder="Specific expertise, customers, data or experience"
                  warning={countWarning(
                    "standing areas",
                    draft.standing.length,
                    counts.standing,
                  )}
                />
                <div data-list="Feeds">
                  <p className="text-xs font-medium text-foreground">
                    Feeds{" "}
                    <span className="text-muted-foreground">
                      ({draft.feeds.length})
                    </span>
                  </p>
                  <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                    {catalog.map((feed) => {
                      const id = String(feed.id);
                      const picked = draft.feeds.find((f) => f.feedId === id);
                      return (
                        <li key={id}>
                          <label className="flex items-start gap-2 rounded border border-border p-2 text-sm">
                            <Checkbox
                              checked={Boolean(picked)}
                              onCheckedChange={(v) =>
                                update({
                                  feeds:
                                    v === true
                                      ? [
                                          ...draft.feeds,
                                          {
                                            feedId: id,
                                            why: "",
                                            proposed: false,
                                          },
                                        ]
                                      : draft.feeds.filter(
                                          (f) => f.feedId !== id,
                                        ),
                                })
                              }
                              aria-label={String(feed.name ?? id)}
                            />
                            <span className="min-w-0">
                              <span className="font-medium">
                                {String(feed.name ?? id)}
                              </span>
                              <span className="block text-xs text-muted-foreground">
                                {picked?.why || String(feed.use_when ?? "")}
                              </span>
                              {picked?.proposed ? (
                                <span className="text-[10px] text-primary">
                                  suggested for you
                                </span>
                              ) : null}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <Warning
                    text={countWarning(
                      "feeds",
                      draft.feeds.length,
                      counts.feeds,
                    )}
                  />
                </div>
                {setup?.x_key_on_file && xLocations.length ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Switch
                      checked={draft.xTrends}
                      onCheckedChange={(v) => update({ xTrends: v })}
                    />
                    Also watch what is trending on X in{" "}
                    {xLocations.map((loc) => loc.label).join(", ")}
                  </label>
                ) : null}
              </>
            ) : null}

            <div>
              <p className="text-xs font-medium text-foreground">
                Never show stories about
              </p>
              <Input
                value={draft.exclusions.join(", ")}
                placeholder="Words to exclude, comma separated (optional)"
                onChange={(e) =>
                  update({ exclusions: splitWords(e.target.value) })
                }
                className="mt-1"
              />
            </div>
          </Section>

          {draft.opportunity ? (
            <Section
              step={draft.coverage ? 5 : 4}
              title="Who speaks, and what you can show"
              lede="Reporters need a person to quote and proof to point at."
            >
              <div>
                <p className="text-xs font-medium text-foreground">
                  Spokespeople
                </p>
                {spokespeople.length ? (
                  <ul className="ml-4 list-disc text-sm">
                    {spokespeople.map((f) => (
                      <li key={f.id}>{factText(f)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">None on file.</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Input
                    value={newSpokesperson.name}
                    placeholder="Name"
                    onChange={(e) =>
                      setNewSpokesperson({
                        ...newSpokesperson,
                        name: e.target.value,
                      })
                    }
                    className="w-48"
                  />
                  <Input
                    value={newSpokesperson.title}
                    placeholder="Title (optional)"
                    onChange={(e) =>
                      setNewSpokesperson({
                        ...newSpokesperson,
                        title: e.target.value,
                      })
                    }
                    className="w-48"
                  />
                  <Button
                    icon={<Plus />}
                    variant="outline"
                    disabled={!newSpokesperson.name.trim()}
                    onClick={() => void addFact("spokesperson")}
                  > Add spokesperson
                  </Button>
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-foreground">Proof</p>
                {proofs.length ? (
                  <ul className="ml-4 list-disc text-sm">
                    {proofs.map((f) => (
                      <li key={f.id}>{factText(f)}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">None on file.</p>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Input
                    value={newProof.summary}
                    placeholder="A result, study or number you can show"
                    onChange={(e) =>
                      setNewProof({ ...newProof, summary: e.target.value })
                    }
                    className="w-80"
                  />
                  <Input
                    value={newProof.url}
                    placeholder="Link (optional)"
                    onChange={(e) =>
                      setNewProof({ ...newProof, url: e.target.value })
                    }
                    className="w-56"
                  />
                  <Button
                    icon={<Plus />}
                    variant="outline"
                    disabled={!newProof.summary.trim()}
                    onClick={() => void addFact("proof")}
                  > Add proof
                  </Button>
                </div>
              </div>
              {factError ? (
                <p className="text-xs text-destructive">{factError}<ErrorAlchemyMenu error={factError} /></p>
              ) : null}
              {!spokespeople.length || !proofs.length ? (
                <p className="text-xs text-warning">
                  You can skip this. {NO_PROOF_SENTENCE}
                </p>
              ) : null}
            </Section>
          ) : null}

          {draft.opportunity ? (
            <Section
              step={draft.coverage ? 6 : 5}
              title="Your brief"
              lede="This is yours to edit; feedback on runs will suggest changes here. Leave a section empty and it carries no rule."
            >
              {(
                [
                  ["audience", "Audience", "Who you want to reach"],
                  ["pitch", "We pitch", "The stories you want to be part of"],
                  ["never", "We never pitch", "Stories you never want to join"],
                  [
                    "surface",
                    "How to surface",
                    "How you want stories brought to you",
                  ],
                ] as const
              ).map(([key, label, placeholder]) => (
                <div key={key}>
                  <p className="text-xs font-medium text-foreground">{label}</p>
                  <ProTextarea minHeight={64}
                    data-edit-target={key === "audience" ? "brief" : undefined}
                    value={draft.brief[key]}
                    placeholder={placeholder}
                    onChange={(e) =>
                      update({
                        brief: { ...draft.brief, [key]: e.target.value },
                      })
                    }
                    className="mt-1"
                  />
                </div>
              ))}
            </Section>
          ) : null}

          <Section
            step={
              draft.coverage && draft.opportunity
                ? 7
                : draft.opportunity
                  ? 6
                  : 5
            }
            title="Who hears about it"
          >
            <DeliveryControls
              organizationId={brandRow.organization_id}
              trackerId={trackerId}
              currentUserId={currentUserId}
              savedRecipients={savedMonitor?.alert_recipient_user_ids ?? []}
              savedSlackItemId={savedMonitor?.slack_credential_item_id ?? null}
              registerCommit={(commit) => {
                deliveryCommit.current = commit;
              }}
            />
          </Section>

          <Section
            step={
              draft.coverage && draft.opportunity
                ? 8
                : draft.opportunity
                  ? 7
                  : 6
            }
            title="How often"
          >
            {setup && !presets.length ? (
              <p className="text-xs text-warning">
                No schedule choices are set up for this organization yet (the
                monitor setup schedule setting is empty).
              </p>
            ) : null}
            <div
              className="flex flex-wrap gap-2"
              role="radiogroup"
              aria-label="How often"
            >
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={scheduleId === p.id}
                  onClick={() => {
                    setScheduleTouched(true);
                    update({ schedule: p.id });
                  }}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm",
                    scheduleId === p.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/40",
                  )}
                >
                  {p.label}
                  {p.id === recommendedId ? (
                    <span className="ml-1 text-[10px] text-primary">
                      recommended
                    </span>
                  ) : null}
                  {projections.find((x) => x.presetId === p.id)?.overCeiling ? (
                    <span className="ml-1 text-[10px] font-medium text-warning">
                      over ceiling
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-muted-foreground">Time zone</span>
              <Select
                value={draft.timezone}
                onValueChange={(v) => update({ timezone: v })}
              >
                <SelectTrigger className="w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allTimezones(draft.timezone).map((zone) => (
                    <SelectItem key={zone} value={zone}>
                      {zone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {preset && preset.runsPerMonth > 0 ? (
                <span className="text-muted-foreground">
                  {schedule?.has_schedule &&
                  schedule.is_active &&
                  schedule.jitter_minute != null
                    ? `Saved: runs at ${String(schedule.jitter_minute).padStart(2, "0")} past the hour${schedule.next_run_at ? `, next ${new Date(schedule.next_run_at).toLocaleString()}` : ""} — never on the hour, so it does not collide with every other monitor.`
                    : "The exact minute is fixed for this monitor when you save — never on the hour."}
                </span>
              ) : null}
            </div>
            <p
              className="text-xs text-muted-foreground"
              data-surface-value="setup_cost_estimate"
            >
              {cost?.average_run_usd != null
                ? `A run has cost about ${formatCostDisplay(cost.average_run_usd)} (${cost.runs_measured} runs in the last 30 days)${preset ? `, so this schedule is about ${formatCostDisplay(cost.average_run_usd * preset.runsPerMonth)} a month` : ""}.`
                : estimatedRunUsd != null
                  ? `No runs measured yet in this organization; its setting estimates about ${formatCostDisplay(estimatedRunUsd)} a run${preset ? `, so this schedule is about ${formatCostDisplay(estimatedRunUsd * preset.runsPerMonth)} a month` : ""}. The first run measures the real cost.`
                  : cost
                    ? "No runs yet in this organization, so there is no cost per run to estimate — the first run measures it."
                    : null}{" "}
              {cost
                ? `Your organization has spent ${formatCostDisplay(cost.month_to_date_usd)} of its ${formatCostDisplay(cost.monthly_ceiling_usd)} monthly news ceiling.`
                : null}
            </p>
            {costAdvice && cost ? (
              <div
                role="status"
                className="flex flex-wrap items-center gap-2 rounded-md border border-warning bg-warning/10 px-3 py-2 text-sm"
                data-surface-value="setup_cost_warning"
              >
                <AlertTriangle className="h-4 w-4 shrink-0 text-warning" aria-hidden />
                <span className="min-w-0 flex-1 font-medium text-foreground">
                  {`"${costAdvice.chosen.label}" projects about ${formatCostDisplay(costAdvice.chosen.monthlyUsd)} a month — over your organization's ${formatCostDisplay(cost.monthly_ceiling_usd)} monthly news ceiling. At the ceiling, scheduled runs pause until someone resumes them.`}{" "}
                  {costAdvice.cheaper
                    ? `"${costAdvice.cheaper.label}" fits at about ${formatCostDisplay(costAdvice.cheaper.monthlyUsd)} a month.`
                    : `No scheduled choice fits at about ${formatCostDisplay(estimatedRunUsd ?? 0)} a run; "No schedule" with Run now when you need it spends only what you run.`}{" "}
                  You can save anyway.
                </span>
                {costAdvice.cheaper ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setScheduleTouched(true);
                      update({ schedule: costAdvice.cheaper?.presetId ?? "" });
                    }}
                  >
                    Use {costAdvice.cheaper.label}
                  </Button>
                ) : null}
              </div>
            ) : null}
            {schedule?.message ? (
              <p className="text-xs text-muted-foreground">
                {schedule.message}
              </p>
            ) : null}
          </Section>

          {run ? (
            <section
              className="rounded-md border border-border bg-card p-3"
              data-surface-value="monitor_run_view"
            >
              <h2 className="text-sm font-semibold text-foreground">The run</h2>
              {runStillGoing ? (
                <p className="mt-1 text-sm text-foreground">
                  Running now — the news monitor run takes a few minutes. This
                  updates when it finishes.
                </p>
              ) : savedMonitor?.last_run_status === "failed" &&
                savedMonitor.last_error ? (
                <p className="mt-1 text-sm text-destructive">
                  {savedMonitor.last_error}
                <ErrorAlchemyMenu error={savedMonitor.last_error} /></p>
              ) : (
                <p className="mt-1 text-sm text-foreground">
                  {runHeadline ??
                    (savedMonitor?.last_run_at
                      ? `Finished ${new Date(savedMonitor.last_run_at).toLocaleString()}.`
                      : "The run finished.")}
                </p>
              )}
              {trackerId ? (
                <Link
                  href={marketingRoutes.brandMonitorRun(
                    brandCtx.seg,
                    trackerId,
                    {
                      runId: run.runId,
                    },
                  )}
                  className="mt-1 mr-3 inline-block text-xs font-medium text-primary"
                >
                  Read what it found — the report, watch list and set-aside
                  lists
                </Link>
              ) : null}
              {run.runId ? (
                <Link
                  href={`/workflows/runs/${run.runId}`}
                  className="mt-1 inline-block text-xs font-medium text-primary"
                >
                  Open the run, step by step
                </Link>
              ) : null}
              <p className="mt-2 text-xs font-medium text-foreground">
                A few real things it looked at
              </p>
              {runMentions.isPending ? (
                <p className="text-xs text-muted-foreground">Loading…</p>
              ) : runMentions.data?.length ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {runMentions.data.map((m) => (
                    <li key={m.id} className="text-xs">
                      <a
                        href={m.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary"
                      >
                        {m.title || m.url}
                      </a>{" "}
                      <span className="text-muted-foreground">
                        {m.domain}
                        {m.verdict ? ` · ${humanizeIdentifier(m.verdict) || m.verdict}` : ""}
                        {m.is_competitor ? " · about a competitor" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Nothing matched yet. Coverage reads new articles as they
                  appear; change anything above and run again.
                </p>
              )}
              {draft.siteId ? (
                <Link
                  href={marketingRoutes.site(
                    brandCtx.id,
                    draft.siteId,
                    "/backlinks?view=coverage",
                  )}
                  className="mt-2 inline-block text-xs font-medium text-primary"
                >
                  Open coverage
                </Link>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">
                Change anything? Edit above and press Run now again.
              </p>
            </section>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 border-t border-border bg-card pb-safe">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-end gap-2 p-2">
          {trackerId ? (
            <ArchiveRecordButton
              token="seo_coverage_tracker"
              id={trackerId}
              what={draft.name || "this monitor"}
              noun="news monitor"
              className="mr-auto"
              onArchived={() => {
                void invalidate();
                router.push(marketingRoutes.brandMonitoring(brandSeg));
              }}
              onRestored={() => void invalidate()}
            />
          ) : null}
          <Button
            icon={saving === "save" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Save />
            )}
            variant="outline"
            onClick={() => void save(false)}
            disabled={Boolean(saving)}
          >
            Save
          </Button>
          <Button
            icon={saving === "run" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Play />
            )}
            variant="primary"
            onClick={() => void save(true)}
            disabled={Boolean(saving)}
          >
            {saving === "run" ? "Running…" : "Save and run now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
