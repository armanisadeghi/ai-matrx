"use client";

// features/masterwork/components/detail/RulebookSourcesPanel.tsx
//
// The DUMP Approach's capture surface — "dump everything you have" onto the
// Rulebook, then turn the pile into rules in one run.
//
// Composition, per THE INVENTORY LAW (nothing here is bespoke):
// - `AssociationCaptureToolbar` (features/scopes) — upload / add-existing /
//   create-document / drag-and-drop, the shared capture verbs lifted from the
//   War Room.
// - `UniversalAssociationPicker` (features/scopes) — search-attach across the
//   registered source→rulebook pairs.
// - `WebpageResourcePickerCore` (features/resource-manager) — URL
//   scrape-on-add with an honest preview before anything is stored.
// - `useContainerLinks` — the ONE association read/write path. Every edge is
//   written with role `distillation_source` (registered pairs,
//   `container_side=none`: pure provenance, conveys nothing).
// - `useMasterworkRun` — the durable, rejoinable run over
//   `POST /masterworks/ingest-dump` (canonical stream machinery; survives
//   reload like every other Masterwork run).
//
// URL durability decision: the scrape flow returns an EPHEMERAL
// `PreFetchedUrl` (no registered entity row is created), so URLs are staged
// durably on `rulebook.metadata.dump_url_sources` via a guarded CAS write
// (`writeDumpUrlSources`) and sent to the server as `{kind:"url"}` resources —
// the server re-fetches through the policy-enforcing scraper. The scraped text
// shown here is preview only and is never persisted or sent.

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Hammer,
  Layers,
  Link2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AssociationCaptureToolbar } from "@/features/scopes/components/associations/AssociationCaptureToolbar";
import {
  UniversalAssociationPicker,
  attachedKey,
} from "@/features/scopes/components/associations/UniversalAssociationPicker";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { WebpageResourcePickerCore } from "@/features/resource-manager/resource-picker/WebpageResourcePicker";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";
import type { paths } from "@/types/python-generated/api-types";
import { cn } from "@/lib/utils";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import { writeDumpUrlSources } from "../../service";
import {
  dumpUrlSources,
  type DumpUrlSource,
  type Rulebook,
} from "../../types";

/**
 * The registered source→rulebook pairs (`platform.association_types`,
 * `container_side=none` — provenance only). Attach is open to ALL of them; the
 * tokens the server cannot distill YET are named in `UNSUPPORTED_TOKENS` and
 * their cards say so plainly — attached fine, never silently skipped.
 */
const DUMP_SOURCE_TOKENS: EntityTypeToken[] = [
  "note",
  "transcript",
  "studio_session",
  "file",
  "udt_document",
  "fc_set",
  "research_topic",
  "pc_show",
  "pc_episode",
  "pc_studio_run",
];

/** Server-side distillation not built yet — honest cards, no silent skips. */
const UNSUPPORTED_TOKENS = new Set<string>([
  "research_topic",
  "pc_show",
  "pc_episode",
  "pc_studio_run",
]);

const UNSUPPORTED_NOTE =
  "Attached as a source — distillation for this type is coming.";

/** The edge role every dump source carries. */
const DUMP_ROLE = "distillation_source";

// Endpoint being built in parallel in aidream. Cast pending the OpenAPI type
// sync (precedent: features/marketing/FEATURE.md); until the server deploys it,
// the run fails loudly with the real HTTP error and the staged set survives.
const INGEST_DUMP_PATH = "/masterworks/ingest-dump" as keyof paths;

// ── Run result (per-resource outcomes) ──────────────────────────────────────

interface DumpResourceOutcome {
  kind: "entity" | "url";
  token?: string;
  id?: string;
  url?: string;
  title?: string;
  status: "ok" | "failed" | "unsupported";
  rules_added: number;
  duplicates: number;
  error?: string;
}

interface DumpSummary {
  resources: DumpResourceOutcome[];
  added: number;
  duplicatesSkipped: number;
}

