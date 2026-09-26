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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/utils/supabase/client";
import { readFileSizesByIds } from "@/features/files/filesDb";
import {
  fileSourceSizeLabel,
  EMPTY_FILE_SIZE_LABEL,
} from "./fileSourceSizeLabel";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Globe,
  Hammer,
  Layers,
  Library,
  Link2,
  Loader2,
  Plus,
  X,
} from "lucide-react";
import { toast } from "@/lib/toast";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { clearUploadEntry, uploadFiles } from "@/features/files/redux/thunks";
import { selectFailedUploadsForFolderPath } from "@/features/files/redux/selectors";
import type { UploadState } from "@/features/files/types";
import { Button } from "@/components/ui/button";
import {
  firstBlockingReason,
  GatedActionButton,
} from "@/components/official/GatedActionButton";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { AssociationCaptureToolbar } from "@ai-matrx/associations/react";
import {
  UniversalAssociationPicker,
  attachedKey,
} from "@ai-matrx/associations/react";
import { useContainerLinks } from "@/features/scopes/hooks/useContainerLinks";
import {
  DUMP_ROLE,
  DUMP_SOURCE_TOKENS,
  tallyOf,
  attachedIdentities,
  useKeptSourceCount,
  type KeptSourceCount,
} from "../../sourceLinks";
import { keptSourceTitle } from "../../kept-sources/types";
import type { KeptSourceBrief } from "../../kept-sources/service";
import { isInterviewMaterial, keptIdentity } from "../../sourceIdentity";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { WebpageResourcePickerCore } from "@/features/resource-manager/resource-picker/WebpageResourcePicker";
import type { EntityTypeToken } from "@ai-matrx/associations";
import type { paths } from "@/types/python-generated/api-types";
import { cn } from "@/lib/utils";
import { humanFailureSentence } from "@/lib/progress/failureSentence";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import {
  countRulesForSource,
  entitySourceKey,
  sourceSectionYields,
  urlSourceKey,
  type SourceSectionYield,
} from "../../sourceSections";
import { writeDumpUrlSources } from "../../service";
import { HeldOutCasesSection } from "./HeldOutCasesSection";
import { dumpUrlSources, type DumpUrlSource, type Rulebook } from "../../types";
import type { PastedSourceMetadata } from "../../record/pastedSource";
import { DurableRunFailure } from "@/lib/durable-run/DurableRunFailure";
import { DurableRunInterruption } from "@/lib/durable-run/DurableRunInterruption";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { RunStages } from "../RunStages";
import { useLaunchGate } from "@/lib/launch-gate/useLaunchGate";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

/**
 * The registered source→rulebook pairs live in ONE place — `../../sourceLinks`
 * — because the interview start screen asks the same question this panel
 * answers ("does this Rulebook have anything written down?") to decide which
 * interviewer the Expert gets. Attach is open to ALL of them; the tokens the
 * server cannot distill YET are named in `UNSUPPORTED_TOKENS` below and their
 * cards say so plainly — attached fine, never silently skipped.
 */

/** Server-side distillation not built yet — honest cards, no silent skips. */
const UNSUPPORTED_TOKENS = new Set<string>([
  "research_topic",
  "pc_show",
  "pc_episode",
  "pc_studio_run",
]);

const UNSUPPORTED_NOTE =
  "Attached as a source — distillation for this type is coming.";


// Endpoint being built in parallel in aidream. Cast pending the OpenAPI type
// sync (precedent: features/marketing/FEATURE.md); until the server deploys it,
// the run fails loudly with the real HTTP error and the staged set survives.
const INGEST_DUMP_PATH = "/masterworks/ingest-dump" as keyof paths;

// ── Run result (per-resource outcomes) ──────────────────────────────────────

/**
 * 🚨 EVERY OUTCOME THE SERVER SENT GETS A ROW — including the ones this file
 * had never heard of.
 *
 * `status` was a closed union of three, and `parseDumpSummary` DROPPED any row
 * whose status was not one of them. `already_distilled` has been a real server
 * status for weeks and vanished from every summary silently; the honest-empty
 * outcome (`ok` + `note`, aidream 1c9edb934c) would have vanished the same way
 * the moment it shipped. A row the screen cannot classify is still a row the
 * person handed over, so it is rendered by name rather than deleted
 * (VERIFICATION.md §9.6, 2026-09-18).
 */
type DumpOutcomeStatus =
  | "ok"
  | "failed"
  | "unsupported"
  | "already_distilled"
  | (string & {});

interface DumpResourceOutcome {
  kind: "entity" | "url" | "kept_source" | (string & {});
  token?: string;
  id?: string;
  url?: string;
  title?: string;
  status: DumpOutcomeStatus;
  rules_added: number;
  duplicates: number;
  error?: string;
  /**
   * THE THIRD OUTCOME. A source that was read end to end and held nothing
   * rule-worthy comes back `ok` with zero rules and the distiller's own
   * sentence here — never `failed`, because it did not fail. Rendering "0
   * rules" without this sentence leaves the person guessing which of the two
   * it was, which is the whole of what this field is for.
   */
  note?: string;
  /** The server's sentence for a source this Rulebook had already read. */
  alreadyDistilled?: string;
  /**
   * 🚨 A `kept_source` ROW'S ONLY IDENTITY ON THIS WIRE. `token`/`id`/`url`
   * are all null for material the Rulebook already holds, so a refused kept
   * source could not be rebuilt into a request and the panel could not offer
   * to read it again — while the server's own sentence told the person to
   * choose exactly that (cold walk 13, N7). Echoed by `dump_ingest.py`.
   */
  sourceKey?: string;
  /**
   * How many DRAFTS the earlier pass left that a replace would throw away.
   * Present only with `alreadyDistilled`, and zero means there is nothing to
   * replace — so no control is drawn and the sentence does not offer one.
   */
  replaceableDrafts?: number;
}

export interface DumpSummary {
  resources: DumpResourceOutcome[];
  added: number;
  duplicatesSkipped: number;
}

export function parseDumpSummary(raw: unknown): DumpSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  if (!Array.isArray(data.resources)) return null;
  const resources: DumpResourceOutcome[] = data.resources.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const rec = item as Record<string, unknown>;
    // Any non-empty status and kind the server sent, whatever they are. The
    // renderer below says what it knows and names what it does not; it never
    // drops the row (see `DumpResourceOutcome`).
    const status = typeof rec.status === "string" && rec.status ? rec.status : null;
    const kind = typeof rec.kind === "string" && rec.kind ? rec.kind : null;
    if (!status || !kind) return [];
    const alreadyRec =
      rec.already_distilled &&
      typeof rec.already_distilled === "object" &&
      !Array.isArray(rec.already_distilled)
        ? (rec.already_distilled as Record<string, unknown>)
        : null;
    const already =
      alreadyRec && typeof alreadyRec.message === "string"
        ? (alreadyRec.message as string)
        : null;
    // `can_replace` is the server's own verdict (an APPROVED rule is never
    // removed by a machine, so a source whose earlier rules are all approved
    // has nothing a replace could take). The panel obeys it rather than
    // inferring one, and draws no control when it says no.
    const replaceableDrafts =
      alreadyRec && alreadyRec.can_replace === true
        ? Number(alreadyRec.draft_rules ?? 0)
        : 0;
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
        ...(typeof rec.note === "string" && rec.note ? { note: rec.note } : {}),
        ...(typeof rec.source_key === "string" && rec.source_key
          ? { sourceKey: rec.source_key }
          : {}),
        ...(already ? { alreadyDistilled: already } : {}),
        ...(replaceableDrafts > 0 ? { replaceableDrafts } : {}),
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

/**
 * 🚨 THE ONE PLACE THE RUN'S PAYLOAD IS BUILT, and the one place the keys the
 * person can SEE are named. They are the same function's two halves on
 * purpose: "the run launches with the set on screen" is only checkable while
 * both come out of one definition.
 *
 * `launchKey` is what `useLaunchGate` waits for. It is the ATTACHMENT's
 * identity (token + resource id, or the staged URL), not the distillation
 * source key — a link that has been written but has not reached this render is
 * exactly the thing being detected.
 */
