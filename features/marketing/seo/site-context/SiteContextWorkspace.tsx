"use client";

// features/marketing/seo/site-context/SiteContextWorkspace.tsx — one site's
// context (`…/seo/[site]/context`, OpenSEO Wave 3 item 5): every fact an agent
// is given about this site, each from the place it is stored and each opening
// that fact's own editor. Page roles are edited here (the page plan's one
// write); the person's own SEO expertise is set here (knob expertise.seo, user
// rung). "What agents see" shows the exact `seo_site` `context` text.
//
// One more place, never a replacement: initiatives, competitors, the voice page
// and each page's SEO plan stay the editors of record.

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { Eye, FileSearch, Flag, Mic, Swords } from "lucide-react";
import {
  Badge,
  Button,
  EmptyState,
  RegionSkeleton,
  SearchField,
  SegmentedControl,
  Select,
} from "@ai-matrx/design-system/controls";
import { InfoHint } from "@/components/official/InfoHint";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import {
  InlineQueryError,
  SectionCard,
} from "@/features/marketing/components/shared/MarketingUi";
import { useUpdatePageDesiredValues } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { knobRefusalSentence } from "@/lib/scoped-config/service";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { AgentViewDialog } from "./AgentViewDialog";
import {
  siteContextKeys,
  useBrandVoiceFact,
  useOwnExpertise,
  useRolePages,
  useSiteCompetitorFacts,
  useSiteContextSettings,
  useSiteGoals,
} from "./hooks";
import {
  keywordPlanOf,
  keywordPlanWithRole,
  pageRoleOptions,
  pageRolePickerValue,
  readPageRole,
  type PageRoleVocabulary,
} from "./page-roles";
import {
  EXPERTISE_LEVELS,
  fetchKeywordPlan,
  searchSitePages,
  setOwnExpertise,
  type ExpertiseLevel,
  type RolePageRow,
} from "./service";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const COMPETITORS_SHOWN = 12;
const NO_ROLE = "__none";

export function SiteContextWorkspace() {
  const { site, brandId: brandRoute } = useMarketingSite();
  const brandId = site.brand_id ?? null;
  const settings = useSiteContextSettings(site.organization_id);
  const [viewing, setViewing] = useState(false);

  return (
    <main className="h-full min-h-0 overflow-y-auto bg-textured">
      <div className="mx-auto w-full max-w-5xl space-y-4 p-3 sm:p-5">
        <div className="flex items-center justify-end">
          <Button variant="outline" icon={<Eye />} onClick={() => setViewing(true)}>
            What agents see
          </Button>
        </div>
        <ExpertiseSection />
        <GoalsSection brandId={brandId} brandRoute={brandRoute} />
        <PageRolesSection
          siteId={site.id}
          brandRoute={brandRoute}
          vocabulary={settings.data?.vocabulary ?? null}
          settingsError={settings.error}
        />
        <CompetitorsSection siteId={site.id} brandRoute={brandRoute} />
        <VoiceSection brandId={brandId} brandRoute={brandRoute} />
      </div>
      <AgentViewDialog
        siteId={site.id}
        maxBytes={settings.data?.maxBytes ?? null}
        open={viewing}
        onOpenChange={setViewing}
      />
    </main>
  );
}

// ── expertise ───────────────────────────────────────────────────────────────

const LEVEL_LABEL: Record<ExpertiseLevel, string> = {
  beginner: "Beginner",
  practitioner: "Practitioner",
  expert: "Expert",
};

const ORIGIN_LABEL: Record<string, string> = {
  user: "Your setting",
  organization: "Organization default",
  platform_default: "Platform default",
};

