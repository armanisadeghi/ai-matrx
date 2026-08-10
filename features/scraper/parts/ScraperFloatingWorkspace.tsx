"use client";

/**
 * @registry-status: sub-component
 * Body of `scraperWindow`. The registered window component
 * (features/window-panels/windows/ScraperWindow.tsx) is a thin shell that
 * delegates straight here. Do NOT add a separate registry entry for this
 * file — it's covered by `scraperWindow`.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";
import {
  Zap,
  Search,
  Loader2,
  Globe,
  RotateCcw,
  AlertCircle,
  Copy,
  CheckCircle,
  ImageIcon,
  RefreshCw,
  CheckCircle2,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProInput } from "@/components/official/ProInput";
import { ProcessForRagButton } from "@/features/rag/components/ProcessForRagButton";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  useScraperApi,
  type ScraperResult,
} from "@/features/scraper/hooks/useScraperApi";
import {
  buildScraperContextData,
  MODE_TO_SCRAPE_MODE,
  SCRAPE_MODE_TO_WORKSPACE_MODE,
  SCRAPER_CONTEXT_MENU_PROPS,
} from "@/features/scraper/agent-context/buildScraperContextData";
import { SCRAPE_MODES } from "@/features/surfaces/manifests/scraper.manifest";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createScraperExtraSections } from "@/features/scraper/agent-context/scraperExtraSections";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { useScraperKeywordSearchForm } from "@/features/scraper/hooks/useScraperKeywordSearchForm";
import {
  ScraperKeywordSearchCompactControls,
  ScraperKeywordHitListCompact,
  ScraperKeywordHitDetailCompact,
} from "@/features/scraper/parts/ScraperKeywordSearchPanel";
import {
  ScrapedResultDetailTabs,
  type ScrapedDetailTabId,
} from "@/features/scraper/parts/ScrapedResultDetailTabs";
import {
  contentLength,
  sortByContent,
  formatCharCount,
  getDomain,
  normalizeUrl,
} from "@/features/scraper/utils/scraper-floating-helpers";
import { cn } from "@/lib/utils";
import { useAppDispatch } from "@/lib/redux/hooks";
import { openImageViewer } from "@/features/window-panels/windows/image/openImageViewer";
import {
  isScrapeMode,
  isValidPageLimit,
  PAGE_LIMIT_DEFAULT,
  PAGE_LIMIT_MAX,
  PAGE_LIMIT_MIN,
  SCRAPE_MODE_BY_VALUE,
  SCRAPE_MODE_BY_WORKSPACE_MODE,
  SCRAPE_MODE_ENUM_TEXT,
  toScrapeMode,
  type WorkspaceMode,
} from "@/features/scraper/scrape-command";

// Universal v3 context menu — the SAME menu everywhere. The wrappers are the
// lightweight shell (imported statically); MenuContent lazy-loads on first open.
// The URL / keyword config inputs are editable → EditableContextMenu; the
// read-only scraped-results region → NonEditableContextMenu.
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";

interface ScrapeItemState {
  loading: boolean;
  error: string | null;
}

export function ScraperFloatingWorkspace({
  onClose,
  initialUrl,
  initialMode,
}: {
  onClose: () => void;
  /** Seed URL — opens pre-filled in single-URL mode (the "Read" entry point). */
  initialUrl?: string;
  /** Seed workspace mode. Defaults to "url" when an `initialUrl` is given. */
  initialMode?: WorkspaceMode;
}) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const keywordForm = useScraperKeywordSearchForm();

  const [mode, setMode] = useState<WorkspaceMode>(
    initialMode ?? (initialUrl ? "url" : "web"),
  );
  const [url, setUrl] = useState(initialUrl ?? "");
  const [keyword, setKeyword] = useState("");
  const [maxPages, setMaxPages] = useState(String(PAGE_LIMIT_DEFAULT));

  // Re-seed when the overlay is re-opened against a different URL while still
  // mounted (the opener updates `data.url`; this component instance persists).
  // Loud-by-omission: we only ever ADOPT a non-empty incoming URL, never wipe a
  // URL the user is mid-editing.
  useEffect(() => {
    if (!initialUrl) return;
    setUrl(initialUrl);
    setMode(initialMode ?? "url");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUrl, initialMode]);

  const [scrapedResults, setScrapedResults] = useState<ScraperResult[]>([]);
  const [scrapeStates, setScrapeStates] = useState<
    Record<number, ScrapeItemState>
  >({});
  const [selectedScrapedIndex, setSelectedScrapedIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<ScrapedDetailTabId>("pretty");
  const [copied, setCopied] = useState(false);

  const quickApi = useScraperApi();
  const batchApi = useScraperApi();

  const isAnyLoading =
    quickApi.isLoading || batchApi.isLoading || keywordForm.isLoading;
  const activeStatus =
    quickApi.statusMessage ||
    batchApi.statusMessage ||
    keywordForm.statusMessage;
  const activeError =
    (quickApi.hasError ? quickApi.error : null) ||
    (batchApi.hasError ? batchApi.error : null) ||
    (keywordForm.hasError ? keywordForm.error : null);

  const safeScrapedIndex = Math.min(
    selectedScrapedIndex,
    Math.max(0, scrapedResults.length - 1),
  );
  const selectedScraped = scrapedResults[safeScrapedIndex] ?? null;
  const selectedHit =
    keywordForm.selectedHitIndex != null
      ? (keywordForm.flatResults[keywordForm.selectedHitIndex] ?? null)
      : null;

  // ── Agent context wiring (matrx-user/scraper) ───────────────────────────
  // The editable config inputs (URL / keyword) and the read-only results
  // region both expose the live scrape state to bound agents. `contextData`
  // is rebuilt from current state each render (cheap; React Compiler memoizes).
  const urlInputRef = useRef<HTMLInputElement | null>(null);
  const keywordInputRef = useRef<HTMLInputElement | null>(null);

  const contextData = buildScraperContextData({
    mode,
    selected: selectedScraped,
    activeTab,
    failureReason: activeError,
    targetUrl: mode === "url" ? url : undefined,
    searchKeyword: mode === "web" ? keywordForm.keywords : keyword,
    maxPages:
      mode === "batch" ? parseInt(maxPages, 10) || PAGE_LIMIT_DEFAULT : undefined,
    results: scrapedResults,
    selectedIndex: safeScrapedIndex,
    searchHits: keywordForm.flatResults,
    isScraping: isAnyLoading,
  });

  // Editable inputs: read the live field value at call time so a bound agent
  // run carries the URL / keyword the user has typed (no stale snapshot).
  const getConfigApplicationScope = () => {
    const el = mode === "batch" ? keywordInputRef.current : urlInputRef.current;
    return buildApplicationScopeFromMenuContext({
      selectedText: "",
      selectionRange: el
        ? {
            type: "editable",
            element: el,
            start: el.selectionStart ?? 0,
            end: el.selectionEnd ?? 0,
          }
        : null,
      contextData,
    });
  };

  // ── Agent write target: scrape_request (matrx-user/scraper) ─────────────
  // Stages the NEXT request into the SAME state the user's typing drives —
  // setMode / setUrl / setKeyword / keywordForm.setKeywords / setMaxPages —
  // so a staged value is indistinguishable from a typed one and the user
  // edits or ignores it normally. Nothing here fetches: the Scrape button
  // stays the user's press.
  //
  // Validate-then-apply: every field is checked before the first setter runs,
  // so a rejected call leaves the form exactly as the user left it rather
  // than half-written. Field/mode mismatches THROW instead of coercing — the
  // seam turns the throw into an envelope the agent reads, and silently
  // switching the user's mode (or dropping a field) would be a lie either way.
  const getSurfaceWriteHandlers = () => ({
    scrape_request: (value: unknown) => {
      // The inputs are `disabled` while a run is in flight; an agent gets the
      // same answer the user's keyboard does, but loudly.
      if (isAnyLoading)
        throw new Error(
          "scrape_request is refused while a scrape is running (is_scraping is true). Wait for the run to finish, then stage the next request.",
        );

      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          `scrape_request expects an object with any of { scrape_mode?: ${SCRAPE_MODES.join(" | ")}, target_url?: string, search_keyword?: string, max_pages?: number }.`,
        );

      const patch = value as Record<string, unknown>;
      const allowed = [
        "scrape_mode",
        "target_url",
        "search_keyword",
        "max_pages",
      ];
      const unknownKeys = Object.keys(patch).filter(
        (k) => !allowed.includes(k),
      );
      if (unknownKeys.length > 0)
        throw new Error(
          `scrape_request got unsupported field(s): ${unknownKeys.join(", ")}. Supported fields are ${allowed.join(", ")}.`,
        );

      const present = (key: string) =>
        patch[key] !== undefined && patch[key] !== null;
      if (!allowed.some(present))
        throw new Error(
          "scrape_request needs at least one of scrape_mode, target_url, search_keyword, max_pages.",
        );

      // The mode AFTER this patch decides which inputs are legal — an agent
      // that switches mode and fills its field in one call must be judged
      // against the new mode, not the old one.
      let nextMode = mode;
      if (present("scrape_mode")) {
        const requested = patch.scrape_mode;
        if (
          typeof requested !== "string" ||
          !(requested in SCRAPE_MODE_TO_WORKSPACE_MODE)
        )
          throw new Error(
            `scrape_request.scrape_mode must be one of ${SCRAPE_MODES.join(" | ")}.`,
          );
        nextMode =
          SCRAPE_MODE_TO_WORKSPACE_MODE[
            requested as (typeof SCRAPE_MODES)[number]
          ];
      }
      const nextScrapeMode = MODE_TO_SCRAPE_MODE[nextMode];

      let nextUrl: string | undefined;
      if (present("target_url")) {
        if (nextMode !== "url")
          throw new Error(
            `scrape_request.target_url only applies to the "quick" single-URL mode, but this request lands in "${nextScrapeMode}" mode. Send scrape_mode: "quick" alongside it, or use search_keyword instead.`,
          );
        if (typeof patch.target_url !== "string" || !patch.target_url.trim())
          throw new Error(
            "scrape_request.target_url must be a non-empty string.",
          );
        const candidate = patch.target_url.trim();
        let parsed: URL;
        try {
          parsed = new URL(candidate);
        } catch {
          throw new Error(
            `scrape_request.target_url must be an absolute URL including the scheme (got "${candidate}").`,
          );
        }
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
          throw new Error(
            `scrape_request.target_url must use http:// or https:// (got "${parsed.protocol}//").`,
          );
        nextUrl = candidate;
      }

      let nextKeyword: string | undefined;
      if (present("search_keyword")) {
        if (nextMode === "url")
          throw new Error(
            'scrape_request.search_keyword does not apply to the "quick" single-URL mode. Send scrape_mode: "search" or "full" alongside it, or use target_url instead.',
          );
        if (
          typeof patch.search_keyword !== "string" ||
          !patch.search_keyword.trim()
        )
          throw new Error(
            "scrape_request.search_keyword must be a non-empty string.",
          );
        nextKeyword = patch.search_keyword.trim();
      }

      let nextMaxPages: number | undefined;
      if (present("max_pages")) {
        if (nextMode !== "batch")
          throw new Error(
            `scrape_request.max_pages only applies to the "full" search-and-scrape mode, but this request lands in "${nextScrapeMode}" mode.`,
          );
        if (
          typeof patch.max_pages !== "number" ||
          !Number.isInteger(patch.max_pages) ||
          patch.max_pages < 1 ||
          patch.max_pages > 20
        )
          throw new Error(
            "scrape_request.max_pages must be a whole number between 1 and 20.",
          );
        nextMaxPages = patch.max_pages;
      }

      // Everything validated — stage it.
      if (nextMode !== mode) setMode(nextMode);
      if (nextUrl !== undefined) setUrl(nextUrl);
      if (nextKeyword !== undefined) {
        // The keyword lives in two places by design: web-search mode reads it
        // off the keyword-search form hook, deep mode off local state (the
        // same split `contextData` reports on `search_keyword`).
        if (nextMode === "web") keywordForm.setKeywords(nextKeyword);
        else setKeyword(nextKeyword);
      }
      // maxPages is the <input type="number"> string state, same as typing.
      if (nextMaxPages !== undefined) setMaxPages(String(nextMaxPages));
    },
  });

  const handleQuickScrape = useCallback(async () => {
    const normalized = normalizeUrl(url);
    if (!normalized) return;
    setUrl(normalized);
    setActiveTab("pretty");
    quickApi.reset();

    try {
      const result = await quickApi.scrapeUrl(normalized);
      if (result) {
        setScrapedResults((prev) => {
          const exists = prev.findIndex((r) => r.url === result.url);
          if (exists >= 0) {
            const updated = [...prev];
            updated[exists] = result;
            return updated;
          }
          return [result, ...prev];
        });
        setSelectedScrapedIndex(0);
      }
    } catch {
      /* useScraperApi sets error */
    }
  }, [url, quickApi]);

  const handleSearchAndScrape = useCallback(async () => {
    if (!keyword.trim()) return;
    setActiveTab("pretty");
    batchApi.reset();

    const results = await batchApi.searchAndScrapeLimited({
      keyword: keyword.trim(),
      max_page_read: parseInt(maxPages, 10) || PAGE_LIMIT_DEFAULT,
      get_text_data: true,
      get_overview: true,
      get_links: true,
      get_main_image: true,
      get_organized_data: false,
      get_structured_data: false,
      get_content_filter_removal_details: false,
      include_highlighting_markers: false,
      include_media: false,
      include_media_links: false,
      include_media_description: false,
      include_anchors: false,
      anchor_size: 100,
    });

    if (results) {
      setScrapedResults(sortByContent(results));
      setScrapeStates({});
      setSelectedScrapedIndex(0);
    }
  }, [keyword, maxPages, batchApi]);

  const handleOnDemandScrape = useCallback(
    async (targetUrl: string, idx: number) => {
      setScrapeStates((prev) => ({
        ...prev,
        [idx]: { loading: true, error: null },
      }));
      try {
        const result = await quickApi.scrapeUrl(targetUrl);
        if (result) {
          setScrapedResults((prev) => {
            const updated = [...prev];
            updated[idx] = result;
            return updated;
          });
          setScrapeStates((prev) => ({
            ...prev,
            [idx]: { loading: false, error: null },
          }));
        } else {
          setScrapeStates((prev) => ({
            ...prev,
            [idx]: { loading: false, error: "No data returned" },
          }));
        }
      } catch (err) {
        setScrapeStates((prev) => ({
          ...prev,
          [idx]: {
            loading: false,
            error: err instanceof Error ? err.message : "Scrape failed",
          },
        }));
      }
    },
    [quickApi],
  );

  const handleScrapeFromWebHit = useCallback(async () => {
    const target = selectedHit?.url;
    if (!target) return;
    setActiveTab("pretty");
    quickApi.reset();
    const normalized = normalizeUrl(target);
    if (!normalized) return;
    try {
      const result = await quickApi.scrapeUrl(normalized);
      if (result) {
        setScrapedResults((prev) => {
          const exists = prev.findIndex((r) => r.url === result.url);
          if (exists >= 0) {
            const updated = [...prev];
            updated[exists] = result;
            return updated;
          }
          return [result, ...prev];
        });
        setSelectedScrapedIndex(0);
        setMode("url");
      }
    } catch {
      /* surfaced via quickApi */
    }
  }, [selectedHit, quickApi]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== "Enter" || isAnyLoading) return;
      if (mode === "url") void handleQuickScrape();
      else if (mode === "batch") void handleSearchAndScrape();
    },
    [isAnyLoading, mode, handleQuickScrape, handleSearchAndScrape],
  );

  const handleCopy = useCallback(async () => {
    if (!selectedScraped) return;
    const text =
      selectedScraped.textContent || selectedScraped.plainTextContent || "";
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [selectedScraped]);

  const handleReset = useCallback(() => {
    quickApi.reset();
    batchApi.reset();
    keywordForm.resetAll();
    setScrapedResults([]);
    setScrapeStates({});
    setSelectedScrapedIndex(0);
    setUrl("");
    setKeyword("");
    setActiveTab("pretty");
    setCopied(false);
  }, [quickApi, batchApi, keywordForm]);

  const openImages = useCallback(() => {
    if (!selectedScraped) return;
    const imgs = [
      ...(selectedScraped.mainImage ? [selectedScraped.mainImage] : []),
      ...(selectedScraped.images ?? []),
    ].filter(Boolean);
    if (imgs.length === 0) return;
    openImageViewer(dispatch, {
      images: imgs,
      title: selectedScraped.overview?.page_title ?? "Page images",
      instanceId: `scraper-img-${encodeURIComponent(selectedScraped.url).slice(0, 80)}`,
    });
  }, [dispatch, selectedScraped]);

  // ── Write half of the scraper surface (manifest `writeTargets`) ─────────
  // An agent may STAGE the next scrape command; it may never run one — that
  // spends real time on someone else's server and stays the user's click.
  // Every handler validates against the SAME `scrape-command` constants the
  // manifest's contract prose is interpolated from, and THROWS on a bad shape
  // (the writeback seam turns a throw into a safe error envelope the agent
  // reads). Fresh closures per call (the getWriteHandlers contract), so `mode`
  // read below is always the live mode, never a stale snapshot.
  const getSurfaceWriteHandlers = () => ({
    scrape_command: (value: unknown) => {
      // A run in flight DISABLES these inputs for the user; staging into them
      // would land a value the user cannot see or correct, against a request
      // whose parameters are already captured. Refuse loudly instead.
      if (isAnyLoading)
        throw new Error(
          "scrape_command is unavailable while a scrape or search is in flight (is_scraping is true). Wait for the run to finish.",
        );
      if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(
          "scrape_command expects an object: { mode?, url?, keyword? }.",
        );
      const patch = value as Record<string, unknown>;
      const accepted = ["mode", "url", "keyword"];
      const unsupported = Object.keys(patch).filter(
        (key) => !accepted.includes(key),
      );
      if (unsupported.length > 0)
        throw new Error(
          `scrape_command got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${accepted.join(" | ")}.`,
        );
      if (!accepted.some((key) => key in patch))
        throw new Error(
          `scrape_command needs at least one of: ${accepted.join(" | ")}.`,
        );

      // Resolve the mode this command runs in FIRST: it decides which config
      // input the workspace renders, so a field belonging to another mode is
      // refused rather than staged where the user cannot see it.
      const nextMode = "mode" in patch ? patch.mode : toScrapeMode(mode);
      if (!isScrapeMode(nextMode))
        throw new Error(
          `scrape_command.mode expects one of: ${SCRAPE_MODE_ENUM_TEXT}.`,
        );
      const spec = SCRAPE_MODE_BY_VALUE[nextMode];

      let nextUrl: string | undefined;
      if ("url" in patch) {
        if (typeof patch.url !== "string" || !patch.url.trim())
          throw new Error("scrape_command.url expects a non-empty string.");
        if (spec.input !== "url")
          throw new Error(
            `scrape_command.url does not apply in "${spec.value}" mode (${spec.summary}). Send { mode, url } together to switch mode and stage the URL in one call.`,
          );
        const normalized = normalizeUrl(patch.url);
        if (!normalized)
          throw new Error(
            `scrape_command.url is not a usable URL: "${patch.url}".`,
          );
        nextUrl = normalized;
      }

      let nextKeyword: string | undefined;
      if ("keyword" in patch) {
        if (typeof patch.keyword !== "string" || !patch.keyword.trim())
          throw new Error("scrape_command.keyword expects a non-empty string.");
        if (spec.input !== "keyword")
          throw new Error(
            `scrape_command.keyword does not apply in "${spec.value}" mode (${spec.summary}). Send { mode, keyword } together to switch mode and stage the keyword in one call.`,
          );
        nextKeyword = patch.keyword.trim();
      }

      // Everything is validated before ANY state moves — a rejected key must
      // never leave a half-applied command staged in the form.
      if ("mode" in patch) setMode(spec.workspaceMode);
      if (nextUrl !== undefined) setUrl(nextUrl);
      if (nextKeyword !== undefined) {
        // Which store holds the keyword depends on the mode — deep mode keeps
        // its own, web search uses the keyword form's. Resolved from the mode
        // THIS call staged, which is the whole reason mode and keyword share
        // one target instead of racing as two.
        if (spec.workspaceMode === "web") keywordForm.setKeywords(nextKeyword);
        else setKeyword(nextKeyword);
      }
    },
    scrape_page_limit: (value: unknown) => {
      if (isAnyLoading)
        throw new Error(
          "scrape_page_limit is unavailable while a scrape or search is in flight (is_scraping is true). Wait for the run to finish.",
        );
      if (!isValidPageLimit(value))
        throw new Error(
          `scrape_page_limit expects an integer from ${PAGE_LIMIT_MIN} to ${PAGE_LIMIT_MAX}.`,
        );
      setMaxPages(String(value));
    },
  });

  const showScrapeMain = mode === "url" || mode === "batch";
  const showWebMain = mode === "web";

  const iconBtn = "h-5 w-5 p-0";

  const leftActions = (
    <>
      {showWebMain && selectedHit?.url && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            window.open(selectedHit.url, "_blank", "noopener,noreferrer")
          }
          title="Open result"
          className={iconBtn}
        >
          <ArrowUpRight className="h-3 w-3" />
        </Button>
      )}
      {showScrapeMain && selectedScraped && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() =>
            window.open(selectedScraped.url, "_blank", "noopener,noreferrer")
          }
          title="Open in browser"
          className={iconBtn}
        >
          <ArrowUpRight className="h-3 w-3" />
        </Button>
      )}
    </>
  );

  const hasImages =
    Boolean(selectedScraped?.mainImage) ||
    (selectedScraped?.images?.length ?? 0) > 0;
  const rightActions = (
    <div className="flex items-center gap-0.5">
      {showScrapeMain && selectedScraped && hasImages && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openImages}
          title="View images"
          className={iconBtn}
        >
          <ImageIcon className="h-3 w-3" />
        </Button>
      )}
      {showScrapeMain && selectedScraped && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          title={copied ? "Copied" : "Copy text"}
          className={iconBtn}
        >
          {copied ? (
            <CheckCircle className="h-3 w-3 text-emerald-500" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      )}
      {showScrapeMain && selectedScraped && (
        // Scraped pages don't have a row id in any FE table — the page URL
        // is the canonical key the scraper feature already uses, so it
        // doubles as `source_id` for the RAG ingest (the matching
        // citationHrefFor("scraped") route reverses this with ?url=…).
        <ProcessForRagButton
          sourceKind="scraped"
          sourceId={selectedScraped.url}
          iconOnly
          force
          onComplete={() => {
            toast.success("Page indexed for RAG", {
              action: {
                label: "View in library",
                onClick: () => router.push("/rag/library"),
              },
            });
          }}
        />
      )}
      {(scrapedResults.length > 0 || keywordForm.flatResults.length > 0) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleReset}
          title="Reset"
          className={iconBtn}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );

  const footerContent = (
    <>
      <div className="flex items-center gap-1.5 text-muted-foreground shrink-0">
        {isAnyLoading ? (
          <>
            <Loader2 className="w-3 h-3 animate-spin text-primary" />
            <span className="text-[10px] truncate max-w-[160px]">
              {activeStatus || "Working…"}
            </span>
          </>
        ) : activeError ? (
          <>
            <AlertCircle className="w-3 h-3 text-destructive" />
            <span className="text-[10px] text-destructive/90 truncate max-w-[160px]">
              Error
            </span>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground/80">Ready</span>
        )}
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/70 tabular-nums">
        {mode === "web" && keywordForm.flatResults.length > 0 && (
          <span>{keywordForm.flatResults.length} hits</span>
        )}
        {scrapedResults.length > 0 && (
          <>
            {mode === "web" && keywordForm.flatResults.length > 0 && (
              <span className="text-muted-foreground/30">·</span>
            )}
            <span>
              {scrapedResults.length} page
              {scrapedResults.length !== 1 ? "s" : ""}
            </span>
          </>
        )}
        {selectedScraped && contentLength(selectedScraped) > 0 && (
          <>
            <span className="text-muted-foreground/30">·</span>
            <span>{contentLength(selectedScraped).toLocaleString()} chars</span>
          </>
        )}
      </div>
    </>
  );

  const sidebarContent = (
    <div className="flex flex-col min-h-0 h-full">
      <div className="flex items-center gap-1 p-2 border-b border-border bg-muted/20 shrink-0">
        {/* Display order is a UI choice; the LABELS come from the canonical
            scrape-command module so the button, the agent-facing contract and
            the handler's validation can never disagree about a mode. */}
        {(
          [
            { id: "web", icon: Search },
            { id: "url", icon: Zap },
            { id: "batch", icon: Globe },
          ] as ReadonlyArray<{ id: WorkspaceMode; icon: typeof Search }>
        ).map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-semibold transition-colors",
              mode === id
                ? "bg-primary/15 text-primary border border-primary/35"
                : "bg-muted/40 text-muted-foreground border border-transparent hover:bg-muted",
            )}
          >
            <Icon className="w-3 h-3" />
            {SCRAPE_MODE_BY_WORKSPACE_MODE[id].label}
          </button>
        ))}
      </div>

      {mode === "web" && (
        <div className="flex flex-col flex-1 min-h-0">
          <ScraperKeywordSearchCompactControls form={keywordForm} />
          <ScraperKeywordHitListCompact
            results={keywordForm.flatResults}
            selectedIndex={keywordForm.selectedHitIndex}
            onSelect={(i) => keywordForm.setSelectedHitIndex(i)}
            queryLabel={keywordForm.keywords.trim()}
          />
        </div>
      )}

      {mode === "url" && (
        <div className="flex flex-col flex-1 min-h-0">
          <EditableContextMenu
            {...SCRAPER_CONTEXT_MENU_PROPS}
            getTextarea={() => null}
            getApplicationScope={getConfigApplicationScope}
            onTextReplace={setUrl}
            contextData={contextData}
          >
            <div className="p-2 border-b border-border bg-card/50 shrink-0 space-y-1.5">
              <ProInput
                ref={urlInputRef}
                type="url"
                placeholder="https://…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAnyLoading}
                wrapperClassName="w-full"
                className="h-7 text-xs bg-muted/50 border-border"
              />
              <Button
                size="sm"
                onClick={() => void handleQuickScrape()}
                disabled={!url.trim() || isAnyLoading}
                className="w-full h-7 text-xs gap-1.5"
              >
                {quickApi.isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Zap className="w-3 h-3 text-amber-400" />
                )}
                {quickApi.isLoading ? "Scraping…" : "Scrape"}
              </Button>
            </div>
          </EditableContextMenu>
          <ScrapedSidebarList
            results={scrapedResults}
            scrapeStates={scrapeStates}
            safeIndex={safeScrapedIndex}
            onSelect={(i) => {
              setSelectedScrapedIndex(i);
              setActiveTab("pretty");
            }}
            onRescrape={handleOnDemandScrape}
          />
        </div>
      )}

      {mode === "batch" && (
        <div className="flex flex-col flex-1 min-h-0">
          <EditableContextMenu
            {...SCRAPER_CONTEXT_MENU_PROPS}
            getTextarea={() => null}
            getApplicationScope={getConfigApplicationScope}
            onTextReplace={setKeyword}
            contextData={contextData}
          >
            <div className="p-2 border-b border-border bg-card/50 shrink-0 space-y-1.5">
              <ProInput
                ref={keywordInputRef}
                placeholder="Keyword…"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isAnyLoading}
                wrapperClassName="w-full"
                className="h-7 text-xs bg-muted/50 border-border"
              />
              <Input
                type="number"
                min={PAGE_LIMIT_MIN}
                max={PAGE_LIMIT_MAX}
                value={maxPages}
                onChange={(e) => setMaxPages(e.target.value)}
                disabled={isAnyLoading}
                className="h-7 text-xs border-border px-2"
                placeholder="Pages"
              />
              <Button
                size="sm"
                onClick={() => void handleSearchAndScrape()}
                disabled={!keyword.trim() || isAnyLoading}
                className="w-full h-7 text-xs gap-1.5"
              >
                {batchApi.isLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
                {batchApi.isLoading ? "Working…" : "Search + scrape"}
              </Button>
            </div>
          </EditableContextMenu>
          <ScrapedSidebarList
            results={scrapedResults}
            scrapeStates={scrapeStates}
            safeIndex={safeScrapedIndex}
            onSelect={(i) => {
              setSelectedScrapedIndex(i);
              setActiveTab("pretty");
            }}
            onRescrape={handleOnDemandScrape}
          />
        </div>
      )}
    </div>
  );

  // Read-only results region: right-click offers agent shortcuts + bound
  // agents over the displayed scrape. No text-replace callbacks (read-only);
  // the menu captures the user's live DOM text selection at launch, while
  // `contextData` carries the scraped body + declared SurfaceValues. Page
  // operations (open / copy / images) ride along via extraSections.
  const presentationalExtras = createScraperExtraSections({
    onOpenInBrowser: selectedScraped
      ? () => window.open(selectedScraped.url, "_blank", "noopener,noreferrer")
      : undefined,
    onCopyText: selectedScraped ? () => void handleCopy() : undefined,
    onViewImages: hasImages ? openImages : undefined,
  });

  const mainContent = (
    <>
      {showWebMain && (
        <ScraperKeywordHitDetailCompact
          hit={selectedHit}
          onScrapeUrl={() => void handleScrapeFromWebHit()}
          isScraping={quickApi.isLoading}
          scrapeDisabled={!selectedHit?.url || isAnyLoading}
        />
      )}
      {showScrapeMain && (
        <NonEditableContextMenu
          {...SCRAPER_CONTEXT_MENU_PROPS}
          contextData={contextData}
          extraSections={presentationalExtras}
        >
          {/* DOM wrapper so ContextMenuTrigger (asChild) has a real element to
              attach to — ScrapedResultDetailTabs is a component, not a ref host. */}
          <div className="flex flex-col h-full min-h-0">
            <ScrapedResultDetailTabs
              selected={selectedScraped}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              isBusy={isAnyLoading}
              statusMessage={activeStatus}
              errorMessage={
                quickApi.hasError
                  ? quickApi.error
                  : batchApi.hasError
                    ? batchApi.error
                    : null
              }
            />
          </div>
        </NonEditableContextMenu>
      )}
    </>
  );

  return (
    <SurfaceRuntimeProvider
      surfaceName={SCRAPER_CONTEXT_MENU_PROPS.surfaceName}
      getScope={getConfigApplicationScope}
      isEditable
      getWriteHandlers={getSurfaceWriteHandlers}
    >
      <WindowPanel
        title="Web Scraper"
        width={680}
        height={540}
        minWidth={440}
        minHeight={340}
        onClose={onClose}
        sidebar={sidebarContent}
        sidebarDefaultSize={400}
        sidebarMinSize={250}
        defaultSidebarOpen
        sidebarClassName="bg-muted/10"
        actionsLeft={leftActions}
        actionsRight={rightActions}
        footer={footerContent}
        urlSyncKey="scraper"
        overlayId="scraperWindow"
        onCollectData={() => ({
          mode,
          url,
          keyword: keywordForm.keywords ?? "",
          maxPages: 1,
          results: scrapedResults,
          scrapeStates: {},
          selectedIndex: selectedScrapedIndex,
          activeTab,
        })}
      >
        {mainContent}
      </WindowPanel>
    </SurfaceRuntimeProvider>
  );
}