export function launchKeyForEntity(token: string, resourceId: string): string {
  return attachedKey(token, resourceId);
}

export function launchKeyForUrl(url: string): string {
  return `staged-url:${(url ?? "").trim()}`;
}

export interface DumpPayloadInput {
  sourceLinks: readonly {
    token: string;
    resourceId: string;
    label: string | null;
  }[];
  stagedUrls: readonly DumpUrlSource[];
  keptRows: readonly { source_key: string; label?: string | null }[];
  titleFor: (token: string, id: string, label: string | null) => string;
}

/** Every key the person can see on this panel right now. */
export function visibleLaunchKeys(
  input: Pick<DumpPayloadInput, "sourceLinks" | "stagedUrls">,
): Set<string> {
  return new Set<string>([
    ...input.sourceLinks.map((l) => launchKeyForEntity(l.token, l.resourceId)),
    ...input.stagedUrls.map((s) => launchKeyForUrl(s.url)),
  ]);
}

/**
 * THE SOURCE IDENTITY the SERVER will give an attached resource
 * (`aidream/services/distillation/source_identity.py`): an uploaded file is
 * `file:<id>` whether it arrives as `{token: "file", id}` or as the file lane's
 * own `file_id`; any other entity is `entity:<token>:<id>`.
 *
 * Mirrored here — the one thing this client needs in order to know that an
 * attached source and a kept Source are the SAME material.
 */
export function serverSourceKeyForEntity(token: string, id: string): string {
  const t = (token ?? "").trim().toLowerCase();
  const value = (id ?? "").trim();
  return t === "file" ? `file:${value}` : `entity:${t}:${value}`;
}

