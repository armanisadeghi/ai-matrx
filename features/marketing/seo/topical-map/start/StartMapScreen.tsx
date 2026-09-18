"use client";

/**
 * START A MAP — the six-source tile screen (PLAN §6 E; champion: our podcast
 * studio's generator form + Notion's AI bar).
 *
 * One chosen tile, its own control, an emphasis box, then ONE launch through
 * `useAuthorTopicalMap` — a durable SEO command that floats in `LiveRunWindow`
 * (THE FLOATING LAW), survives a reload (`restoring`/rejoin) and reports the
 * server's own stage sentences. The result renders through `StartMapResult`.
 *
 * What rides where (THE USER-INPUT LAW): the emphasis box is the only thing
 * the person TYPES about the map, and the wire carries it as `emphasis`, which
 * the server hands to the mandate as `user_input`. Everything else is a named
 * field of `AuthorMapRequest`.
 *
 * Change mode comes from the `map_agent_change_mode` knob. `ask` is a SCREEN
 * mode (`map-author.ts`): the person is asked here, before the paid call, and
 * the body sends the answer — never `ask` itself. `apply`/`propose` are shown
 * as what the run will do; every launch states its consequence and its cost
 * first (destructive-and-expensive-actions law), so the dialog is not
 * optional in any mode.
 *
 * Adding ONE section to an existing map (`mapId` + `sectionParentSlug`) and
 * "Extend from the site" (R14 — `data` source, `propose` mode, on the existing
 * map) reuse this screen through `ExtendFromSiteDialog`.
 */

import { useEffect, useState } from "react";
import { AlertTriangle, BrainCircuit, Globe, Loader2, Square } from "lucide-react";

import { ProTextarea } from "@/components/official/ProTextarea";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@ai-matrx/design-system";
import { ResearchTopicSelect } from "@/features/marketing/content-plan/components/ResearchTopicSelect";
import { useBrandSites } from "@/features/marketing/data/hooks";
import { SourceResolverPanel } from "@/features/podcasts/generator/components/SourceResolverPanel";
import { useSourceResolvers } from "@/features/podcasts/generator/useSourceResolvers";
import { extractErrorMessage } from "@/utils/errors";
import { cn } from "@/lib/utils";

import { useMapTopicRows } from "../hooks";
import { useTopicalMapKnobs, type MapAgentChangeMode } from "../knobs";
import type { MapAuthorChangeMode, MapAuthorSourceKind } from "../map-author";
import { useAuthorTopicalMap } from "../useAuthorTopicalMap";
import { TopicalMapFailed } from "../components/TopicalMapStates";
import { START_MAP_SOURCES, startMapSource } from "./startMapSources";
import { StartMapResult } from "./StartMapResult";

const EVERY_SITE = "__every_site__";
const ROOT = "__root__";

export interface StartMapScreenProps {
  brand: { id: string; name: string; organizationId: string };
  /** Preselect a tile (deep links: `?start=<kind>`). */
  initialSourceKind?: MapAuthorSourceKind | null;
  /** `existing_research` deep link (`?research=<rs_topic id>`). */
  initialResearchTopicId?: string | null;
  /** `data` narrowed to one site (`?site=`). */
  initialSiteId?: string | null;
  /** Omitted: the server creates a draft map for this brand first. */
  mapId?: string | null;
  mapName?: string | null;
  /** Add ONE section under this topic instead of starting the map. */
  sectionParentSlug?: string | null;
  /** Force the mode (R14's extender sends `propose`); otherwise the knob decides. */
  forcedChangeMode?: MapAuthorChangeMode | null;
  /** Lock the tile (the extender is always `data`). */
  lockSourceKind?: boolean;
  className?: string;
}