export function ExpertiseSection() {
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const userId = useAppSelector(selectUserId);
  const queryClient = useQueryClient();
  const knob = useOwnExpertise(organizationId, userId);
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const level = (EXPERTISE_LEVELS as readonly string[]).includes(String(knob.data?.effective_value))
    ? (knob.data?.effective_value as ExpertiseLevel)
    : null;
  const origin = knob.data?.origin ?? null;

  const write = async (next: ExpertiseLevel | null) => {
    if (!organizationId || !userId) return;
    setSaving(true);
    setRefusal(null);
    try {
      const result = await setOwnExpertise({ organizationId, userId, level: next });
      if (!result.ok) setRefusal(knobRefusalSentence(result));
      // org-filter: write-target refreshes the setting this save just wrote in that organization
      await queryClient.invalidateQueries({ queryKey: siteContextKeys.expertise(organizationId, userId) });
    } catch (error) {
      setRefusal(extractErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SectionCard
      title="Your SEO expertise"
      headerExtra={origin ? <Badge data-testid="expertise-origin">{ORIGIN_LABEL[origin] ?? origin}</Badge> : null}
    >
      {!organizationId || !userId ? (
        <p className="text-xs text-muted-foreground">Choose an organization to set this.</p>
      ) : knob.error ? (
        <InlineQueryError what="your expertise" error={knob.error} />
      ) : knob.isLoading ? (
        <RegionSkeleton shape="rows" count={1} aria-label="Loading your expertise" />
      ) : !knob.data ? (
        <p className="text-xs text-muted-foreground">No expertise setting is registered.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<ExpertiseLevel>
            aria-label="Your SEO expertise"
            value={level ?? "practitioner"}
            onValueChange={(v) => void write(v)}
            data={EXPERTISE_LEVELS.map((l) => ({ value: l, label: LEVEL_LABEL[l], disabled: saving }))}
          />
          {origin === "user" ? (
            <Button variant="quiet" disabled={saving} onClick={() => void write(null)}>
              Use default
            </Button>
          ) : null}
          {refusal ? (
            <span role="alert" className="flex items-center gap-1 text-xs text-destructive">
              Not changed
              <InfoHint text={refusal.slice(0, 140)} label="Why it was not changed" />
            <ErrorAlchemyMenu /></span>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

// ── goals ───────────────────────────────────────────────────────────────────

function GoalsSection({ brandId, brandRoute }: { brandId: string | null; brandRoute: string }) {
  const goals = useSiteGoals(brandId);
  const total = goals.data?.total ?? 0;
  return (
    <SectionCard
      title="Goals"
      // read-gate-exempt: badge renders only once goals.data exists
      headerExtra={goals.data ? <Badge>{total} active</Badge> : null}
      action={{ label: "Open initiatives", href: marketingRoutes.brandInitiatives(brandRoute) }}
    >
      {!brandId ? (
        <EmptyState icon={<Flag />} title="None recorded" line="This site has no brand; goals belong to a brand." />
      ) : goals.error ? (
        <InlineQueryError what="goals" error={goals.error} />
      ) : goals.isLoading ? (
        <RegionSkeleton shape="rows" count={2} aria-label="Loading goals" />
      ) : !goals.data?.rows.length ? (
        <EmptyState icon={<Flag />} title="None recorded" line="The brand has no active initiative." />
      ) : (
        <ul className="divide-y divide-border">
          {goals.data.rows.map((g) => (
            <li key={g.id} className="flex items-center gap-3 py-1.5">
              <Link
                href={`${marketingRoutes.brandInitiatives(brandRoute)}/${g.id}`}
                className="min-w-0 flex-1 truncate text-sm text-primary"
              >
                {g.name ?? "Untitled initiative"}
              </Link>
              {g.objective ? <Badge>{g.objective}</Badge> : null}
              {g.ends_on ? (
                <span className="shrink-0 text-xs text-muted-foreground">to {g.ends_on}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

// ── page roles ──────────────────────────────────────────────────────────────

function roleOptions(vocab: PageRoleVocabulary, stored: string) {
  return [{ value: NO_ROLE, label: "No role" }, ...pageRoleOptions(vocab, stored)];
}

export function PageRoleRow({
  page,
  siteId,
  brandRoute,
  vocabulary,
  onSaved,
}: {
  page: RolePageRow;
  siteId: string;
  brandRoute: string;
  vocabulary: PageRoleVocabulary;
  onSaved: () => void;
}) {
  const mutation = useUpdatePageDesiredValues();
  const stored = String(keywordPlanOf(page.desired_values).page_role ?? "");
  const reading = readPageRole(stored, vocabulary);
  const value = reading.kind === "none" ? NO_ROLE : pageRolePickerValue(stored, vocabulary);

  const save = async (next: string) => {
    const role = next === NO_ROLE ? null : next;
    try {
      const current = await fetchKeywordPlan(siteId, page.id);
      await mutation.mutateAsync({
        siteId,
        pageId: page.id,
        patch: { keyword_plan: keywordPlanWithRole(current, role) },
      });
      onSaved();
    } catch (error) {
      toast.error("Could not save the page role", { description: extractErrorMessage(error) });
    }
  };

  return (
    <li className="flex items-center gap-2 py-1.5" data-page-id={page.id}>
      <Link
        href={marketingRoutes.sitePage(brandRoute, siteId, page.id)}
        className="min-w-0 flex-1 truncate text-sm text-primary"
        title={page.url}
      >
        {page.url}
      </Link>
      {reading.kind === "alias" ? (
        <Badge tone="info" data-testid="role-alias">Reads as {reading.role}</Badge>
      ) : null}
      {reading.kind === "outside" ? (
        <span className="flex items-center gap-1">
          <Badge tone="warning" data-testid="role-outside">Not in list</Badge>
          <InfoHint
            text={`Kept as recorded. Allowed: ${vocabulary.allowed.join(", ") || "none set"}.`}
            label="Role outside the list"
          />
        </span>
      ) : null}
      <Select
        aria-label={`Role for ${page.url}`}
        value={value}
        options={roleOptions(vocabulary, stored)}
        disabled={mutation.isPending}
        onValueChange={(v) => void save(v)}
        className="w-40 shrink-0"
      />
    </li>
  );
}

function PageRolesSection({
  siteId,
  brandRoute,
  vocabulary,
  settingsError,
}: {
  siteId: string;
  brandRoute: string;
  vocabulary: PageRoleVocabulary | null;
  settingsError: unknown;
}) {
  const queryClient = useQueryClient();
  const pages = useRolePages(siteId);
  const [term, setTerm] = useState("");
  const [found, setFound] = useState<RolePageRow[] | null>(null);
  const total = pages.data?.total ?? 0;
  const shown = pages.data?.rows.length ?? 0;
  const refresh = () => void queryClient.invalidateQueries({ queryKey: siteContextKeys.pages(siteId) });

  const search = async (value: string) => {
    setTerm(value);
    if (value.trim().length < 2) return setFound(null);
    try {
      setFound(await searchSitePages(siteId, value));
    } catch (error) {
      toast.error("Could not search pages", { description: extractErrorMessage(error) });
    }
  };

  return (
    <SectionCard
      title="Key pages"
      // read-gate-exempt: badge renders only once pages.data exists
      headerExtra={pages.data ? <Badge>{total > shown ? `${shown} of ${total}` : total}</Badge> : null}
      action={{ label: "Open pages", href: marketingRoutes.website(brandRoute, siteId, "/pages") }}
    >
      {settingsError ? (
        <InlineQueryError what="the page-role list" error={settingsError} />
      ) : pages.error ? (
        <InlineQueryError what="page roles" error={pages.error} />
      ) : pages.isLoading || !vocabulary ? (
        <RegionSkeleton shape="rows" count={3} aria-label="Loading page roles" />
      ) : (
        <div className="space-y-2">
          {shown ? (
            <ul className="divide-y divide-border">
              {pages.data?.rows.map((p) => (
                <PageRoleRow
                  key={p.id}
                  page={p}
                  siteId={siteId}
                  brandRoute={brandRoute}
                  vocabulary={vocabulary}
                  onSaved={refresh}
                />
              ))}
            </ul>
          ) : (
            <EmptyState icon={<FileSearch />} title="None recorded" line="No page on this site has a role." />
          )}
          <SearchField
            aria-label="Find a page to give a role"
            placeholder="Find a page to give a role"
            value={term}
            onChange={(e) => void search(e.target.value)}
          />
          {found ? (
            found.length ? (
              <ul aria-label="Matching pages" className="divide-y divide-border">
                {found.map((p) => (
                  <PageRoleRow
                    key={p.id}
                    page={p}
                    siteId={siteId}
                    brandRoute={brandRoute}
                    vocabulary={vocabulary}
                    onSaved={() => {
                      refresh();
                      void search(term);
                    }}
                  />
                ))}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">No page matches.</p>
            )
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}

// ── competitors ─────────────────────────────────────────────────────────────

function CompetitorsSection({ siteId, brandRoute }: { siteId: string; brandRoute: string }) {
  const competitors = useSiteCompetitorFacts(siteId);
  const kept = competitors.data?.kept ?? [];
  const ignored = competitors.data?.ignored ?? 0;
  const editor = `${marketingRoutes.brandCompetitors(brandRoute)}/competitors?siteId=${siteId}`;
  return (
    <SectionCard
      title="Competitors"
      headerExtra={
        competitors.data ? (
          <span className="flex items-center gap-1">
            {/* read-gate-exempt: renders only once competitors.data exists */}
            <Badge>{kept.length}</Badge>
            {ignored ? <Badge data-testid="competitors-ignored">{ignored} ignored</Badge> : null}
          </span>
        ) : null
      }
      action={{ label: "Open competitors", href: editor }}
    >
      {competitors.error ? (
        <InlineQueryError what="competitors" error={competitors.error} />
      ) : competitors.isLoading ? (
        <RegionSkeleton shape="rows" count={3} aria-label="Loading competitors" />
      ) : !kept.length ? (
        <EmptyState
          icon={<Swords />}
          title="None recorded"
          line={ignored ? `All ${ignored} current competitors are ignored.` : "No current competitor for this site."}
        />
      ) : (
        <ul className="divide-y divide-border">
          {kept.slice(0, COMPETITORS_SHOWN).map((c) => {
            const domain = c.display_domain ?? c.normalized_domain;
            return (
              <li key={c.id} className="flex items-center gap-2 py-1.5">
                <Link
                  href={marketingRoutes.domainResearch(domain, siteId)}
                  className="min-w-0 flex-1 truncate text-sm text-primary"
                >
                  {domain}
                </Link>
                {c.display_name ? (
                  <span className="hidden min-w-0 max-w-[40%] truncate text-xs text-muted-foreground sm:inline">
                    {c.display_name}
                  </span>
                ) : null}
                <Badge tone={c.classification_status === "confirmed" ? "success" : "neutral"}>
                  {c.classification_status ?? "unclassified"}
                </Badge>
              </li>
            );
          })}
          {kept.length > COMPETITORS_SHOWN ? (
            <li className="py-1.5 text-xs">
              <Link href={editor} className="text-primary">
                {kept.length - COMPETITORS_SHOWN} more
              </Link>
            </li>
          ) : null}
        </ul>
      )}
    </SectionCard>
  );
}

// ── voice ───────────────────────────────────────────────────────────────────

function VoiceSection({ brandId, brandRoute }: { brandId: string | null; brandRoute: string }) {
  const voice = useBrandVoiceFact(brandId);
  const row = voice.data ?? null;
  return (
    <SectionCard
      title="Voice"
      action={{ label: "Open voice", href: `${marketingRoutes.brandIdentity(brandRoute)}/voice` }}
    >
      {!brandId ? (
        <EmptyState icon={<Mic />} title="None recorded" line="This site has no brand." />
      ) : voice.error ? (
        <InlineQueryError what="the brand voice" error={voice.error} />
      ) : voice.isLoading ? (
        <RegionSkeleton shape="rows" count={1} aria-label="Loading the brand voice" />
      ) : !row ? (
        <EmptyState icon={<Mic />} title="None recorded" line="The brand's voice has not been measured." />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-sm">{row.label || "Brand voice"}</span>
          {row.register_label ? <Badge>{row.register_label}</Badge> : null}
          <Badge tone={row.status === "confirmed" ? "success" : "warning"} data-testid="voice-status">
            {row.status === "confirmed" ? "Confirmed" : "Draft"}
          </Badge>
          {Number.isFinite(Number.parseFloat(row.confidence)) ? (
            <span className="text-xs text-muted-foreground">
              {Math.round(Number.parseFloat(row.confidence) * 100)}% sure
            </span>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
