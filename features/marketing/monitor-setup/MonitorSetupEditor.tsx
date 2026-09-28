"use client";

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
import { ExternalLink, Loader2, Play, Plus, Save, Wand2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@ai-matrx/design-system";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarketingFrontDoorPromise } from "@/features/marketing/front-doors/MarketingDoorBoard";
import {
  LoadingSurface,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { useBrand, useBrandSites, useBusinessFacts } from "@/features/marketing/data/hooks";
import { useMarketingBrand } from "@/features/marketing/lib/brand-context";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { getComingSoon } from "@/lib/coming-soon/registry";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  getSetupFacts,
  proposeMonitorSetup,
  runMonitorNow,
  saveMonitor,
  type CoverageRunResult,
  type ProposalRef,
  type ProposalResult,
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
  applyProposal,
  basisChip,
  beatsOutsideWordRange,
  briefMarkdown,
  countWarning,
  defaultSchedule,
  draftFromTracker,
  newDraft,
  parseBriefMarkdown,
  scheduleMinute,
  scheduleOptions,
  toDeclareBody,
  USER_BASIS,
  type Basis,
  type DraftItem,
  type MonitorDraft,
} from "./model";

const SCHEDULE_PROMISE_ID = "marketing.monitoring.schedule";
const DELIVERY_PROMISE_ID = "marketing.monitoring.alerts";
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
  const supported = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] })
    .supportedValuesOf;
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
      {lede ? <p className="mt-0.5 text-xs text-muted-foreground">{lede}</p> : null}
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </section>
  );
}

function Warning({ text }: { text: string | null }) {
  if (!text) return null;
  return <p className="text-xs text-warning">{text}</p>;
}