function parseDumpSummary(raw: unknown): DumpSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.resources)) return null;
  const resources: DumpResourceOutcome[] = data.resources.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const rec = item as Record<string, unknown>;
    const status =
      rec.status === "ok" || rec.status === "failed" || rec.status === "unsupported"
        ? rec.status
        : null;
    const kind = rec.kind === "entity" || rec.kind === "url" ? rec.kind : null;
    if (!status || !kind) return [];
    return [
      {
        kind,
        ...(typeof rec.token === "string" ? { token: rec.token } : {}),
        ...(typeof rec.id === "string" ? { id: rec.id } : {}),
        ...(typeof rec.url === "string" ? { url: rec.url } : {}),
        ...(typeof rec.title === "string" ? { title: rec.title } : {}),
        status,
        rules_added: Number(rec.rules_added ?? 0),
        duplicates: Number(rec.duplicates ?? 0),
        ...(typeof rec.error === "string" && rec.error
          ? { error: rec.error }
          : {}),
      },
    ];
  });
  const added =
    typeof data.added === "number"
      ? data.added
      : resources.reduce((n, r) => n + r.rules_added, 0);
  const duplicatesSkipped =
    typeof data.duplicates_skipped === "number"
      ? data.duplicates_skipped
      : resources.reduce((n, r) => n + r.duplicates, 0);
  return { resources, added, duplicatesSkipped };
}

// ── Component ───────────────────────────────────────────────────────────────