export function StartMapScreen({
  brand,
  initialSourceKind = null,
  initialResearchTopicId = null,
  initialSiteId = null,
  mapId = null,
  mapName = null,
  sectionParentSlug = null,
  forcedChangeMode = null,
  lockSourceKind = false,
  className,
}: StartMapScreenProps) {
  const [sourceKind, setSourceKind] = useState<MapAuthorSourceKind>(
    initialSourceKind ?? (initialResearchTopicId ? "existing_research" : "data"),
  );
  const tile = startMapSource(sourceKind);

  // Every source's own value lives in its own state; `authorTopicalMapBody`
  // sends only the chosen tile's field, so a value left in a tile the person
  // switched away from can never ride along.
  const [siteId, setSiteId] = useState<string | null>(initialSiteId);
  const [prompt, setPrompt] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [webUrl, setWebUrl] = useState("");
  const [webText, setWebText] = useState("");
  const [researchTopicId, setResearchTopicId] = useState<string | null>(initialResearchTopicId);
  const [emphasis, setEmphasis] = useState("");
  const [newMapName, setNewMapName] = useState("");
  const [parentSlug, setParentSlug] = useState<string | null>(sectionParentSlug);
  const [resolverBusy, setResolverBusy] = useState(false);
  const [webFetching, setWebFetching] = useState(false);
  const [webError, setWebError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [askedMode, setAskedMode] = useState<"propose" | "apply" | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const knobs = useTopicalMapKnobs();
  const sites = useBrandSites(brand.id);
  // Section parents are only meaningful on an existing map.
  const topicRows = useMapTopicRows(mapId ?? "", Boolean(mapId));
  const resolvers = useSourceResolvers();

  const run = useAuthorTopicalMap({
    brandId: brand.id,
    organizationId: brand.organizationId,
  });

  // A deep link that lands after mount (the home switches kinds in place).
  useEffect(() => {
    if (initialSourceKind) setSourceKind(initialSourceKind);
  }, [initialSourceKind]);
  useEffect(() => {
    if (initialResearchTopicId) {
      setResearchTopicId(initialResearchTopicId);
      setSourceKind("existing_research");
    }
  }, [initialResearchTopicId]);

  const knobMode: MapAgentChangeMode | null = knobs.knobs?.map_agent_change_mode ?? null;
  const effectiveMode: MapAuthorChangeMode | "ask" | null = forcedChangeMode ?? knobMode;

  const busy = run.running || run.restoring || resolverBusy || webFetching;

  const readiness = (): string | null => {
    switch (sourceKind) {
      case "prompt":
        return prompt.trim() ? null : "Describe the business before building the map.";
      case "documents":
        return documentText.trim() ? null : "Paste or pick the document text first.";
      case "web_search":
        return webText.trim() ? null : "Fetch a page address first, then edit the text.";
      case "existing_research":
        return researchTopicId ? null : "Pick the finished research topic.";
      default:
        return null;
    }
  };
  const notReady = readiness();

  const fetchWebPage = async () => {
    const url = webUrl.trim();
    if (!url) return;
    setWebError(null);
    setWebFetching(true);
    try {
      const text = await resolvers.resolveWebsite(url, (progress) => setWebText(progress));
      setWebText(text);
    } catch (error) {
      setWebError(extractErrorMessage(error));
    } finally {
      setWebFetching(false);
    }
  };

  const launch = async (mode: MapAuthorChangeMode | null) => {
    setLocalError(null);
    try {
      run.reset();
      await run.author({
        sourceKind,
        mapId: mapId ?? undefined,
        mapName: mapId ? undefined : newMapName.trim() || undefined,
        sectionParentSlug: parentSlug ?? undefined,
        emphasis: emphasis || undefined,
        changeMode: mode ?? undefined,
        siteId: sourceKind === "data" ? siteId ?? undefined : undefined,
        prompt: sourceKind === "prompt" ? prompt : undefined,
        documentText: sourceKind === "documents" ? documentText : undefined,
        webSearchText: sourceKind === "web_search" ? webText : undefined,
        webSearchQuery: sourceKind === "web_search" ? webUrl.trim() || undefined : undefined,
        researchTopicId: sourceKind === "existing_research" ? researchTopicId : undefined,
      });
    } catch (error) {
      // `authorTopicalMapBody` refuses locally what the server would refuse —
      // shown here, before any paid call.
      setLocalError(extractErrorMessage(error));
    }
  };

  const onConfirm = () => {
    const mode: MapAuthorChangeMode | null =
      effectiveMode === "ask" ? askedMode : effectiveMode === null ? null : effectiveMode;
    if (effectiveMode === "ask" && !mode) return;
    setConfirmOpen(false);
    void launch(mode);
  };

  const target = mapId
    ? parentSlug
      ? `one new section under "${parentSlug}" in ${mapName ?? "this map"}`
      : `${mapName ?? "this map"}`
    : newMapName.trim()
      ? `a new map "${newMapName.trim()}" for ${brand.name}`
      : `a new draft map for ${brand.name}`;

  const consequence = (mode: MapAuthorChangeMode | null): string => {
    const cost =
      "This is minutes of paid agent work (cost unmeasured on this build). The run keeps going if you close this page and rejoins here.";
    if (sourceKind === "new_research") {
      return `Commissions a company topic-tree research run for ${brand.name}. No map is written on this call; you build it from the finished research afterwards. ${cost}`;
    }
    if (mode === "apply") {
      return `Writes the proposed topics into ${target} as ACTIVE — live for every site using the map, immediately. Existing topics with the same slug are updated in place. ${cost}`;
    }
    if (mode === "propose") {
      return `Writes the proposed topics into ${target} as PROPOSALS you review one by one; nothing goes live until accepted. ${cost}`;
    }
    return `Writes the proposed topics into ${target}; whether they land active or as proposals is decided by this organization's change-mode setting. ${cost}`;
  };

  return (
    <div className={cn("grid gap-4", className)}>
      {/* The tiles */}
      <div
        role="radiogroup"
        aria-label="Where the map starts from"
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {START_MAP_SOURCES.map((option) => {
          const Icon = option.icon;
          const active = option.kind === sourceKind;
          const locked = lockSourceKind && !active;
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={locked || busy}
              onClick={() => setSourceKind(option.kind)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:border-primary/40 hover:bg-muted/40",
                (locked || busy) && "cursor-not-allowed opacity-60",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className="h-4 w-4 shrink-0" aria-hidden />
                {option.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{option.helper}</span>
            </button>
          );
        })}
      </div>

      {/* The chosen tile's control */}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4">
        {tile.control === "site" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="start-map-site">Site to read</Label>
            {sites.isError ? (
              <p role="alert" className="text-xs text-destructive">
                {extractErrorMessage(sites.error)}
              </p>
            ) : (
              <Select
                value={siteId ?? EVERY_SITE}
                onValueChange={(v) => setSiteId(v === EVERY_SITE ? null : v)}
                disabled={busy}
              >
                <SelectTrigger id="start-map-site" className="w-full sm:w-80">
                  <SelectValue placeholder="Every site of this brand" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={EVERY_SITE}>Every site of this brand</SelectItem>
                  {(sites.data ?? []).map((site) => (
                    <SelectItem key={site.id} value={site.id}>
                      {site.name ?? site.domain}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              {sites.isPending
                ? "Loading this brand's sites…"
                : (sites.data?.length ?? 0) === 0
                  ? "This brand has no site yet; the author reads the brand profile, business facts and locations alone."
                  : "The author reads the brand profile plus the chosen site's crawl, keywords and content plan."}
            </p>
          </div>
        ) : null}

        {tile.control === "text" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="start-map-prompt">The business, in your words</Label>
            <ProTextarea
              id="start-map-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={tile.placeholder}
              rows={6}
              disabled={busy}
              className="text-base"
            />
          </div>
        ) : null}

        {tile.control === "resolve" && sourceKind === "documents" ? (
          <SourceResolverPanel
            resolveKind="note"
            value={documentText}
            onChange={setDocumentText}
            onBusyChange={setResolverBusy}
          />
        ) : null}

        {tile.control === "resolve" && sourceKind === "web_search" ? (
          <div className="grid gap-2">
            <Label htmlFor="start-map-url">Page address</Label>
            <div className="flex gap-2">
              <Input
                id="start-map-url"
                type="url"
                inputMode="url"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                placeholder="https://example.com/services"
                disabled={busy}
                className="text-base"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void fetchWebPage()}
                disabled={busy || !webUrl.trim()}
              >
                {webFetching ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Globe className="h-4 w-4" aria-hidden />
                )}
                Fetch and clean
              </Button>
            </div>
            {webError ? (
              <p role="alert" className="text-xs text-destructive">
                {webError}
              </p>
            ) : null}
            <ProTextarea
              aria-label="Cleaned page text"
              value={webText}
              onChange={(e) => setWebText(e.target.value)}
              placeholder={tile.placeholder}
              rows={8}
              disabled={busy}
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">
              Edit the text before building — what is in the box is exactly what the author reads.
            </p>
          </div>
        ) : null}

        {tile.control === "research" ? (
          <div className="grid gap-1.5">
            <Label>Finished research</Label>
            <ResearchTopicSelect
              value={researchTopicId}
              onChange={setResearchTopicId}
              organizationId={brand.organizationId}
              triggerClassName="h-9 w-full sm:w-80 text-sm"
            />
          </div>
        ) : null}

        {tile.control === "none" ? (
          <p className="text-sm text-muted-foreground">{tile.helper}</p>
        ) : null}

        {/* Where it lands */}
        {mapId ? (
          <div className="grid gap-1.5">
            <Label htmlFor="start-map-parent">Add under</Label>
            {topicRows.isError ? (
              <TopicalMapFailed what="this map's topics" error={topicRows.error} />
            ) : (
              <Select
                value={parentSlug ?? ROOT}
                onValueChange={(v) => setParentSlug(v === ROOT ? null : v)}
                disabled={busy || topicRows.isPending}
              >
                <SelectTrigger id="start-map-parent" className="w-full sm:w-80">
                  <SelectValue placeholder="The whole map" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ROOT}>The whole map</SelectItem>
                  {(topicRows.data ?? [])
                    .filter((t) => t.status === "active")
                    .map((t) => (
                      <SelectItem key={t.id} value={t.slug}>
                        {t.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground">
              Choosing a topic adds ONE new section beneath it and leaves the rest of the map
              alone.
            </p>
          </div>
        ) : sourceKind !== "new_research" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="start-map-name">Map name (optional)</Label>
            <Input
              id="start-map-name"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              placeholder={`${brand.name} topical map`}
              disabled={busy}
              className="w-full text-base sm:w-80"
            />
          </div>
        ) : null}

        {/* Emphasis — the only thing typed ABOUT the map; rides `user_input`. */}
        <div className="grid gap-1.5">
          <Label htmlFor="start-map-emphasis">Emphasis (optional)</Label>
          <ProTextarea
            id="start-map-emphasis"
            value={emphasis}
            onChange={(e) => setEmphasis(e.target.value)}
            placeholder="e.g. Data security is a major focus. Do not split by city."
            rows={2}
            disabled={busy}
            className="text-base"
          />
        </div>

        {/* Mode + launch */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {knobs.error ? (
              <span role="alert" className="text-destructive">
                Change mode could not be read: {extractErrorMessage(knobs.error)}
              </span>
            ) : effectiveMode === null ? (
              "Reading this organization's change-mode setting…"
            ) : effectiveMode === "ask" ? (
              "You will be asked whether topics land live or as proposals."
            ) : effectiveMode === "apply" ? (
              "Topics land ACTIVE (change mode: apply)."
            ) : (
              "Topics land as PROPOSALS you review (change mode: propose)."
            )}
          </p>
          <div className="flex items-center gap-2">
            {run.running && run.cancel ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void run.cancel?.()}
                disabled={run.cancelling}
              >
                <Square className="h-4 w-4" aria-hidden />
                Stop
              </Button>
            ) : null}
            <Button
              type="button"
              onClick={() => {
                setAskedMode(null);
                setConfirmOpen(true);
              }}
              disabled={busy || Boolean(notReady) || (effectiveMode === null && !knobs.error)}
              title={notReady ?? undefined}
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <BrainCircuit className="h-4 w-4" aria-hidden />
              )}
              {tile.launchLabel}
            </Button>
          </div>
        </div>
        {notReady && !busy ? (
          <p className="text-xs text-muted-foreground">{notReady}</p>
        ) : null}
      </div>

      {/* The run — the stream itself floats in LiveRunWindow; this is the ledger line. */}
      {run.restoring ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          A map run for {brand.name} is already in progress — rejoining it.
        </p>
      ) : null}
      {run.running ? (
        <div className="rounded-xl border border-border bg-card p-4" aria-live="polite">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {run.waitMessage ?? run.stage ?? "Working…"}
          </p>
          {run.memo?.source_kind ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Source: {startMapSource(run.memo.source_kind as MapAuthorSourceKind).label}
            </p>
          ) : null}
          {run.stages.length > 0 ? (
            <ol className="mt-2 grid gap-0.5 text-xs text-muted-foreground">
              {run.stages.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          ) : null}
        </div>
      ) : null}
      {run.status === "stopped" && run.stoppedMessage ? (
        <p className="rounded-xl border border-border bg-muted/30 p-3 text-sm">{run.stoppedMessage}</p>
      ) : null}
      {localError || run.error ? (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden />
            The map run did not start or stopped
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{localError ?? run.error}</p>
          {run.retry && !localError ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void run.retry?.()}
            >
              Run it again exactly as sent
            </Button>
          ) : null}
        </div>
      ) : null}
      {run.result ? (
        <StartMapResult
          result={run.result}
          onBuildFromResearch={(id) => {
            setResearchTopicId(id);
            setSourceKind("existing_research");
            run.reset();
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={sourceKind === "new_research" ? "Start the research?" : `Build ${mapId ? "into" : ""} ${target}?`}
        description={consequence(
          effectiveMode === "ask" ? askedMode : effectiveMode === null ? null : effectiveMode,
        )}
        content={
          effectiveMode === "ask" && sourceKind !== "new_research" ? (
            <RadioGroup
              value={askedMode ?? ""}
              onValueChange={(v) => setAskedMode(v === "apply" ? "apply" : "propose")}
              aria-label="How the topics land"
              className="grid gap-2"
            >
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="propose" id="start-map-mode-propose" />
                <span>
                  <span className="font-medium">Propose</span> — write them as proposals; nothing
                  goes live until you accept it.
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <RadioGroupItem value="apply" id="start-map-mode-apply" />
                <span>
                  <span className="font-medium">Apply</span> — write them active, live for every
                  site using the map, immediately.
                </span>
              </label>
            </RadioGroup>
          ) : undefined
        }
        confirmLabel={tile.launchLabel}
        confirmDisabled={effectiveMode === "ask" && sourceKind !== "new_research" && !askedMode}
        variant={
          (effectiveMode === "ask" ? askedMode : effectiveMode) === "apply" ? "destructive" : "default"
        }
        onConfirm={onConfirm}
      />
    </div>
  );
}