function BasisChip({ basis, refs }: { basis: Basis; refs: Map<string, ProposalRef> }) {
  const source = refs.get(basis.ref);
  const title = source ? source.label : basis.kind === "user" ? "You typed this" : basis.ref;
  const chip = (
    <span
      title={title}
      className={cn(
        "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-[10px]",
        basis.kind === "user"
          ? "border-border text-muted-foreground"
          : "border-primary/30 bg-primary/5 text-primary",
      )}
    >
      {basisChip(basis)}
      {source?.url ? <ExternalLink className="h-2.5 w-2.5" /> : null}
    </span>
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
}: {
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
          <li key={`${item.text}-${index}`} className="flex items-center gap-2">
            <Input
              value={item.text}
              aria-label={`${label} ${index + 1}`}
              onChange={(e) => {
                const next = [...items];
                next[index] = { text: e.target.value, basis: USER_BASIS };
                onChange(next);
              }}
              className="h-8 text-sm"
            />
            <BasisChip basis={item.basis} refs={refs} />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              aria-label={`Remove ${item.text}`}
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-1 flex items-center gap-2">
        <Input
          value={adding}
          placeholder={placeholder}
          onChange={(e) => setAdding(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-8 text-sm"
        />
        <Button variant="outline" size="sm" className="h-8" onClick={add} disabled={!adding.trim()}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
      <Warning text={warning ?? null} />
    </div>
  );
}

// ── the editor ────────────────────────────────────────────────────────────

export function MonitorSetupEditor() {
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
  const tracker = useTracker(trackerParam);
  const brief = useBriefNote(tracker.data?.brief_source_id ?? null);

  const [setup, setSetup] = useState<SetupFacts | null>(null);
  const [setupError, setSetupError] = useState<unknown>(null);
  const [draft, setDraft] = useState<MonitorDraft | null>(null);
  const [scheduleTouched, setScheduleTouched] = useState(false);
  const [proposal, setProposal] = useState<ProposalResult | null>(null);
  const [proposing, setProposing] = useState<string | null>(null);
  const [saving, setSaving] = useState<"save" | "run" | null>(null);
  const [run, setRun] = useState<CoverageRunResult | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [newSpokesperson, setNewSpokesperson] = useState({ name: "", title: "" });
  const [newProof, setNewProof] = useState({ summary: "", url: "" });
  const [factError, setFactError] = useState<string | null>(null);
  const runMentions = useRunMentions(trackerId, runKey);

  useEffect(() => {
    let live = true;
    getSetupFacts(dispatch, brandCtx.id, brandCtx.organizationId)
      .then((next) => live && setSetup(next))
      .catch((error: unknown) => live && setSetupError(error));
    return () => {
      live = false;
    };
  }, [dispatch, brandCtx.id, brandCtx.organizationId]);

  const brandRow = brand.data;
  const aliases = (() => {
    const profile = (brandRow?.profile ?? {}) as Record<string, unknown>;
    const raw = profile.brand_aliases;
    return Array.isArray(raw) ? raw.map((a) => String(a)) : [];
  })();
  const siteRows = sites.data ?? [];

  // The draft is built once, from the saved monitor or from the brand.
  useEffect(() => {
    if (draft || !brandRow || sites.isPending) return;
    if (trackerParam && tracker.isPending) return;
    const tz = browserTimezone();
    if (tracker.data) {
      const fallback = newDraft({ brandName: brandRow.name, aliases, siteId: null, timezone: tz });
      setDraft(draftFromTracker(tracker.data, fallback.keywords, tz));
      return;
    }
    const siteId =
      siteRows.find((s) => s.id === siteParam)?.id ?? siteRows[0]?.id ?? null;
    setDraft(newDraft({ brandName: brandRow.name, aliases, siteId, timezone: tz }));
  }, [draft, brandRow, sites.isPending, siteRows, siteParam, trackerParam, tracker.isPending, tracker.data, aliases]);

  // A saved brief is read back into its four sections once.
  const briefLoaded = useRef(false);
  useEffect(() => {
    if (briefLoaded.current || !draft || !brief.data) return;
    briefLoaded.current = true;
    setDraft({ ...draft, brief: parseBriefMarkdown(brief.data.content ?? "") });
  }, [brief.data, draft]);

  if (brand.isError) return <QueryError error={brand.error} onRetry={() => void brand.refetch()} />;
  if (tracker.isError) return <QueryError error={tracker.error} onRetry={() => void tracker.refetch()} />;
  if (!draft || !brandRow) return <LoadingSurface label="Loading the monitor…" />;

  const update = (patch: Partial<MonitorDraft>) => setDraft({ ...draft, ...patch });
  const refs = new Map((proposal?.refs ?? []).map((r) => [r.ref, r]));
  const counts = (setup?.counts ?? {}) as Record<string, [number, number]>;
  const catalog = (setup?.feed_catalog ?? []) as Array<Record<string, unknown>>;
  const spokespeople = (facts.data ?? []).filter(isSpokesperson);
  const proofs = (facts.data ?? []).filter(isProof);
  const descriptionFact = (facts.data ?? []).find((f) => f.kind === "description");
  const description =
    brandRow.description ||
    (descriptionFact ? factText(descriptionFact) : "") ||
    "";
  const minute = trackerId ? scheduleMinute(trackerId) : null;
  const presets = scheduleOptions(setup?.schedule_presets);
  const scheduleId = draft.schedule || defaultSchedule(draft.opportunity, setup?.schedule_default);
  const preset = presets.find((p) => p.id === scheduleId);
  const xLocations = (setup?.x_trends_locations ?? []).flatMap((loc) => {
    const woeid = Number(loc.woeid);
    return Number.isFinite(woeid) ? [{ woeid, label: String(loc.label ?? woeid) }] : [];
  });
  const cost = setup?.cost;
  const schedulePromise = getComingSoon(SCHEDULE_PROMISE_ID);
  const deliveryPromise = getComingSoon(DELIVERY_PROMISE_ID);
  const brandSeg = brandCtx.seg;

  const setLens = (lens: "coverage" | "opportunity", on: boolean) => {
    const next = { ...draft, [lens]: on };
    if (!scheduleTouched) next.schedule = defaultSchedule(next.opportunity, setup?.schedule_default);
    setDraft(next);
  };

  const propose = async () => {
    setProposing("Starting…");
    try {
      const result = await proposeMonitorSetup(dispatch, brandCtx.id, brandCtx.organizationId, trackerId, setProposing);
      setProposal(result);
      setDraft((current) => (current ? applyProposal(current, result.proposal) : current));
      const dropped = result.proposal.dropped_without_basis?.length ?? 0;
      toast.success(
        dropped
          ? `Suggestions added. ${dropped} were removed because they did not trace to your materials.`
          : "Suggestions added — each shows where it came from.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The proposal could not be made.");
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
      const brandKey = brandRow.slug || brandRow.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const saved = await saveMonitor(
        dispatch,
        toDeclareBody(
          { ...draft, briefSourceId },
          {
            brandId: brandCtx.id,
            brandKey,
            declaredRef:
              (tracker.data?.declared_ref as Record<string, unknown> | undefined) ??
              (draft.coverage ? {} : { surface: "tracker_editor" }),
            xTrendsWoeids: xLocations.map((loc) => loc.woeid),
          },
        ),
        brandRow.organization_id,
      );
      setDraft({ ...draft, briefSourceId });
      setTrackerId(saved.id);
      void invalidate();
      if (saved.id !== trackerParam) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tracker", saved.id);
        router.replace(`?${params.toString()}`, { scroll: false });
      }
      if (!andRun) {
        toast.success("Monitor saved.");
        return;
      }
      const result = await runMonitorNow(dispatch, saved.id, brandRow.organization_id);
      setRun(result);
      setRunKey((k) => k + 1);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The monitor could not be saved.");
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
  const runTracker = run?.trackers[0];

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto bg-textured">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 p-3 pb-24 pt-[calc(var(--shell-header-h)+0.75rem)]">
        <header className="flex flex-wrap items-start justify-between gap-2 px-0.5">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-foreground">
              {trackerId ? `Edit ${draft.name}` : "Set up news monitoring"}
            </h1>
            <p className="max-w-2xl text-xs text-muted-foreground">
              Watch who writes about {brandRow.name} and the news you can join. Start from
              what we already know — every suggestion shows where it came from.
            </p>
          </div>
          <Button size="sm" onClick={() => void propose()} disabled={Boolean(proposing)}>
            {proposing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
            {proposing ? "Suggesting…" : "Suggest from what we know"}
          </Button>
        </header>

        {proposing ? (
          <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {proposing}
          </p>
        ) : null}

        {proposal ? (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-xs" data-surface-value="setup_proposal_summary">
            <p className="text-foreground">
              Read {proposal.inputs.facts ?? 0} confirmed facts, {proposal.inputs.site_pages ?? 0} pages of your
              site and {proposal.inputs.recent_coverage ?? 0} recent stories naming you.
            </p>
            {proposal.proposal.missing?.length ? (
              <div className="mt-1">
                <p className="font-medium text-foreground">What we could not find:</p>
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

        {setupError ? <QueryError error={setupError} /> : null}

        <Section step={1} title="What to watch">
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={draft.coverage}
              onCheckedChange={(v) => setLens("coverage", v === true)}
              aria-label="Coverage: who writes about us"
            />
            <span>
              <span className="font-medium">Coverage: who writes about us</span>
              <span className="block text-xs text-muted-foreground">Articles that name your company or the competitors you list.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={draft.opportunity}
              onCheckedChange={(v) => setLens("opportunity", v === true)}
              aria-label="Opportunities: news we can join"
            />
            <span>
              <span className="font-medium">Opportunities: news we can join</span>
              <span className="block text-xs text-muted-foreground">Stories in your beats where you have something real to add.</span>
            </span>
          </label>
          {draft.coverage ? (
            siteRows.length ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Website:</span>
                <Select value={draft.siteId ?? undefined} onValueChange={(v) => update({ siteId: v })}>
                  <SelectTrigger className="h-8 w-72 text-sm">
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
                Coverage watches for articles about a website&apos;s brand, and this brand has no website yet.{" "}
                <Link className="text-primary" href={marketingRoutes.brandWebsites(brandSeg)}>
                  Add a website
                </Link>{" "}
                or keep only opportunities.
              </p>
            )
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Name</span>
            <Input value={draft.name} onChange={(e) => update({ name: e.target.value })} className="h-8 max-w-md text-sm" />
          </div>
        </Section>

        <Section step={2} title="Your company" lede="From the brand. Nothing here is typed twice.">
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="text-foreground">{brandRow.name}</dd>
            <dt className="text-muted-foreground">Website</dt>
            <dd className="text-foreground">{brandRow.website_url || "Not on the brand"}</dd>
            <dt className="text-muted-foreground">Description</dt>
            <dd className="text-foreground">{description || "Not on the brand"}</dd>
          </dl>
          <Link href={marketingRoutes.brandIdentity(brandSeg)} className="text-xs font-medium text-primary">
            Edit in brand
          </Link>
        </Section>

        {draft.coverage ? (
          <Section
            step={3}
            title="Coverage keywords"
            lede="The names we search for. Each says which company it means, so a same-name company is not counted as you."
          >
            {draft.keywords.map((k, index) => (
              <div key={`kw-${index}`} className="rounded border border-border p-2" data-keyword={k.keyword}>
                <div className="flex items-center gap-2">
                  <Input
                    value={k.keyword}
                    aria-label={`Keyword ${index + 1}`}
                    onChange={(e) => {
                      const next = [...draft.keywords];
                      next[index] = { ...k, keyword: e.target.value, basis: USER_BASIS };
                      update({ keywords: next });
                    }}
                    className="h-8 text-sm font-medium"
                  />
                  <BasisChip basis={k.basis} refs={refs} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={`Remove ${k.keyword}`}
                    onClick={() => update({ keywords: draft.keywords.filter((_, i) => i !== index) })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
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
                  className="mt-1 h-8 text-sm"
                />
                {!k.means.trim() ? (
                  <p className="mt-0.5 text-xs text-warning">Wrong-company matches will get through.</p>
                ) : null}
                <Input
                  value={k.excludeHints.join(", ")}
                  placeholder="Ignore words, comma separated (optional)"
                  aria-label={`Ignore words for ${k.keyword}`}
                  onChange={(e) => {
                    const next = [...draft.keywords];
                    next[index] = { ...k, excludeHints: splitWords(e.target.value) };
                    update({ keywords: next });
                  }}
                  className="mt-1 h-8 text-sm"
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="h-8 self-start"
              onClick={() =>
                update({
                  keywords: [...draft.keywords, { keyword: "", means: "", excludeHints: [], basis: USER_BASIS }],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add a keyword
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
              Competitors <span className="text-muted-foreground">({draft.competitors.length})</span>
            </p>
            {draft.competitors.map((c, index) => (
              <div key={`c-${index}`} className="mt-1 rounded border border-border p-2">
                <div className="flex items-center gap-2">
                  <Input
                    value={c.name}
                    aria-label={`Competitor ${index + 1}`}
                    onChange={(e) => {
                      const next = [...draft.competitors];
                      next[index] = { ...c, name: e.target.value, basis: USER_BASIS };
                      update({ competitors: next });
                    }}
                    className="h-8 text-sm"
                  />
                  <BasisChip basis={c.basis} refs={refs} />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label={`Remove ${c.name}`}
                    onClick={() => update({ competitors: draft.competitors.filter((_, i) => i !== index) })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
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
                      className="mt-1 h-8 text-sm"
                    />
                    {!c.means.trim() ? (
                      <p className="mt-0.5 text-xs text-warning">Wrong-company matches will get through.</p>
                    ) : null}
                  </>
                ) : null}
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="mt-1 h-8"
              onClick={() =>
                update({
                  competitors: [...draft.competitors, { name: "", means: "", excludeHints: [], basis: USER_BASIS }],
                })
              }
            >
              <Plus className="h-3.5 w-3.5" /> Add a competitor
            </Button>
            <Warning text={countWarning("competitors", draft.competitors.length, counts.competitors)} />
          </div>

          {draft.opportunity ? (
            <>
              <ItemList
                label="Beats"
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
                warning={countWarning("search terms", draft.searchTerms.length, counts.search_terms)}
              />
              <ItemList
                label="Where you can speak with authority"
                items={draft.standing}
                onChange={(standing) => update({ standing })}
                refs={refs}
                placeholder="Specific expertise, customers, data or experience"
                warning={countWarning("standing areas", draft.standing.length, counts.standing)}
              />
              <div data-list="Feeds">
                <p className="text-xs font-medium text-foreground">
                  Feeds <span className="text-muted-foreground">({draft.feeds.length})</span>
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
                                    ? [...draft.feeds, { feedId: id, why: "", proposed: false }]
                                    : draft.feeds.filter((f) => f.feedId !== id),
                              })
                            }
                            aria-label={String(feed.name ?? id)}
                          />
                          <span className="min-w-0">
                            <span className="font-medium">{String(feed.name ?? id)}</span>
                            <span className="block text-xs text-muted-foreground">
                              {picked?.why || String(feed.use_when ?? "")}
                            </span>
                            {picked?.proposed ? (
                              <span className="text-[10px] text-primary">suggested for you</span>
                            ) : null}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <Warning text={countWarning("feeds", draft.feeds.length, counts.feeds)} />
              </div>
              {setup?.x_key_on_file && xLocations.length ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={draft.xTrends} onCheckedChange={(v) => update({ xTrends: v })} />
                  Also watch what is trending on X in {xLocations.map((loc) => loc.label).join(", ")}
                </label>
              ) : null}
            </>
          ) : null}

          <div>
            <p className="text-xs font-medium text-foreground">Never show stories about</p>
            <Input
              value={draft.exclusions.join(", ")}
              placeholder="Words to exclude, comma separated (optional)"
              onChange={(e) => update({ exclusions: splitWords(e.target.value) })}
              className="mt-1 h-8 text-sm"
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
              <p className="text-xs font-medium text-foreground">Spokespeople</p>
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
                  onChange={(e) => setNewSpokesperson({ ...newSpokesperson, name: e.target.value })}
                  className="h-8 w-48 text-sm"
                />
                <Input
                  value={newSpokesperson.title}
                  placeholder="Title (optional)"
                  onChange={(e) => setNewSpokesperson({ ...newSpokesperson, title: e.target.value })}
                  className="h-8 w-48 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!newSpokesperson.name.trim()}
                  onClick={() => void addFact("spokesperson")}
                >
                  <Plus className="h-3.5 w-3.5" /> Add spokesperson
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
                  onChange={(e) => setNewProof({ ...newProof, summary: e.target.value })}
                  className="h-8 w-80 text-sm"
                />
                <Input
                  value={newProof.url}
                  placeholder="Link (optional)"
                  onChange={(e) => setNewProof({ ...newProof, url: e.target.value })}
                  className="h-8 w-56 text-sm"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8"
                  disabled={!newProof.summary.trim()}
                  onClick={() => void addFact("proof")}
                >
                  <Plus className="h-3.5 w-3.5" /> Add proof
                </Button>
              </div>
            </div>
            {factError ? <p className="text-xs text-destructive">{factError}</p> : null}
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
                ["surface", "How to surface", "How you want stories brought to you"],
              ] as const
            ).map(([key, label, placeholder]) => (
              <div key={key}>
                <p className="text-xs font-medium text-foreground">{label}</p>
                <Textarea
                  value={draft.brief[key]}
                  placeholder={placeholder}
                  onChange={(e) => update({ brief: { ...draft.brief, [key]: e.target.value } })}
                  className="mt-1 min-h-16 text-sm"
                />
              </div>
            ))}
          </Section>
        ) : null}

        <Section step={draft.coverage && draft.opportunity ? 7 : draft.opportunity ? 6 : 5} title="Who hears about it">
          <p className="text-sm text-foreground">
            You — the person who saves this monitor — are told, on your own notification preferences.
          </p>
          {deliveryPromise ? (
            <MarketingFrontDoorPromise label={deliveryPromise.label} promise={deliveryPromise.promise} />
          ) : null}
        </Section>

        <Section step={draft.coverage && draft.opportunity ? 8 : draft.opportunity ? 7 : 6} title="How often">
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="How often">
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
                {p.recommended ? <span className="ml-1 text-[10px] text-primary">recommended</span> : null}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-muted-foreground">Time zone</span>
            <Select value={draft.timezone} onValueChange={(v) => update({ timezone: v })}>
              <SelectTrigger className="h-8 w-64 text-sm">
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
                {minute !== null
                  ? `Runs at ${String(minute).padStart(2, "0")} minutes past the hour, so it never collides with every other monitor on the hour.`
                  : "The exact minute is fixed when you save (never on the hour)."}
              </span>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground" data-surface-value="setup_cost_estimate">
            {cost?.average_run_usd != null
              ? `A run has cost about ${formatCostDisplay(cost.average_run_usd)} (${cost.runs_measured} runs in the last 30 days), so this schedule is about ${formatCostDisplay(cost.average_run_usd * (preset?.runsPerMonth ?? 0))} a month.`
              : "No runs yet in this organization, so there is no cost per run to estimate — the first run measures it."}{" "}
            {cost
              ? `Your organization has spent ${formatCostDisplay(cost.month_to_date_usd)} of its ${formatCostDisplay(cost.monthly_ceiling_usd)} monthly news ceiling.`
              : null}
          </p>
          {schedulePromise ? (
            <MarketingFrontDoorPromise label={schedulePromise.label} promise={schedulePromise.promise} />
          ) : null}
        </Section>

        {run ? (
          <section className="rounded-md border border-border bg-card p-3" data-surface-value="monitor_run_view">
            <h2 className="text-sm font-semibold text-foreground">The run</h2>
            {runTracker?.status === "failed" ? (
              <p className="mt-1 text-sm text-destructive">{runTracker.error}</p>
            ) : (
              <p className="mt-1 text-sm text-foreground">
                Searched {runTracker?.queries ?? 0} queries, saw {runTracker?.articles_seen ?? 0} articles, kept{" "}
                {runTracker?.mentions_created ?? 0} new mentions, read {runTracker?.captured ?? 0} pages and scored{" "}
                {runTracker?.analyzed ?? 0}.
              </p>
            )}
            <p className="mt-2 text-xs font-medium text-foreground">A few real things it looked at</p>
            {runMentions.isPending ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : runMentions.data?.length ? (
              <ul className="mt-1 flex flex-col gap-1">
                {runMentions.data.map((m) => (
                  <li key={m.id} className="text-xs">
                    <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-primary">
                      {m.title || m.url}
                    </a>{" "}
                    <span className="text-muted-foreground">
                      {m.domain}
                      {m.verdict ? ` · ${m.verdict.replace(/_/g, " ")}` : ""}
                      {m.is_competitor ? " · about a competitor" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">
                Nothing matched yet. Coverage reads new articles as they appear; change anything above and run again.
              </p>
            )}
            {draft.siteId ? (
              <Link
                href={marketingRoutes.site(brandCtx.id, draft.siteId, "/backlinks?view=coverage")}
                className="mt-2 inline-block text-xs font-medium text-primary"
              >
                Open coverage
              </Link>
            ) : null}
            <p className="mt-2 text-xs text-muted-foreground">Change anything? Edit above and press Run now again.</p>
          </section>
        ) : null}

        <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 rounded-md border border-border bg-card/95 p-2 backdrop-blur">
          <Button variant="outline" size="sm" onClick={() => void save(false)} disabled={Boolean(saving)}>
            {saving === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button size="sm" onClick={() => void save(true)} disabled={Boolean(saving)}>
            {saving === "run" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            {saving === "run" ? "Running…" : "Save and run now"}
          </Button>
        </div>
      </div>
    </div>
  );
}