export function RulebookSourcesPanel({
  rulebook,
  canEdit,
  autoOpen,
  onRulebookChanged,
  onIngested,
  variant = "card",
  collapsedCapture = false,
  onCount,
}: {
  rulebook: Rulebook;
  canEdit: boolean;
  /** `?dump=1` — the dump Approach card routes here; open + focus the panel. */
  autoOpen: boolean;
  /**
   * `bare` — no card chrome, no collapse, no own title: the panel is rendered
   * INSIDE the Rulebook page's one Sources section, which already draws the
   * border and owns the heading + the full-page door. `card` keeps the
   * standalone `/masterwork/[id]/sources` route unchanged.
   */
  variant?: "card" | "bare";
  /**
   * COLLECT vs INFORMATIONAL (Arman, 2026-08-21): "At first, you need to have
   * this thing that makes it easy to add things. But then once things have
   * been added… it needs to switch to a point where it's now informational."
   * When true, the capture toolbar (upload / link / workspace) starts HIDDEN
   * behind one "Add" click; the list of what's attached and the run button
   * stay visible. `autoOpen` (the ?dump=1 Approach card) still opens it.
   */
  collapsedCapture?: boolean;
  /** Reports how many sources are attached (the parent heading shows it). */
  onCount?: (count: number) => void;
  /** A staged-URL CAS write returned a fresh Rulebook row — adopt it. */
  onRulebookChanged: (rulebook: Rulebook) => void;
  /** The run finished — drafts landed on the Rulebook behind this panel. */
  onIngested: () => void;
}) {
  const bare = variant === "bare";
  const [open, setOpen] = useState(autoOpen || variant === "bare");
  const [captureVisible, setCaptureVisible] = useState(
    autoOpen || !collapsedCapture,
  );
  const [showPicker, setShowPicker] = useState(false);
  const [showUrlAdd, setShowUrlAdd] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const sectionRef = useRef<HTMLDivElement | null>(null);

  // The dump Approach card landed the user here — the panel IS the next step.
  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    setCaptureVisible(true);
    const timer = window.setTimeout(() => {
      sectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [autoOpen]);

  const links = useContainerLinks({
    containerType: "rulebook",
    containerId: rulebook.id,
    orgId: rulebook.organization_id,
  });

  /** Attached dump sources: incoming edges of the registered tokens carrying
   *  the dump role. Other rulebook edges (Scout interviews…) stay invisible. */
  const sourceLinks = useMemo(
    () =>
      DUMP_SOURCE_TOKENS.flatMap((token) =>
        links.linksFor(token).filter((l) => l.role === DUMP_ROLE),
      ),
    // linksFor is stable per render over links' internal edges array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [links.totalCount, links.status, rulebook.id],
  );

  const { titleFor } = useEntityTitles(
    sourceLinks.map((l) => ({
      token: l.token,
      id: l.resourceId,
      label: l.label,
    })),
  );

  const stagedUrls = useMemo(() => dumpUrlSources(rulebook), [rulebook]);
  const totalSources = sourceLinks.length + stagedUrls.length;
  useEffect(() => {
    onCount?.(totalSources);
  }, [totalSources, onCount]);

  const attachedKeys = useMemo(
    () =>
      new Set(sourceLinks.map((l) => attachedKey(l.token, l.resourceId))),
    [sourceLinks],
  );

  const attachSource = useCallback(
    async (
      token: EntityTypeToken,
      resourceId: string,
      label?: string | null,
    ) =>
      links.attach(token, resourceId, label ?? undefined, undefined, {
        role: DUMP_ROLE,
      }),
    [links],
  );

  /** The shared capture toolbar's callback shape (label rides in `opts`). */
  const captureAttach = useCallback(
    async (
      token: EntityTypeToken,
      resourceId: string,
      opts?: { label?: string },
    ) => attachSource(token, resourceId, opts?.label),
    [attachSource],
  );

  const detachSource = useCallback(
    async (token: EntityTypeToken, resourceId: string) =>
      links.detach(token, resourceId, DUMP_ROLE),
    [links],
  );

  // ── Staged URLs (durable on rulebook.metadata, guarded CAS) ──────────────

  const writeUrls = useCallback(
    async (urls: DumpUrlSource[], verb: "add" | "remove"): Promise<boolean> => {
      try {
        const result = await writeDumpUrlSources({ rulebook, urls });
        if (result.status === "saved") {
          onRulebookChanged(result.rulebook);
          return true;
        }
        if (result.status === "conflict") {
          // Fresh row in hand — adopt it and tell the user to redo the gesture
          // against current state rather than silently merging over it.
          onRulebookChanged(result.rulebook);
          toast.error(
            "This Rulebook changed while you were working — it has been refreshed. " +
              (verb === "add"
                ? "Add the link again."
                : "Try removing the link again."),
          );
          return false;
        }
        toast.error("This Rulebook no longer exists.");
        return false;
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not save the link",
        );
        return false;
      }
    },
    [rulebook, onRulebookChanged],
  );

  const stageUrl = useCallback(
    async (url: string, title?: string) => {
      if (stagedUrls.some((s) => s.url === url)) {
        toast.info("That link is already attached as a source.");
        return;
      }
      const next: DumpUrlSource[] = [
        ...stagedUrls,
        {
          url,
          ...(title ? { title } : {}),
          added_at: new Date().toISOString(),
        },
      ];
      const ok = await writeUrls(next, "add");
      if (ok) {
        toast.success("Link attached as a source");
        setShowUrlAdd(false);
      }
    },
    [stagedUrls, writeUrls],
  );

  const removeUrl = useCallback(
    async (url: string) => {
      const ok = await writeUrls(
        stagedUrls.filter((s) => s.url !== url),
        "remove",
      );
      if (ok) toast.success("Link removed");
    },
    [stagedUrls, writeUrls],
  );

  // ── The run: POST /masterworks/ingest-dump (durable, rejoinable) ─────────

  const run = useMasterworkRun<DumpSummary>({
    surface: "dump",
    rulebookId: rulebook.id,
    path: INGEST_DUMP_PATH,
    parseResult: parseDumpSummary,
  });

  // Drafts that landed while the user was away still reach the page. Fired
  // once per result document (never per render — the callback identity may
  // change with the parent).
  const lastResultRef = useRef<DumpSummary | null>(null);
  useEffect(() => {
    if (run.result && run.result !== lastResultRef.current) {
      lastResultRef.current = run.result;
      onIngested();
    }
  }, [run.result, onIngested]);

  useEffect(() => {
    if (run.error) toast.error(run.error);
  }, [run.error]);

  // A rejoined run must be VISIBLE — open the panel it belongs to.
  useEffect(() => {
    if (run.running) setOpen(true);
  }, [run.running]);

  const launchDump = async () => {
    if (totalSources === 0) {
      toast.error("Attach at least one source first.");
      return;
    }
    await run.launch(
      {
        rulebook_id: rulebook.id,
        resources: [
          ...sourceLinks.map((l) => ({
            kind: "entity",
            token: l.token,
            id: l.resourceId,
          })),
          ...stagedUrls.map((s) => ({
            kind: "url",
            url: s.url,
            ...(s.title ? { title: s.title } : {}),
          })),
        ],
        mode: "instructional",
      },
      totalSources === 1 ? "1 source" : `${totalSources} sources`,
    );
  };

  const detachAttached = async (token: string, resourceId: string) => {
    const info = tryGetEntityInfo(token);
    if (!info) return;
    const key = attachedKey(token, resourceId);
    setBusyKey(key);
    try {
      const res = await detachSource(info.token, resourceId);
      if (!res.ok) {
        toast.error(
          `Couldn't detach${res.error ? `: ${res.error}` : ""}`,
        );
      }
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div
      ref={sectionRef}
      className={cn(
        "scroll-mt-16",
        !bare && "rounded-lg border border-border bg-card",
      )}
    >
      {/* ── header (card variant only; the inputs section owns it otherwise) ── */}
      {!bare ? (
        <div className="flex w-full items-center gap-2 pr-4">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-2 px-4 py-3 text-left"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
          >
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <Layers className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="text-sm font-semibold text-foreground">
              Sources
            </span>
            {totalSources > 0 ? (
              <span className="rounded bg-muted px-1.5 text-[11px] font-medium text-muted-foreground">
                {totalSources}
              </span>
            ) : null}
          </button>
          {/* THE DOOR LAW — this working mode has its own URL. */}
          <Link
            href={`/masterwork/${rulebook.id}/sources`}
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Open Sources as its own page"
          >
            <ExternalLink className="h-3 w-3" />
            Full page
          </Link>
        </div>
      ) : null}

      {open ? (
        <div className={cn(bare ? "pt-1" : "border-t border-border px-4 pb-4 pt-3")}>
          {!bare ? (
            <p className="text-xs text-muted-foreground">
              Pile in everything that holds your method — notes, transcripts,
              recordings, research, documents — and just as much the files that
              live OUTSIDE this platform: things exported from Google Drive or
              SharePoint, old SOPs, checklists, training decks. Upload or drop
              them here, attach what already lives in your workspace, or paste
              a link. Then press one button and it all becomes draft rules for
              you to approve.
            </p>
          ) : null}

          {/* ── capture ──────────────────────────────────────────────── */}
          {canEdit && !captureVisible ? (
            <div className="mt-1">
              {totalSources > 0 ? (
                <div className="rounded-md border border-border/60">
                  <SourceRows
                    sourceLinks={sourceLinks}
                    stagedUrls={stagedUrls}
                    titleFor={(token, id, label) =>
                      titleFor({ token, id, label })
                    }
                    status={links.status}
                    error={links.error}
                    busyKey={busyKey}
                    canEdit={canEdit}
                    onDetach={detachAttached}
                    onRemoveUrl={(url) => void removeUrl(url)}
                  />
                </div>
              ) : null}
              <div className="mt-2">
                <Button
                  size="sm"
                  variant={totalSources === 0 ? "outline" : "ghost"}
                  className="h-7"
                  onClick={() => setCaptureVisible(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {totalSources === 0
                    ? "Add your first resource"
                    : "Add more"}
                </Button>
              </div>
            </div>
          ) : null}
          {canEdit && captureVisible ? (
            <div className={cn("rounded-md border border-border/60", !bare && "mt-3")}>
              <AssociationCaptureToolbar
                attach={captureAttach}
                uploadFolderPath="Masterwork/Sources"
                uploadLocationLabel="your Files (Masterwork/Sources)"
                // "Add document" is a strict subset of "From your workspace"
                // below — two buttons for one job is exactly the clutter this
                // section was consolidated to kill.
                showActions={{
                  upload: true,
                  addFile: true,
                  newDocument: true,
                  addDocument: false,
                }}
                filePicker={{
                  title: "Attach files as sources",
                  description:
                    "Pick existing files from your cloud storage — exports from other tools are perfect here.",
                }}
                openCreatedDocument
                extraActions={
                  <>
                    <span className="mx-1 h-4 w-px bg-border" />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowUrlAdd((v) => !v);
                        setShowPicker(false);
                      }}
                      className={cn(
                        "h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground",
                        showUrlAdd && "bg-accent text-foreground",
                      )}
                    >
                      <Globe className="size-3.5" />
                      Add a link
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setShowPicker((v) => !v);
                        setShowUrlAdd(false);
                      }}
                      className={cn(
                        "h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground",
                        showPicker && "bg-accent text-foreground",
                      )}
                    >
                      <Plus className="size-3.5" />
                      From your workspace
                    </Button>
                  </>
                }
              >
                {showUrlAdd ? (
                  <div className="border-b border-border/60 p-2">
                    {/* Scrape-on-add: the Core fetches the page and shows an
                        honest preview before "Add Content" stages the URL. */}
                    <WebpageResourcePickerCore
                      onSelect={(content) =>
                        void stageUrl(content.url, content.title ?? undefined)
                      }
                    />
                  </div>
                ) : null}
                {showPicker ? (
                  <div className="flex max-h-80 flex-col border-b border-border/60 bg-muted/30 p-2">
                    <UniversalAssociationPicker
                      tokens={DUMP_SOURCE_TOKENS}
                      orgId={rulebook.organization_id}
                      attachedKeys={attachedKeys}
                      onAttach={(token, id, title) =>
                        attachSource(token, id, title)
                      }
                      onDetach={(token, id) => detachSource(token, id)}
                    />
                  </div>
                ) : null}

                {/* ── attached sources ─────────────────────────────────── */}
                <SourceRows
                  sourceLinks={sourceLinks}
                  stagedUrls={stagedUrls}
                  titleFor={(token, id, label) =>
                    titleFor({ token, id, label })
                  }
                  status={links.status}
                  error={links.error}
                  busyKey={busyKey}
                  canEdit={canEdit}
                  onDetach={detachAttached}
                  onRemoveUrl={(url) => void removeUrl(url)}
                />
              </AssociationCaptureToolbar>
            </div>
          ) : null}
          {!canEdit ? (
            <div className="mt-3 rounded-md border border-border/60">
              <SourceRows
                sourceLinks={sourceLinks}
                stagedUrls={stagedUrls}
                titleFor={(token, id, label) => titleFor({ token, id, label })}
                status={links.status}
                error={links.error}
                busyKey={null}
                canEdit={false}
                onDetach={() => undefined}
                onRemoveUrl={() => undefined}
              />
            </div>
          ) : null}

          {/* ── the run ──────────────────────────────────────────────── */}
          {canEdit ? (
            <div className="mt-3 space-y-2">
              {run.stages.length > 0 || run.running ? (
                <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
                  {run.stages.map((line, i) => (
                    <p key={i} className="text-xs text-muted-foreground">
                      {line}
                    </p>
                  ))}
                  {run.running ? (
                    <div className="flex items-start gap-2 pt-1">
                      <LoadingSpinner size="sm" />
                      <p className="text-xs text-muted-foreground">
                        {run.status === "rejoining"
                          ? "Picking this back up — it kept working while you were away."
                          : "Working — this takes a minute."}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {run.error ? (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div className="text-xs text-destructive">
                    <p>{run.error}</p>
                    <p className="mt-1 text-muted-foreground">
                      Your attached sources are safe — nothing was lost. Fix
                      the problem (or try again later) and press the button
                      again.
                    </p>
                  </div>
                </div>
              ) : null}

              {run.result ? (
                <DumpOutcomes
                  summary={run.result}
                  onDone={() => run.reset()}
                />
              ) : null}

              {!run.result ? (
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
                  <Button
                    size="sm"
                    className="min-h-10 w-full shrink-0 sm:min-h-0 sm:w-auto"
                    onClick={() => void launchDump()}
                    disabled={run.running || totalSources === 0}
                  >
                    {run.running ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Hammer className="mr-1 h-4 w-4" />
                    )}
                    {run.running ? "Turning it into rules…" : "Turn this into rules"}
                  </Button>
                  {totalSources === 0 ? (
                    <span className="text-xs text-muted-foreground">
                      Attach at least one source first.
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// ── attached-sources list ───────────────────────────────────────────────────

function SourceRows({
  sourceLinks,
  stagedUrls,
  titleFor,
  status,
  error,
  busyKey,
  canEdit,
  onDetach,
  onRemoveUrl,
}: {
  sourceLinks: {
    token: string;
    resourceId: string;
    label: string | null;
  }[];
  stagedUrls: DumpUrlSource[];
  titleFor: (token: string, id: string, label: string | null) => string;
  status: string;
  error: string | null;
  busyKey: string | null;
  canEdit: boolean;
  onDetach: (token: string, resourceId: string) => void | Promise<void>;
  onRemoveUrl: (url: string) => void;
}) {
  if (status === "loading" || status === "idle") {
    return (
      <div className="grid place-items-center p-4">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <p className="p-3 text-xs text-destructive">
        Couldn&apos;t load the attached sources: {error}
      </p>
    );
  }
  if (sourceLinks.length === 0 && stagedUrls.length === 0) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Nothing attached yet. Upload files, attach things from your workspace,
        or paste a link — everything lands here first, so you can see exactly
        what the rules will be distilled from.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border/60">
      {sourceLinks.map((link) => {
        const info = tryGetEntityInfo(link.token);
        const key = attachedKey(link.token, link.resourceId);
        const unsupported = UNSUPPORTED_TOKENS.has(link.token);
        return (
          <li key={key} className="flex items-start gap-2 px-3 py-2">
            {info ? (
              <info.Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Link2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            )}
            <div className="min-w-0 flex-1">
              {/* THE DOOR LAW: the source's name opens it (registry route +
                  peek). New tab — this panel is mid-capture context. */}
              <EntityRef
                token={link.token}
                id={link.resourceId}
                name={titleFor(link.token, link.resourceId, link.label)}
                showIcon={false}
                openInNewTab
                className="text-sm text-foreground"
              />
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2">
                {info ? (
                  <span className="text-[10px] text-muted-foreground">
                    {info.labelPlural}
                  </span>
                ) : null}
                {unsupported ? (
                  <span className="text-[10px] text-amber-600 dark:text-amber-500">
                    {UNSUPPORTED_NOTE}
                  </span>
                ) : null}
              </div>
            </div>
            {canEdit ? (
              <button
                type="button"
                title="Detach this source"
                disabled={busyKey === key}
                onClick={() => void onDetach(link.token, link.resourceId)}
                className="mt-0.5 shrink-0 text-muted-foreground/60 transition-colors hover:text-destructive disabled:opacity-50"
              >
                {busyKey === key ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <X className="size-3.5" />
                )}
              </button>
            ) : null}
          </li>
        );
      })}
      {stagedUrls.map((staged) => (
        <li key={staged.url} className="flex items-start gap-2 px-3 py-2">
          <Globe className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <a
              href={staged.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-sm text-foreground underline-offset-2 hover:underline"
            >
              <span className="truncate">{staged.title || staged.url}</span>
              <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
            </a>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              Link — fetched fresh when the rules are distilled
            </div>
          </div>
          {canEdit ? (
            <button
              type="button"
              title="Remove this link"
              onClick={() => onRemoveUrl(staged.url)}
              className="mt-0.5 shrink-0 text-muted-foreground/60 transition-colors hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

// ── per-resource outcomes after a run ───────────────────────────────────────

function DumpOutcomes({
  summary,
  onDone,
}: {
  summary: DumpSummary;
  onDone: () => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
      <p className="text-sm text-foreground">
        {summary.added} suggested {summary.added === 1 ? "rule" : "rules"} added
        as drafts
        {summary.duplicatesSkipped
          ? `, ${summary.duplicatesSkipped} duplicates skipped`
          : ""}
        .
      </p>
      <ul className="space-y-1">
        {summary.resources.map((res, i) => {
          const name =
            res.title ||
            (res.kind === "url" ? res.url : undefined) ||
            (res.token && res.id ? undefined : "Source");
          return (
            <li key={i} className="flex items-start gap-2 text-xs">
              <span
                className={cn(
                  "mt-1 size-1.5 shrink-0 rounded-full",
                  res.status === "ok"
                    ? "bg-emerald-500"
                    : res.status === "failed"
                      ? "bg-destructive"
                      : "bg-amber-500",
                )}
              />
              <div className="min-w-0 flex-1">
                {res.kind === "entity" && res.token && res.id ? (
                  <EntityRef
                    token={res.token}
                    id={res.id}
                    name={res.title ?? null}
                    showIcon={false}
                    openInNewTab
                    className="text-xs text-foreground"
                  />
                ) : res.kind === "url" && res.url ? (
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    {name}
                  </a>
                ) : (
                  <span className="text-foreground">{name}</span>
                )}
                <span className="ml-1.5 text-muted-foreground">
                  {res.status === "ok"
                    ? `${res.rules_added} ${res.rules_added === 1 ? "rule" : "rules"}` +
                      (res.duplicates ? `, ${res.duplicates} duplicates` : "")
                    : res.status === "unsupported"
                      ? "not distilled — this type isn't supported yet"
                      : `failed${res.error ? ` — ${res.error}` : ""}`}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <Button size="sm" onClick={onDone}>
        Review the drafts
      </Button>
    </div>
  );
}