function ScrapedSidebarList({
  results,
  scrapeStates,
  safeIndex,
  onSelect,
  onRescrape,
}: {
  results: ScraperResult[];
  scrapeStates: Record<number, ScrapeItemState>;
  safeIndex: number;
  onSelect: (i: number) => void;
  onRescrape: (url: string, idx: number) => void;
}) {
  if (results.length === 0) {
    return (
      <div className="flex flex-col flex-1 min-h-0 items-center justify-center p-6 text-muted-foreground/40 text-center">
        <Globe className="w-6 h-6 mb-2 opacity-40" />
        <p className="text-[10px]">No pages yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-2 py-1 border-b border-border/30 bg-muted/20 shrink-0">
        <span className="text-[9px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
          Pages ({results.length})
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
        {results.map((result, index) => {
          const chars = contentLength(result);
          const hasContent = chars > 0;
          const isSelected = safeIndex === index;
          const sState = scrapeStates[index];

          return (
            <div
              key={`${result.url}-${index}`}
              className={cn(
                "border-b border-border/40 transition-colors",
                isSelected
                  ? "bg-primary/8 border-l-2 border-l-primary"
                  : "hover:bg-muted/40 border-l-2 border-l-transparent",
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(index)}
                className="w-full text-left p-2"
              >
                <div className="text-[11px] font-medium text-foreground line-clamp-1 leading-tight">
                  {result.overview?.page_title || `Page ${index + 1}`}
                </div>
                <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5">
                  {getDomain(result.url)}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {hasContent ? (
                    <span className="flex items-center gap-0.5 text-[9px] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      {formatCharCount(chars)}
                    </span>
                  ) : (
                    <span className="flex items-center gap-0.5 text-[9px] text-amber-600 dark:text-amber-400">
                      <AlertCircle className="w-2.5 h-2.5" />
                      empty
                    </span>
                  )}
                  {result.images && result.images.length > 0 && (
                    <span className="text-[9px] text-muted-foreground/50">
                      {result.images.length} img
                    </span>
                  )}
                </div>
              </button>

              {!hasContent && (
                <div className="px-2 pb-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-5 text-[9px]"
                    disabled={sState?.loading}
                    onClick={(e) => {
                      e.stopPropagation();
                      void onRescrape(result.url, index);
                    }}
                  >
                    {sState?.loading ? (
                      <>
                        <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />
                        Scraping…
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-2.5 h-2.5 mr-1" />
                        Retry
                      </>
                    )}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