/** The same, for a staged URL: scheme + host case and one trailing slash. */
export function serverSourceKeyForUrl(url: string): string {
  const raw = (url ?? "").trim();
  if (!raw) return "";
  const parts = raw.split("://");
  let normalized = raw;
  if (parts.length > 1) {
    const [scheme, ...restParts] = parts;
    const rest = restParts.join("://");
    const slash = rest.indexOf("/");
    const host = slash === -1 ? rest : rest.slice(0, slash);
    const tail = slash === -1 ? "" : rest.slice(slash);
    normalized = `${(scheme ?? "").toLowerCase()}://${host.toLowerCase()}${tail}`;
  }
  if (normalized.endsWith("/") && (normalized.match(/\//g)?.length ?? 0) > 2) {
    normalized = normalized.slice(0, -1);
  }
  return normalized;
}

/**
 * The `resources` array `POST /masterworks/ingest-dump` is handed.
 *
 * 🚨 ONE RESOURCE PER SOURCE — THE CONTRADICTORY PAIR IS IMPOSSIBLE HERE, NOT
 * PAPERED OVER DOWNSTREAM (twelfth cold walk, 2026-09-20, D3).
 *
 * A Rulebook's dump is the union of what somebody POINTED us at (the attached
 * edges and staged URLs) and what we HAVE (every kept Source). Those two sets
 * OVERLAP the moment a file has been read once: `file_ingest.py` claims
 * `file:<id>` as a kept Source before it spends, so the second press sent the
 * same photo twice — once as `entity/file/<id>`, once as `kept_source`/
 * `file:<id>`. The fan-out ran it twice, charged twice, and the two attempts
 * disagreed, which is how one panel came to show
 * `04_field_sheet_photo.png: … failed` and `04_field_sheet_photo.png: 3 draft
 * rule(s) added.` beside each other over thirteen rows for six files.
 *
 * So a kept Source whose identity is already attached is DROPPED here. The
 * attached edge wins because it is the one the person can see and remove.
 */
export function dumpResources(
  input: DumpPayloadInput,
): Record<string, unknown>[] {
  const attachedSourceKeys = new Set<string>([
    ...input.sourceLinks.map((l) =>
      serverSourceKeyForEntity(l.token, l.resourceId),
    ),
    ...input.stagedUrls.map((s) => serverSourceKeyForUrl(s.url)),
  ]);
  const keptRows = input.keptRows.filter(
    (k) => !attachedSourceKeys.has((k.source_key ?? "").trim()),
  );
  return [
    ...input.sourceLinks.map((l) => ({
      kind: "entity",
      token: l.token,
      id: l.resourceId,
      // Without this the server's progress line falls back to the
      // raw entity_types token + id fragment (e.g. "udt_document
      // 271abcae") for a pasted document — link resources never hit
      // this because capture_page always returns a page title.
      title: input.titleFor(l.token, l.resourceId, l.label),
    })),
    ...input.stagedUrls.map((s) => ({
      kind: "url",
      url: s.url,
      ...(s.title ? { title: s.title } : {}),
    })),
    // Material we already hold needs no resolver — the server reads the
    // row. `source_key` IS the rule identity, so a kept email distilled
    // here and the same email distilled by any other door are ONE
    // source: the re-distill guard fires and the rules point back to the
    // stored passage.
    ...keptRows.map((k) => ({
      kind: "kept_source",
      source_key: k.source_key,
      ...(k.label ? { title: k.label } : {}),
    })),
  ];
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
      sectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [autoOpen]);

  const links = useContainerLinks({
    containerType: "rulebook",
    containerId: rulebook.id,
    orgId: rulebook.organization_id,
  });

  /**
   * 🚨 THE FIFTEEN FILES THAT WERE NEVER SUBMITTED (VERIFICATION.md §9.1).
   *
   * Every write that shapes this panel's payload — an attach from the toolbar's
   * serial upload loop, an attach from the workspace picker, a staged link's
   * CAS write, a detach — runs through this gate, and the run button is gated
   * on it. Before this, seventeen files attached ~0.3 s apart and a click
   * 0.9 s into that loop launched with the three that had landed.
   */
  const gate = useLaunchGate();

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

  /**
   * WHAT A PASTED SOURCE SAYS ABOUT ITSELF (census D5). A note the Expert
   * attached by hand is just a note; a note the paste lane kept carries
   * `pasted` + `source_key` on its edge, and every rule distilled from that
   * text carries the SAME key in `source_ref.source` — so the count below is
   * read from the live rules, never frozen into metadata at write time.
   */
  const detailForLink = useCallback(
    (metadata: unknown): string | null => {
      const meta = (metadata ?? {}) as Partial<PastedSourceMetadata>;
      if (!meta.pasted) return null;
      const bits: string[] = ["Pasted"];
      if (meta.pasted_at) {
        const when = new Date(meta.pasted_at);
        if (!Number.isNaN(when.getTime())) {
          bits.push(
            when.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            }),
          );
        }
      }
      if (meta.words)
        bits.push(
          `${meta.words.toLocaleString()} ${meta.words === 1 ? "word" : "words"}`,
        );
      if (meta.source_key) {
        // THE ONE JOIN (../../sourceSections) — the same predicate the kept
        // Sources list counts with, so two screens can never disagree about
        // how many rules one source produced.
        const produced = countRulesForSource(
          rulebook.rules,
          meta.source_key,
        );
        bits.push(
          produced === 1 ? "1 rule so far" : `${produced} rules so far`,
        );
      }
      return bits.join(" · ");
    },
    [rulebook.rules],
  );

  /**
   * File sizes for the Resources card (VERIFICATION.md §12, 2026-09-18): a
   * zero-byte upload rendered identically to a real one — filename + bare
   * "Files" subtitle, no size, no "(empty)". `readFileSizesByIds` is a
   * direct RLS-authorized Supabase read (no server round trip needed for a
   * handful of size_bytes columns); `fileSourceSizeLabel` turns a result
   * into the honest subtitle, including calling out an empty file plainly.
   */
  const fileSourceIds = useMemo(
    () =>
      sourceLinks
        .filter((l) => l.token === "file")
        .map((l) => l.resourceId),
    [sourceLinks],
  );
  const [fileSizesById, setFileSizesById] = useState<
    Map<string, number | null>
  >(new Map());
  useEffect(() => {
    if (fileSourceIds.length === 0) return;
    // Only fetch ids we haven't resolved yet — sizes don't change once a
    // file has landed, so this never re-fetches ids already in state.
    const missing = fileSourceIds.filter((id) => !fileSizesById.has(id));
    if (missing.length === 0) return;
    let cancelled = false;
    void readFileSizesByIds(supabase, missing).then((sizes) => {
      if (cancelled) return;
      setFileSizesById((prev) => {
        const next = new Map(prev);
        for (const id of missing) {
          next.set(id, sizes.get(id) ?? null);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [fileSourceIds, fileSizesById]);
  const sizeForLink = useCallback(
    (token: string, resourceId: string): string | null => {
      if (token !== "file") return null;
      return fileSourceSizeLabel(fileSizesById.get(resourceId));
    },
    [fileSizesById],
  );

  const stagedUrls = useMemo(() => dumpUrlSources(rulebook), [rulebook]);

  /**
   * 🚨 THE OTHER HALF OF THIS RULEBOOK'S SOURCES (2026-09-18, D7).
   *
   * Attached edges and staged URLs are what somebody POINTED us at. Kept
   * Sources are what we HAVE — everything that came through
   * `raw_material.keep`: an export selection, a send from a Library, an
   * extension capture, an interview's turns. This panel counted only the
   * first half, so a Rulebook holding 50 of a person's own emails showed them
   * "Add your first resource / Attach at least one source first" on both
   * tabs. The addition happens in ONE place (`tallyOf`) that the interview
   * start screen and the ingest gate share, so no two screens can disagree
   * about whether this Rulebook has anything.
   */
  const kept = useKeptSourceCount(rulebook.id);
  const keptRows = kept.state === "ready" ? kept.rows : [];
  /**
   * 🚨 RESOURCES ARE NOT INTERVIEWS (cold walk 13, N4). An interview's kept
   * row is the same sitting the Interviews block above already names, counts
   * and links — listing it here printed one four-turn interview twice under
   * two headings with two different word counts (505 of her own words up
   * there, 1,056 for the whole sitting down here). The Approach that captured
   * it says which block owns it.
   */
  const keptResources = useMemo(
    () => keptRows.filter((row) => !isInterviewMaterial(row)),
    [keptRows],
  );
  const keptInterviews = keptRows.length - keptResources.length;
  const { count: totalSources, tally } = tallyOf(
    attachedIdentities({ sourceLinks, stagedUrls }),
    keptResources,
    (kept.state === "ready" ? kept.count : 0) - keptInterviews,
  );
  /**
   * The kept rows this panel LISTS: the ones no attachment row below already
   * shows. A file is one source whether it is named by its edge or by its kept
   * row, so showing it in both lists is the screen disagreeing with itself.
   */
  const keptOnly = useMemo(() => {
    const shown = new Set(attachedIdentities({ sourceLinks, stagedUrls }));
    return keptResources.filter((row) => !shown.has(keptIdentity(row)));
  }, [keptResources, sourceLinks, stagedUrls]);
  useEffect(() => {
    onCount?.(totalSources);
  }, [totalSources, onCount]);

  const attachedKeys = useMemo(
    () => new Set(sourceLinks.map((l) => attachedKey(l.token, l.resourceId))),
    [sourceLinks],
  );

  /**
   * 🚨 THE UPLOAD THAT FAILED, LEFT WITHOUT A HOME (2026-09-19 silent failure —
   * `common-docs/projects/acquisition-frontier/own-files/VERIFICATION.md` §18
   * claim 1b). A 400 on a fresh Rulebook's upload said the real reason ONLY in
   * a toast, which is gone by the time anyone looks back at the card — and the
   * card kept reading "Nothing attached yet" before, during and after. The
   * association edge (`sourceLinks`) only exists for a file that LANDED, so a
   * failure needs a home outside that edge list: `state.cloudFiles.uploads`
   * already tracks every upload's outcome by requestId and never auto-clears
   * an `error` entry (see `clearCompletedUploads`), so it survives exactly as
   * long as this fix needs it to. `sourcesFolderPath` is unique to THIS
   * Rulebook, so it also doubles as the correlation key: it is handed to the
   * capture toolbar below as `uploadFolderPath`, and read back here.
   */
  const sourcesFolderPath = useMemo(
    () => `Masterwork/Sources/${rulebook.id}`,
    [rulebook.id],
  );
  const dispatch = useAppDispatch();
  const failedUploads = useAppSelector((state) =>
    selectFailedUploadsForFolderPath(state, sourcesFolderPath),
  );
  const [retryingUploadId, setRetryingUploadId] = useState<string | null>(
    null,
  );

  const attachSource = useCallback(
    async (token: EntityTypeToken, resourceId: string, label?: string | null) =>
      gate.track(
        () =>
          links.attach(token, resourceId, label ?? undefined, undefined, {
            role: DUMP_ROLE,
          }),
        {
          key: attachedKey(token, resourceId),
          landed: (result) => result.ok,
        },
      ),
    [links, gate],
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

  /**
   * "Retry" hands the person a file picker for the ONE file that failed —
   * never a re-run of the same bytes against the same 400, and never a
   * silent no-op. Success uploads the freshly-picked file to this
   * Rulebook's own folder, attaches it exactly as the toolbar's own upload
   * path does, and only THEN clears the stale failed row. A retry that fails
   * again is not swallowed: `uploadFiles` tracks its own fresh failed entry
   * under this same `sourcesFolderPath`, so the new reason takes the old
   * row's place on the next render — it is never dropped on the floor.
   */
  const retryFailedUpload = useCallback(
    async (upload: UploadState, file: File) => {
      setRetryingUploadId(upload.requestId);
      try {
        const result = await dispatch(
          uploadFiles({
            files: [file],
            folderPath: sourcesFolderPath,
            visibility: "personal",
          }),
        ).unwrap();
        const fileId = result.uploaded[0];
        if (fileId) {
          await attachSource("file", fileId);
        }
      } catch (err) {
        // The thunk itself only rejects on something outside a per-file
        // outcome (e.g. the store isn't ready) — a real upload failure
        // resolves normally with `failed` populated and is announced above.
        toast.error(
          err instanceof Error ? err.message : "Couldn't retry the upload",
        );
      } finally {
        // The old attempt's row is always retired here — a fresh failure
        // from the retry above already wrote its OWN row before this runs.
        dispatch(clearUploadEntry({ requestId: upload.requestId }));
        setRetryingUploadId(null);
      }
    },
    [dispatch, sourcesFolderPath, attachSource],
  );

  const dismissFailedUpload = useCallback(
    (requestId: string) => {
      dispatch(clearUploadEntry({ requestId }));
    },
    [dispatch],
  );

  const detachSource = useCallback(
    async (token: EntityTypeToken, resourceId: string) => {
      const result = await gate.track(() =>
        links.detach(token, resourceId, DUMP_ROLE),
      );
      // The person took it back off the pile — stop waiting for it to appear.
      if (result.ok) gate.forget(attachedKey(token, resourceId));
      return result;
    },
    [links, gate],
  );

  // ── Staged URLs (durable on rulebook.metadata, guarded CAS) ──────────────

  const writeUrls = useCallback(
    async (
      urls: DumpUrlSource[],
      verb: "add" | "remove",
      expectKey?: string,
    ): Promise<boolean> => {
      try {
        // The staged-link CAS write shapes the SAME payload the run sends, so
        // it closes the same gate an attach does.
        const result = await gate.track(
          () => writeDumpUrlSources({ rulebook, urls }),
          expectKey
            ? { key: expectKey, landed: (r) => r.status === "saved" }
            : undefined,
        );
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
    [rulebook, onRulebookChanged, gate],
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
      const ok = await writeUrls(next, "add", launchKeyForUrl(url));
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
      if (ok) {
        gate.forget(launchKeyForUrl(url));
        toast.success("Link removed");
      }
    },
    [stagedUrls, writeUrls, gate],
  );

  /**
   * What the person can see right now, and what the gate is still waiting for.
   * `missing` is the second half of the §9.1 repair: an attach can RESOLVE
   * before its row reaches this render, and a launch in that window is the same
   * silent prefix by another route. When it happens the panel re-reads the
   * edges rather than sitting on a stale list.
   */
  const visibleKeys = useMemo(
    () => visibleLaunchKeys({ sourceLinks, stagedUrls }),
    [sourceLinks, stagedUrls],
  );
  const missingKeys = gate.missingFrom(visibleKeys);
  const missingCount = missingKeys.length;
  /** "Attaching 14 sources…" / "Catching up…" / null when the pile is whole. */
  const attachingLabel = gate.busyLabel(visibleKeys);
  useEffect(() => {
    if (gate.pending > 0 || missingCount === 0) return;
    const timer = window.setTimeout(() => void links.reload(), 250);
    return () => window.clearTimeout(timer);
    // `links.reload` is stable per container; re-running on every render would
    // be a read loop rather than a reconcile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate.pending, missingCount, rulebook.id]);

  // ── The run: POST /masterworks/ingest-dump (durable, rejoinable) ─────────

  // 🚨 THE PROMISE IS THIS PILE'S, NOT THE LANE'S.
  //
  // This is the exact screen the 2026-09-17 verification watched: one 558 KB
  // EPUB and a pile of nineteen files were both told "this usually takes about
  // 2 minutes" because the estimate was a per-lane constant. It is now the
  // measured per-resource rate (`DUMP_INGEST_RATE`) applied to what is really
  // attached, overlapped by the server's own `resource_fan_out` cap.
  const dumpSize = useMemo(() => ({ items: totalSources }), [totalSources]);

  const run = useMasterworkRun<DumpSummary>({
    surface: "dump",
    rulebookId: rulebook.id,
    path: INGEST_DUMP_PATH,
    parseResult: parseDumpSummary,
    size: dumpSize,
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

  /**
   * The exact `resources` array the last launch sent, index-aligned with the
   * outcome rows the server returns. A ref, not state: nothing renders from
   * it, and a reload legitimately loses it (a rejoined run's retry falls back
   * to rebuilding from the outcome row itself).
   */
  const launchedResourcesRef = useRef<Record<string, unknown>[] | null>(null);

  const launchDump = async () => {
    // Gated on the button, which names the missing precondition instead of
    // sitting dark (it was `disabled` with nothing said) and instead of
    // firing a red toast at a person who has simply not attached anything
    // yet (class sweep, 2026-09-16).
    if (totalSources === 0) return;
    // 🚨 THE HARD GATE, not just the button's. A click that arrives in the
    // same tick as the last attach must not squeeze past a re-render, and a
    // keyboard activation reaches this function directly. It refuses out loud
    // rather than distilling a prefix of the person's pile.
    const blocked = gate.blockingReason(visibleKeys);
    if (blocked) {
      toast.info(blocked);
      return;
    }
    const resources = dumpResources({
      sourceLinks,
      stagedUrls,
      keptRows,
      titleFor: (token, id, label) => titleFor({ token, id, label }),
    });
    // What was actually sent, kept so a failed row can be re-read ON ITS OWN.
    // `dump_ingest.py` writes `outcomes[index]`, so the summary's `resources`
    // are index-aligned with this array — the only way to rebuild a
    // `kept_source` row's request, which carries no `source_key` on the wire.
    launchedResourcesRef.current = resources;
    await run.launch(
      {
        rulebook_id: rulebook.id,
        resources,
        mode: "instructional",
      },
      resources.length === 1 ? "1 source" : `${resources.length} sources`,
    );
  };

  /**
   * 🚨 THE WAY OUT OF ONE FAILED SOURCE (twelfth cold walk, D2). A failed row
   * used to offer nothing, so the only remedy was pressing the whole pile
   * again — paying a second time for every source that had already worked.
   * This reads exactly the one source the person pressed and nothing else.
   *
   * No confirmation dialog: the row it appears on ADDED NOTHING, so there is
   * nothing to lose or duplicate, and putting friction in front of the way out
   * of a failure is the defect wearing a seatbelt.
   */
  const retryOneSource = useCallback(
    (index: number, res: DumpResourceOutcome): void => {
      const resource =
        launchedResourcesRef.current?.[index] ?? retryResourceFor(res);
      if (!resource) {
        // Structurally unreachable — `DumpOutcomes` draws no control when
        // `retryResourceFor` returns null and nothing was remembered — but a
        // dead click is never the answer if it ever is reachable.
        toast.info(
          "This source can only be read again with the rest of the pile — press “Turn this into rules” once more.",
        );
        return;
      }
      launchedResourcesRef.current = [resource];
      void run.launch(
        {
          rulebook_id: rulebook.id,
          resources: [resource],
          mode: "instructional",
        },
        "1 source",
      );
    },
    [run, rulebook.id],
  );

  /**
   * "Distil again and replace" — the other half of the refusal sentence.
   *
   * The server already had the whole mechanism (`redistill: "replace"`, the
   * same one "Read this part again" uses); what it did not have was a control,
   * so its own message told a person to choose something that was not on the
   * screen (cold walk 13, N7). Approved rules are never removed by a machine —
   * the server keeps them and says so — and the confirm names exactly what
   * goes: the drafts of THIS source, and an AI run that costs money.
   */
  const distilAgainAndReplace = useCallback(
    (index: number, res: DumpResourceOutcome): void => {
      const resource =
        launchedResourcesRef.current?.[index] ?? retryResourceFor(res);
      if (!resource) return;
      const drafts = res.replaceableDrafts ?? 0;
      const name = res.title || "this source";
      void (async () => {
        const ok = await confirm({
          title: `Read “${name}” again and replace its drafts?`,
          description:
            `This reads the whole source again — an AI run you pay for. Its ` +
            `${drafts} suggested ${drafts === 1 ? "rule" : "rules"} that you ` +
            `have not approved will be thrown away and replaced by the new ` +
            `pass. Rules you have already approved are kept.`,
          confirmLabel: "Distil again and replace",
        });
        if (!ok) return;
        launchedResourcesRef.current = [resource];
        void run.launch(
          {
            rulebook_id: rulebook.id,
            resources: [resource],
            mode: "instructional",
            redistill: "replace",
          },
          `${name} — read again`,
        );
      })();
    },
    [run, rulebook.id],
  );

  /**
   * 🚨 WHAT EACH PART OF A SOURCE GAVE (W42). Read off the live rules, so a
   * source distilled weeks ago is as legible as one distilled a minute ago.
   */
  const sectionsFor = useCallback(
    (sourceKey: string) => sourceSectionYields(rulebook.rules, sourceKey),
    [rulebook.rules],
  );

  /**
   * "Read this part again" — ONE part of ONE source, at half the width the
   * first pass used, replacing only THAT part's drafts (the server's
   * `only_section` + the existing replace path). The rest of the source, and
   * everything the Expert has already approved, is untouched.
   */
  const redistillSection = useCallback(
    async (
      resource: Record<string, unknown>,
      section: SourceSectionYield,
      label: string,
    ) => {
      await run.launch(
        {
          rulebook_id: rulebook.id,
          resources: [resource],
          mode: "instructional",
          redistill: "replace",
          only_section: section.index,
        },
        `${label} — ${section.label}`,
      );
    },
    [run, rulebook.id],
  );

  const detachAttached = async (token: string, resourceId: string) => {
    const info = tryGetEntityInfo(token);
    if (!info) return;
    const key = attachedKey(token, resourceId);
    setBusyKey(key);
    try {
      const res = await detachSource(info.token, resourceId);
      if (!res.ok) {
        toast.error(`Couldn't detach${res.error ? `: ${res.error}` : ""}`);
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
            // A door, not prose: opt into the subtree touch floor (globals.css).
            data-tap-target
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Open Sources as its own page"
             target="_blank"
             rel="noopener noreferrer"
           >
            <ExternalLink className="h-3 w-3" />
            Full page
          </Link>
          {/* The other half of this feature, and a different question: this
              panel is what we are ABOUT to read; that page is what we KEPT —
              the Expert's own words, still readable after the rules were drawn
              out of them. Without this door the kept material is reachable only
              by typing a URL. */}
          <Link
            href={`/masterwork/${rulebook.id}/sources/kept`}
            data-tap-target
            className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="Read the material this Rulebook kept"
          >
            <Library className="h-3 w-3" />
            Kept material
          </Link>
        </div>
      ) : null}

      {open ? (
        <div
          className={cn(
            bare ? "pt-1" : "border-t border-border px-4 pb-4 pt-3",
          )}
        >
          {!bare ? (
            <p className="text-xs text-muted-foreground">
              Pile in everything that holds your method — notes, transcripts,
              recordings, research, documents — and just as much the files that
              live OUTSIDE this platform: things exported from Google Drive or
              SharePoint, old SOPs, checklists, training decks. Upload or drop
              them here, attach what already lives in your workspace, or paste a
              link. Then press one button and it all becomes draft rules for you
              to approve.
            </p>
          ) : null}

          {/* ── what this Rulebook already HOLDS (D7) ────────────────────
              Sources arrive here from doors that are not this panel: an export
              selection, a send from a Library, an extension capture. They are
              listed, not just counted, because a screen that holds 50 of a
              person's own emails and shows them a number is still telling them
              less than it knows. */}
          <KeptMaterialSummary
            kept={kept}
            rows={keptOnly}
            rulebookId={rulebook.id}
            attached={tally.attached}
          />

          {/* ── capture ──────────────────────────────────────────────── */}
          {canEdit && !captureVisible ? (
            <div className="pt-3">
              {tally.attached > 0 || failedUploads.length > 0 ? (
                <div className="overflow-hidden rounded-md border border-border/70 bg-card">
                  <SourceRows
                    sourceLinks={sourceLinks}
                    stagedUrls={stagedUrls}
                    titleFor={(token, id, label) =>
                      titleFor({ token, id, label })
                    }
                    detailFor={detailForLink}
                    sizeFor={sizeForLink}
                    sectionsFor={sectionsFor}
                    onRedistillSection={(resource, section, label) =>
                      void redistillSection(resource, section, label)
                    }
                    running={run.running}
                    status={links.status}
                    error={links.error}
                    busyKey={busyKey}
                    canEdit={canEdit}
                    onDetach={detachAttached}
                    onRemoveUrl={(url) => void removeUrl(url)}
                    failedUploads={failedUploads}
                    retryingUploadId={retryingUploadId}
                    onRetryUpload={(upload, file) =>
                      void retryFailedUpload(upload, file)
                    }
                    onDismissUpload={dismissFailedUpload}
                  />
                </div>
              ) : null}
              <div className="mt-3">
                <Button
                  size="sm"
                  variant={totalSources === 0 ? "outline" : "ghost"}
                  className="h-7"
                  onClick={() => setCaptureVisible(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  {/* `totalSources`, never `tally.attached`: a Rulebook holding
                      50 kept emails is not being asked for its FIRST resource. */}
                  {totalSources === 0 ? "Add your first resource" : "Add more"}
                </Button>
              </div>
            </div>
          ) : null}
          {canEdit && captureVisible ? (
            <div className="mt-3 overflow-hidden rounded-md border border-border/70 bg-card">
              <AssociationCaptureToolbar
                attach={captureAttach}
                uploadFolderPath={sourcesFolderPath}
                uploadLocationLabel="your Files (Masterwork/Sources)"
                // The packaged toolbar (W5 swap) has no "Add document" chip at
                // all — it was a strict subset of "From your workspace" below,
                // and two buttons for one job is exactly the clutter this
                // section was consolidated to kill.
                showActions={{
                  upload: true,
                  addFile: true,
                  newDocument: true,
                }}
                filePicker={{
                  title: "Attach files as sources",
                  description:
                    "Pick existing files from your cloud storage — exports from other tools are perfect here.",
                }}
                organizationId={rulebook.organization_id}
                openCreatedDocument
                extraActions={
                  <>
                    <span className="mx-1 h-4 w-px bg-border" />
                    {/* A TOGGLE SAYS WHICH WAY IT WENT. Both of these open a
                        panel below the row, and neither said so: no
                        `aria-expanded`, no `aria-pressed`, so anyone who
                        pressed twice — or read the page instead of seeing it —
                        got "I clicked and nothing happened" (census row 9,
                        2026-09-12). The state is now declared, not just
                        painted. */}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-expanded={showUrlAdd}
                      aria-pressed={showUrlAdd}
                      aria-controls="rulebook-sources-url-add"
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
                      aria-expanded={showPicker}
                      aria-pressed={showPicker}
                      aria-controls="rulebook-sources-workspace-picker"
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
                    {/* A DOOR, NOT A THIRD CAPTURE FLOW. One link at a time is
                        the wrong shape for someone whose method lives in a
                        YouTube channel; the Media Source Catalog already
                        catalogues a whole channel into a Library of Sources.
                        So this sibling navigates there carrying where it came
                        from — no `aria-expanded`/`aria-pressed`, because
                        nothing opens below the row and a toggle that never
                        toggles is exactly the lie the two buttons above were
                        fixed for. */}
                    <Button
                      asChild
                      size="sm"
                      variant="ghost"
                      className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Link
                        href={`/libraries?from=rulebook&rulebook_id=${rulebook.id}`}
                        data-tap-target
                        title="Catalogue a whole YouTube channel in Libraries"
                      >
                        <Library className="size-3.5" />
                        Bring a whole channel
                      </Link>
                    </Button>
                  </>
                }
              >
                {showUrlAdd ? (
                  <div
                    id="rulebook-sources-url-add"
                    className="border-b border-border/60 p-2"
                  >
                    {/* Scrape-on-add: the Core fetches the page and shows an
                        honest preview before "Add Content" stages the URL. */}
                    <WebpageResourcePickerCore
                      onSelect={(content) =>
                        void stageUrl(content.url, content.title ?? undefined)
                      }
                      // A direct file link (a PDF of a book, a Word SOP) is a
                      // first-class source: staged as-is, fetched and read by
                      // the server's ONE scraper door when the run starts.
                      onFileUrl={(url, filename) => void stageUrl(url, filename)}
                    />
                  </div>
                ) : null}
                {showPicker ? (
                  <div
                    id="rulebook-sources-workspace-picker"
                    className="flex max-h-80 flex-col border-b border-border/60 bg-muted/30 p-2"
                  >
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
                  detailFor={detailForLink}
                    sizeFor={sizeForLink}
                  sectionsFor={sectionsFor}
                  onRedistillSection={(resource, section, label) =>
                    void redistillSection(resource, section, label)
                  }
                  running={run.running}
                  status={links.status}
                  error={links.error}
                  busyKey={busyKey}
                  canEdit={canEdit}
                  onDetach={detachAttached}
                  onRemoveUrl={(url) => void removeUrl(url)}
                  failedUploads={failedUploads}
                  retryingUploadId={retryingUploadId}
                  onRetryUpload={(upload, file) =>
                    void retryFailedUpload(upload, file)
                  }
                  onDismissUpload={dismissFailedUpload}
                />
              </AssociationCaptureToolbar>
            </div>
          ) : null}
          {!canEdit ? (
            <div className="mt-3 overflow-hidden rounded-md border border-border/70 bg-card">
              <SourceRows
                sourceLinks={sourceLinks}
                stagedUrls={stagedUrls}
                titleFor={(token, id, label) => titleFor({ token, id, label })}
                detailFor={detailForLink}
                    sizeFor={sizeForLink}
                sectionsFor={sectionsFor}
                status={links.status}
                error={links.error}
                busyKey={null}
                canEdit={false}
                onDetach={() => undefined}
                onRemoveUrl={() => undefined}
                failedUploads={failedUploads}
              />
            </div>
          ) : null}

          {/* ── held-out cases (sealed) ──────────────────────────────── */}
          <HeldOutCasesSection rulebookId={rulebook.id} />

          {/* ── the run ──────────────────────────────────────────────── */}
          {canEdit ? (
            <div className="mt-3 space-y-2">
              {/* 🚨 THE LANE THE 2026-09-17 VERIFICATION WATCHED FREEZE. It
                  now shows a row per attached source with its own state, the
                  counts the server sent, a clock that moves every second, and
                  the server's labouring sentence when its heartbeat cannot
                  land — never a motionless spinner. */}
              {/* 🚨 THE SETTLED ACCOUNT WINS, AND IT IS THE ONLY ONE ON SCREEN
                  (twelfth cold walk, 2026-09-20, D3). While a run is in
                  flight the live per-resource list IS the account. The moment
                  the run settles, `DumpOutcomes` below holds the server's
                  final row per source — and rendering BOTH put two lists of
                  the same sources in one panel, each free to say something
                  different, inside two nested bordered boxes. One source, one
                  outcome, one box. */}
              {run.result ? null : <RunStages run={run} />}
              {run.running ? (
                <DurableRunInterruption interruption={run.interruption} />
              ) : null}

              {/* The dump lane was the only one that kept its failure on screen
                  — but it asked the reader to "press the button again" instead
                  of giving them a button. Same notice as every other lane now,
                  with the way out attached. */}
              <DurableRunFailure
                error={run.error}
                retry={run.retry}
                running={run.running}
              >
                <p className="self-center text-xs text-muted-foreground">
                  Your attached sources are safe — nothing was lost.
                </p>
              </DurableRunFailure>

              {run.result ? (
                <DumpOutcomes
                  summary={run.result}
                  onDone={() => run.reset()}
                  onRetryOne={retryOneSource}
                  onDistilAgain={distilAgainAndReplace}
                  retrying={run.running}
                />
              ) : null}

              {!run.result ? (
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
                  {/* 🚨 THE BUTTON SAYS WHAT IT IS WAITING FOR.
                      It used to be gated on "is anything attached" alone, so
                      one file into a seventeen-file drop it was live, and a
                      press distilled whatever had landed (VERIFICATION.md
                      §9.1). Now the pile still arriving is a named blocking
                      reason, and the button WEARS the count while it waits —
                      a control that is honest rather than one that is dark. */}
                  <GatedActionButton
                    size="sm"
                    className="h-10 w-full shrink-0 sm:h-8 sm:w-auto"
                    wrapperClassName="w-full sm:w-auto"
                    onClick={() => void launchDump()}
                    disabled={run.running}
                    reason={firstBlockingReason([
                      {
                        when: totalSources === 0,
                        reason: "Attach at least one source first",
                      },
                      {
                        when: attachingLabel !== null,
                        reason:
                          gate.blockingReason(visibleKeys) ??
                          "The sources are still arriving",
                      },
                    ])}
                  >
                    {run.running || attachingLabel ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <Hammer className="mr-1 h-4 w-4" />
                    )}
                    {attachingLabel
                      ? attachingLabel
                      : run.running
                        ? "Turning it into rules…"
                        : "Turn this into rules"}
                  </GatedActionButton>
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

const EMPTY_FAILED_UPLOADS: readonly UploadState[] = [];

export function SourceRows({
  sourceLinks,
  stagedUrls,
  titleFor,
  detailFor,
  sizeFor,
  sectionsFor,
  onRedistillSection,
  running,
  status,
  error,
  busyKey,
  canEdit,
  onDetach,
  onRemoveUrl,
  failedUploads = EMPTY_FAILED_UPLOADS,
  retryingUploadId = null,
  onRetryUpload,
  onDismissUpload,
}: {
  sourceLinks: {
    token: string;
    resourceId: string;
    label: string | null;
    metadata?: unknown;
  }[];
  stagedUrls: DumpUrlSource[];
  titleFor: (token: string, id: string, label: string | null) => string;
  /** The second line of a row — what a pasted source says about itself. */
  detailFor?: (metadata: unknown) => string | null;
  /**
   * The file-size half of that second line: a real size ("1.5 KB") or, for
   * a genuinely empty upload, a plain call-out — never a bare "Files" label
   * that leaves an empty file indistinguishable from a real one
   * (VERIFICATION.md §12, 2026-09-18). `null` while unresolved or for a
   * non-file source, so it never displaces `info.labelPlural`.
   */
  sizeFor?: (token: string, resourceId: string) => string | null;
  /** What each part of this source produced — empty when it has no parts. */
  sectionsFor?: (sourceKey: string) => SourceSectionYield[];
  /** Read ONE part of this source again (canEdit only). */
  onRedistillSection?: (
    resource: Record<string, unknown>,
    section: SourceSectionYield,
    label: string,
  ) => void;
  /** A run is in flight — every re-read button waits for it. */
  running?: boolean;
  status: string;
  error: string | null;
  busyKey: string | null;
  canEdit: boolean;
  onDetach: (token: string, resourceId: string) => void | Promise<void>;
  onRemoveUrl: (url: string) => void;
  /**
   * 🚨 THE 2026-09-19 SILENT FAILURE, MADE VISIBLE HERE. An upload that failed
   * has no attachment edge — `sourceLinks` will never contain it — so it gets
   * its OWN row, in this same list, with the server's sentence, a Retry, and
   * a Dismiss. Rendered even when every other list is empty: an upload that
   * failed must never be indistinguishable from an upload nobody started.
   */
  failedUploads?: readonly UploadState[];
  /** The one row currently re-uploading — its Retry button shows a spinner. */
  retryingUploadId?: string | null;
  onRetryUpload?: (upload: UploadState, file: File) => void;
  onDismissUpload?: (requestId: string) => void;
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
        <ErrorAlchemyMenu error={error} />
      </p>
    );
  }
  if (
    sourceLinks.length === 0 &&
    stagedUrls.length === 0 &&
    failedUploads.length === 0
  ) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        Nothing attached yet. Upload files, attach things from your workspace,
        or paste a link — everything lands here first, so you can see exactly
        what the rules will be distilled from.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border/70">
      {failedUploads.map((upload) => (
        <FailedUploadRow
          key={upload.requestId}
          upload={upload}
          canEdit={canEdit}
          retrying={retryingUploadId === upload.requestId}
          onRetry={
            onRetryUpload
              ? (file) => onRetryUpload(upload, file)
              : undefined
          }
          onDismiss={
            onDismissUpload
              ? () => onDismissUpload(upload.requestId)
              : undefined
          }
        />
      ))}
      {sourceLinks.map((link) => {
        const info = tryGetEntityInfo(link.token);
        const key = attachedKey(link.token, link.resourceId);
        const unsupported = UNSUPPORTED_TOKENS.has(link.token);
        const detail = detailFor?.(link.metadata) ?? null;
        const size = sizeFor?.(link.token, link.resourceId) ?? null;
        const empty = size === EMPTY_FILE_SIZE_LABEL;
        return (
          <li
            key={key}
            className="px-3 py-2.5 transition-colors hover:bg-muted/20"
          >
            <div className="flex min-h-14 items-center gap-3">
            {info ? (
              <info.Icon className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
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
                {detail ? (
                  <span className="text-[10px] text-muted-foreground">
                    {detail}
                  </span>
                ) : info ? (
                  <span
                    className={cn(
                      "text-[10px]",
                      empty
                        ? "text-amber-600 dark:text-amber-500"
                        : "text-muted-foreground",
                    )}
                  >
                    {info.labelPlural}
                    {size ? ` · ${size}` : ""}
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
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
              >
                {busyKey === key ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <X className="size-3.5" />
                )}
              </button>
            ) : null}
            </div>
            <SectionYields
              sections={
                sectionsFor?.(
                  entitySourceKey(link.token, link.resourceId),
                ) ?? []
              }
              canEdit={canEdit}
              running={running}
              onRedistill={(section) =>
                onRedistillSection?.(
                  {
                    kind: "entity",
                    token: link.token,
                    id: link.resourceId,
                    title: titleFor(link.token, link.resourceId, link.label),
                  },
                  section,
                  titleFor(link.token, link.resourceId, link.label),
                )
              }
            />
          </li>
        );
      })}
      {stagedUrls.map((staged) => (
        <li
          key={staged.url}
          className="px-3 py-2.5 transition-colors hover:bg-muted/20"
        >
          <div className="flex min-h-14 items-center gap-3">
          <Globe className="size-4 shrink-0 text-muted-foreground" />
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
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
          </div>
          <SectionYields
            sections={sectionsFor?.(urlSourceKey(staged.url)) ?? []}
            canEdit={canEdit}
            running={running}
            onRedistill={(section) =>
              onRedistillSection?.(
                {
                  kind: "url",
                  url: staged.url,
                  ...(staged.title ? { title: staged.title } : {}),
                },
                section,
                staged.title || staged.url,
              )
            }
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * One row for an upload that failed — the server's own sentence (see
 * `announceUploadFailures` in `features/files/redux/thunks.ts`, which put the
 * SAME sentence in the toast this row outlives), a Retry that lets the
 * person pick the file again without leaving this card, and a Dismiss that
 * clears it. Never rendered as a bare filename with no reason — that IS the
 * defect this row exists to close.
 */
function FailedUploadRow({
  upload,
  canEdit,
  retrying,
  onRetry,
  onDismiss,
}: {
  upload: UploadState;
  canEdit: boolean;
  retrying: boolean;
  onRetry?: (file: File) => void;
  onDismiss?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <li className="bg-destructive/5 px-3 py-2.5">
      <div className="flex min-h-14 items-start gap-3">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-foreground">
            Couldn&apos;t upload {upload.fileName}
          </p>
          {/* THE SERVER'S SENTENCE, WHOLE — never a house sentence that hides
              it (see `announceUploadFailures`'s guard tests). */}
          <p className="mt-0.5 whitespace-pre-line break-words text-[11px] text-destructive">
            {upload.error ||
              "The server refused the upload and gave no reason."}
            <ErrorAlchemyMenu error={upload.error} />
          </p>
        </div>
        {canEdit ? (
          <div className="flex shrink-0 items-center gap-1">
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) onRetry?.(file);
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={retrying || !onRetry}
              onClick={() => inputRef.current?.click()}
            >
              {retrying ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                "Retry"
              )}
            </Button>
            <button
              type="button"
              title="Dismiss this failed upload"
              disabled={retrying}
              onClick={() => onDismiss?.()}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

// ── what each part of a source produced ─────────────────────────────────────

/**
 * 🚨 THE THIN CHAPTER, MADE VISIBLE (W42, 2026-09-12).
 *
 * A 31,311-word book was read into a Rulebook as six equal chunks and gave 116
 * rules — evenly, whatever the chunk held. Its most prescriptive chapter gave
 * THREE; pasted alone it gave 89. Nothing on any screen could show that, so the
 * Expert found out when the answers were wrong.
 *
 * Numbers, not prose (Arman, 2026-09-12): one row per part of the source, the
 * rules it produced, and — on a part far below what the rest of this source
 * gave — the way to fix it. The re-read is an expensive click, so it names what
 * it spends and what it replaces before it runs.
 */
function SectionYields({
  sections,
  canEdit,
  running,
  onRedistill,
}: {
  sections: SourceSectionYield[];
  canEdit: boolean;
  running?: boolean;
  onRedistill: (section: SourceSectionYield) => void;
}) {
  if (sections.length < 2) return null;
  const total = sections.reduce((sum, row) => sum + row.rules, 0);
  return (
    <div className="ml-7 mt-1.5 overflow-hidden rounded border border-border/60">
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/30 px-2 py-1">
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {sections.length} parts · {total} {total === 1 ? "rule" : "rules"}
        </span>
      </div>
      <table className="w-full table-fixed">
        <tbody>
          {sections.map((section) => (
            <tr
              key={section.index}
              className="border-b border-border/40 last:border-0"
            >
              <td className="truncate px-2 py-1 text-[11px] text-foreground">
                {section.label}
              </td>
              <td className="w-20 px-2 py-1 text-right text-[11px] tabular-nums text-muted-foreground">
                {section.words.toLocaleString()}w
              </td>
              <td
                className={cn(
                  "w-16 px-2 py-1 text-right text-[11px] font-medium tabular-nums",
                  section.thin ? "text-amber-600 dark:text-amber-500" : "text-foreground",
                )}
              >
                {section.rules}
              </td>
              <td className="w-40 px-2 py-1 text-right">
                {section.thin ? (
                  <span className="mr-1.5 text-[10px] text-amber-600 dark:text-amber-500">
                    thin
                  </span>
                ) : null}
                {section.secondPass ? (
                  <span className="mr-1.5 text-[10px] text-muted-foreground">
                    read twice
                  </span>
                ) : null}
                {canEdit ? (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() => {
                      void (async () => {
                        const ok = await confirm({
                          title: `Read "${section.label}" again?`,
                          description:
                            `This distils just this part of the source again, in smaller pieces — ` +
                            `an AI run you pay for. Its ${section.rules} suggested ` +
                            `${section.rules === 1 ? "rule" : "rules"} that you have not approved ` +
                            `will be replaced by the new pass. Rules you have approved, and every ` +
                            `other part of this source, are untouched.`,
                          confirmLabel: "Read it again",
                        });
                        if (ok) onRedistill(section);
                      })();
                    }}
                    className="text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
                  >
                    Read again
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── per-resource outcomes after a run ───────────────────────────────────────

/**
 * 🚨 THE THREE OUTCOMES A SOURCE CAN HAVE, SAID APART.
 *
 * `done` (rules), `no rules` (read, and honestly empty — the distiller's own
 * sentence), and `refused` (a reason, and what does work instead). Before
 * aidream 1c9edb934c the middle one arrived as `failed` and the batch read as
 * stopped; before this file was changed it would have arrived as "0 rules"
 * with the reason discarded, and a copy-protection refusal reached the person
 * as `failed — “X” is copy-prot…`. Nothing here writes a sentence of its own:
 * every explanation below is the server's, rendered whole.
 */
type OutcomeTone = "done" | "empty" | "refused" | "noted";

function outcomeTone(res: DumpResourceOutcome): OutcomeTone {
  if (res.status === "failed") return "refused";
  if (res.status === "unsupported") return "noted";
  if (res.status === "already_distilled") return "noted";
  if (res.status === "ok") return res.rules_added > 0 ? "done" : "empty";
  return "noted";
}

/** The state word on the row — never a number standing in for a state. */
function outcomeState(res: DumpResourceOutcome): string {
  switch (outcomeTone(res)) {
    case "done":
      return (
        `${res.rules_added} ${res.rules_added === 1 ? "rule" : "rules"}` +
        (res.duplicates ? `, ${res.duplicates} duplicates` : "")
      );
    case "empty":
      return "read — no rules in it";
    case "refused":
      // 🚨 NOT "refused". The wire says `failed` and nothing more, so this
      // screen cannot know whether we DECLINED to read the source (a
      // copy-protected book, a site whose terms forbid it) or simply could not
      // (a save collision, a provider timeout). "Refused" claims the first,
      // and a live 17-file run on 2026-09-18 wore it over "The Rulebook kept
      // changing while saving the drafts" — a sentence that is plainly not a
      // refusal. The neutral word is true either way, and the server's own
      // sentence directly beneath says which it was.
      return "couldn’t be used";
    default:
      return res.status === "already_distilled"
        ? "already read"
        : res.status === "unsupported"
          ? "not distilled yet"
          : res.status;
  }
}

/**
 * The server's explanation for that state, whole, or null when it sent none.
 *
 * 🚨 A FAILURE'S SENTENCE GOES THROUGH `humanFailureSentence` (twelfth cold
 * walk, D2): the class name comes out, "the server did not say why" goes in
 * when that is the truth, and the way out is always attached. The `note` and
 * `alreadyDistilled` sentences are the distiller's own prose about a source it
 * READ — nothing to sanitise, and rewriting them would be the lie in the other
 * direction.
 */
function outcomeExplanation(res: DumpResourceOutcome): string | null {
  if (res.note) return res.note;
  if (res.alreadyDistilled) return res.alreadyDistilled;
  if (outcomeTone(res) === "refused") {
    return humanFailureSentence(res.error, {
      remedy: "Read this one again below \u2014 nothing else is affected.",
    }).text;
  }
  return res.error ?? null;
}

/**
 * The resource payload that would re-run THIS source on its own, or null when
 * the row does not carry enough to rebuild one — a `kept_source` outcome comes
 * back without its `source_key`. Null means NO BUTTON: a control that cannot
 * do what it says is worse than its absence.
 */
export function retryResourceFor(
  res: DumpResourceOutcome,
): Record<string, unknown> | null {
  if (res.kind === "entity" && res.token && res.id) {
    return {
      kind: "entity",
      token: res.token,
      id: res.id,
      ...(res.title ? { title: res.title } : {}),
    };
  }
  if (res.kind === "url" && res.url) {
    return {
      kind: "url",
      url: res.url,
      ...(res.title ? { title: res.title } : {}),
    };
  }
  if (res.kind === "kept_source" && res.sourceKey) {
    return {
      kind: "kept_source",
      source_key: res.sourceKey,
      ...(res.title ? { title: res.title } : {}),
    };
  }
  return null;
}

export function DumpOutcomes({
  summary,
  onDone,
  onRetryOne,
  onDistilAgain,
  retrying,
}: {
  summary: DumpSummary;
  onDone: () => void;
  /**
   * Read ONE source again. Handed the index of the row, because the server's
   * `resources` array is index-aligned with the payload the client launched
   * (`dump_ingest.py` writes `outcomes[index]`), which is the only way to
   * rebuild a `kept_source` row's request. Absent on a surface that cannot
   * relaunch — and then no retry control is drawn at all.
   */
  onRetryOne?: (index: number, res: DumpResourceOutcome) => void;
  /**
   * 🚨 THE CONTROL THE SERVER'S OWN SENTENCE NAMES (cold walk 13, N7).
   * "Choose “Distil again and replace” to throw the earlier 11 drafts away"
   * was printed over a panel whose only button was "Review the drafts" — I
   * enumerated every button, link and role="button" on that page and no such
   * control existed. A sentence naming a control that is not on the screen is
   * a dead end wearing an instruction. It is drawn per row, only when the
   * server said a replace is meaningful, and it confirms with the consequence
   * named (the destructive-click law).
   */
  onDistilAgain?: (index: number, res: DumpResourceOutcome) => void;
  /** A relaunch is already in flight; every retry control waits it out. */
  retrying?: boolean;
}) {
  const failed = summary.resources.filter(
    (r) => outcomeTone(r) === "refused",
  ).length;
  const read = summary.resources.length - failed;
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
      {/* 🚨 A FAILURE IS NEVER COUNTED AS A READ (twelfth cold walk, D2 — a
          headline reading "7 of 7 sources read" over five rows that said
          nothing was added). This sentence said "N sources were read" with N
          being every row including the failures. It now says both numbers, and
          still never says the run stopped — every source in a fan-out ran
          (§9.1). */}
      {failed > 0 ? (
        <p className="text-xs text-muted-foreground">
          {read} of {summary.resources.length} read · {failed} failed.{" "}
          {failed === 1
            ? "The one that failed says why on its own row below, with a way to read it again."
            : "Each one that failed says why on its own row below, with a way to read it again."}
        </p>
      ) : null}
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
                  outcomeTone(res) === "done"
                    ? "bg-emerald-500"
                    : outcomeTone(res) === "refused"
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
                {/* The state is two or four words; it belongs on one line.
                    At 390 px "read — no rules in it" broke after "no" and read
                    as two different things. */}
                <span className="ml-1.5 whitespace-nowrap text-muted-foreground">
                  {outcomeState(res)}
                </span>
                {/* THE SERVER'S SENTENCE, WHOLE AND ON ITS OWN LINE. The
                    copy-protection refusal names the scheme and the four
                    lawful ways in; as an inline tail on a truncating row it
                    was a dead end wearing an ellipsis. */}
                {outcomeExplanation(res) ? (
                  <p className="mt-0.5 whitespace-pre-line break-words text-muted-foreground">
                    {outcomeExplanation(res)}
                  </p>
                ) : null}
                {/* 🚨 THE REMEDY IS A CONTROL, NOT A SENTENCE ABOUT ONE. A
                    failed row used to end at its explanation, so the only way
                    back was to press the whole pile again and pay for every
                    source that had already worked. This reads THIS source
                    again and nothing else. It is drawn only when the row
                    carries enough to rebuild its own request — a control that
                    cannot do what it says is worse than its absence. */}
                {onRetryOne && outcomeTone(res) === "refused" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-7"
                    disabled={retrying}
                    onClick={() => onRetryOne(i, res)}
                  >
                    {retrying ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    Read this one again
                  </Button>
                ) : null}
                {onDistilAgain &&
                res.status === "already_distilled" &&
                (res.replaceableDrafts ?? 0) > 0 &&
                retryResourceFor(res) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-1 h-7"
                    disabled={retrying}
                    onClick={() => onDistilAgain(i, res)}
                  >
                    {retrying ? (
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    ) : null}
                    Distil again and replace
                  </Button>
                ) : null}
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

/**
 * What this Rulebook already HOLDS, said out loud.
 *
 * 🚨 THE SCREEN THAT LIED (2026-09-18, VERIFICATION.md D7). A Rulebook was
 * given 50 Sources through the export flow — rows written, edges written, the
 * send returning 200 — and this panel said "Add your first resource". It was
 * reading the attachment edges only, and the kept store had no reader anywhere
 * on the platform. A person who followed the dialog's own "Open the Rulebook"
 * landed on a page telling them they had nothing, holding 50 of their own
 * emails.
 *
 * Three states, all honest: a read still in flight says so (never "0"), a
 * failed read says WHAT failed and offers a retry (never "0"), and a Rulebook
 * with kept material lists it and links to the reader.
 */
function KeptMaterialSummary({
  kept,
  rows,
  rulebookId,
  attached,
}: {
  kept: KeptSourceCount;
  /**
   * The kept rows this block OWNS: not an interview (the Interviews block
   * names those) and not already listed as an attachment below. Passed in
   * rather than re-derived, because the count in the heading above and the
   * list in here have to be the same set or the screen contradicts itself —
   * which is what "7 sources are already here — besides the 5 attached below"
   * over four of those very five files was (cold walk 13, N4).
   */
  rows: readonly KeptSourceBrief[];
  rulebookId: string;
  attached: number;
}) {
  if (kept.state === "loading") {
    return (
      <p className="pt-3 text-xs text-muted-foreground">
        <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />
        Checking what this rulebook has already kept…
      </p>
    );
  }
  if (kept.state === "failed") {
    // Never "no kept material" on a failed read — that is the exact sentence
    // this whole fix exists to stop a screen from saying.
    return (
      <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
        <p className="text-foreground">
          We couldn&apos;t read the material this rulebook has kept, so the count
          below may be short. {kept.reason}
          <ErrorAlchemyMenu error={kept.reason} />
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2 h-7"
          onClick={() => kept.retry()}
        >
          Try again
        </Button>
      </div>
    );
  }
  if (rows.length === 0) return null;

  const total = rows.length;
  const shown = rows.slice(0, 5);
  return (
    <div className="mt-3 overflow-hidden rounded-md border border-border/70 bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-3 py-2">
        <p className="text-xs font-medium text-foreground">
          {total === 1
            ? "1 source is already here"
            : `${total.toLocaleString()} sources are already here`}
          {attached > 0 ? (
            <span className="font-normal text-muted-foreground">
              {" "}
              — besides the {attached === 1 ? "one" : attached} attached below
            </span>
          ) : null}
        </p>
        <Link
          href={`/masterwork/${rulebookId}/sources/kept`}
          data-tap-target
          className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <Library className="h-3 w-3" />
          Read them
        </Link>
      </div>
      <ul className="divide-y divide-border/60">
        {shown.map((row) => (
          <li
            key={row.source_key}
            className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs"
          >
            {/* ONE naming rule for a kept source, shared with the Kept
                material list and the reader (cold walk 12, D8). This cell used
                to print "Untitled" for a source with no label, which is what
                made an Expert's OWN interview read as a stranger's source the
                platform had put in her brand-new Rulebook. */}
            <span className="truncate text-foreground">
              {keptSourceTitle(row)}
            </span>
            <span className="shrink-0 text-muted-foreground">
              {row.word_count
                ? `${row.word_count.toLocaleString()} ${row.word_count === 1 ? "word" : "words"}`
                : row.medium}
            </span>
          </li>
        ))}
      </ul>
      {total > shown.length ? (
        <p className="border-t border-border/60 px-3 py-1.5 text-xs text-muted-foreground">
          {`and ${(total - shown.length).toLocaleString()} more`}
          {kept.more
            ? ` — one run turns the most recent ${kept.rows.length.toLocaleString()} into rules, then press it again for the rest`
            : ""}
          .
        </p>
      ) : null}
    </div>
  );
}
