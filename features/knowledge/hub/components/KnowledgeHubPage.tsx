"use client";

/**
 * features/knowledge/hub/components/KnowledgeHubPage.tsx — `/knowledge`, the
 * Knowledge hub (KNOWLEDGE-HUB §5.2, build phase H3).
 *
 * Three resizable panes — sidebar (views, containers, kinds) · main (search
 * with chips; typed sections when searching, list / table / board / gallery
 * when browsing) · peek. On a phone, one pane at a time.
 *
 * Champions: Linear (views, filters and layout in the URL; j/k, ↵, Esc, f),
 * Notion (peek, per-view layouts), Readwise Reader (an inbox you triage).
 *
 * Everything a person sees is the URL (`hubState.ts`); the ONE runner answers
 * the ONE query (`features/knowledge/api/knowledgeSearch.ts`, shared with ⌘K).
 * Until the search service is live the runner answers with the platform's
 * title search (announced), and "Sample data" swaps in the fixture (announced;
 * writes refuse).
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, type Layout } from "react-resizable-panels";
import {
  ArrowLeft,
  FlaskConical,
  Kanban,
  LayoutGrid,
  List,
  PanelLeft,
  Table2,
  Archive,
  BookmarkPlus,
  Check,
  FolderInput,
  Hash,
  Inbox,
  Save,
  Trash2,
  X,
  Paperclip,
  Sparkles,
  Activity,
  Settings2,
  Download,
  Plus,
  AppWindow,
  ArrowUpRight,
  ClipboardCopy,
  Copy,
  Link2,
  Pencil,
} from "lucide-react";
import { TapTargetButton } from "@ai-matrx/tap-target";
import { useEntityTitles } from "@ai-matrx/associations/react";
import { isAssociationTargetType } from "@ai-matrx/associations";
import { ToggleGroup, ToggleGroupItem } from "@ai-matrx/design-system";
import { ClientGroup } from "@/features/resizable-panels/ClientGroup";
import { Handle } from "@/features/resizable-panels/Handle";
import { RegisteredPanel } from "@/features/resizable-panels/RegisteredPanel";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { recordToast, toast } from "@/lib/toast";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectOrganizationId, selectOrganizationName } from "@/lib/redux/slices/appContextSlice";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { isScopesRpcErr } from "@/features/scopes/types";
import { ensureOrgId } from "@/lib/organizations/ensureOrgId";
import { isOrganizationRequiredError } from "@/lib/organizations/organizationRequiredError";
import {
  organizationRefusalMessage,
  presentOrganizationRefusal,
} from "@/lib/organizations/organizationRefusalToast";
import { associationsService } from "@/features/scopes/service/associationsService";
import { archiveRecord } from "@/features/trash/service";
import { archiveConfirmSentence } from "@/features/trash/archiveCopy";
import { keepSource, sourceRefusalSentence } from "@/features/sources/api/sourcesApi";
import type { EntityRef, FiledRef, KnowledgeHit, KnowledgeQuery } from "@/features/knowledge/api/knowledgeSearch";
import {
  ACTIVE_ORGANIZATION,
  HUB_KINDS,
  isHubPresetViewKey,
  normalizeQuery,
  organizationReachOf,
  resolveOrganizationReach,
  selectionQuery,
  type HubLayout,
  type HubState,
  type HubView,
} from "@/features/knowledge/hub/hubState";
import { useHubUrlState } from "@/features/knowledge/hub/hooks/useHubUrlState";
import { useKnowledgeResults } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import { AskPanel } from "@/features/knowledge/ask/AskPanel";
import {
  HUB_CONTAINER_LABEL,
  HUB_CONTAINER_TOKENS,
  useHubSidebarData,
  type HubSidebarData,
} from "@/features/knowledge/hub/hooks/useHubSidebarData";
import {
  actionTarget,
  fileUnder,
  trashItems,
  uniqueTargets,
  type FileUnderContainer,
} from "@/features/knowledge/hub/hubActions";
import { TRANSCRIPT_MEDIA_ICON, hitKey, openFullHref, tokenLabel } from "@/features/knowledge/hub/hubPresentation";
import {
  HUB_PRESETS,
  expandAnyContainers,
  isViewLinkOnly,
  mergePresetQuery,
  presetDefinition,
  viewIsDirty,
} from "@/features/knowledge/hub/hubSavedViews";
import {
  createHubView,
  deleteView,
  duplicateView,
  renameView,
  saveViewChanges,
  setViewNotify,
  setViewPinned,
  setViewShared,
  touchView,
} from "@/features/knowledge/hub/hubSavedViewActions";
import { useSavedViewCounts } from "@/features/knowledge/hub/hooks/useSavedViewCounts";
import { runnerFor } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import { SaveViewDialog, type SaveViewValues } from "@/features/knowledge/hub/components/SaveViewDialog";
import type { SavedViewAction } from "@/features/knowledge/hub/components/HubSidebar";
import type { HubSavedView } from "@/features/knowledge/hub/hooks/useHubSidebarData";
import { HubSidebar } from "@/features/knowledge/hub/components/HubSidebar";
import { HubSearchBox } from "@/features/knowledge/hub/components/HubSearchBox";
import { HubFilterMenu } from "@/features/knowledge/hub/components/HubFilterMenu";
import {
  BrowseResults,
  SearchSections,
  browseHits,
  orderedSearchHits,
} from "@/features/knowledge/hub/components/HubResults";
import { HubPeek } from "@/features/knowledge/hub/components/HubPeek";
import { FileUnderDialog } from "@/features/knowledge/hub/components/FileUnderDialog";
import type { ResultHandlers } from "@/features/knowledge/hub/components/HubResultRow";
import type { SectionState } from "@/features/knowledge/hub/hooks/useKnowledgeResults";
import type { TriageState } from "@/features/knowledge/api/knowledgeSearch";
import { setTriageState, TRIAGE_LABEL } from "@/features/knowledge/hub/triage/triageApi";
import { nextFocusAfterRemoval, triageCommandForKey, triageItems, undoTriage } from "@/features/knowledge/hub/triage/triageActions";
import { countText, useTriage } from "@/features/knowledge/hub/triage/useTriage";
import { TriageHelpSheet } from "@/features/knowledge/hub/triage/TriageHelpSheet";
import { fileUnderTag } from "@/features/knowledge/hub/tags/tagApi";
import { tagItems, TAG_REF_TYPE } from "@/features/knowledge/hub/tags/tagActions";
import { useHubTags } from "@/features/knowledge/hub/tags/useHubTags";
import { TagDialog } from "@/features/knowledge/hub/tags/TagDialog";
import { PeekTags } from "@/features/knowledge/hub/tags/PeekTags";
import { TagsSidebarGroup } from "@/features/knowledge/hub/tags/TagsSidebarGroup";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { buildRagLibraryContextData } from "@/features/rag/agent-context/buildRagLibraryContextData";
import { useProcessingRunner } from "@/features/rag/hooks/useProcessingRunner";
import { ProcessingProgressSheet } from "@/features/rag/components/library/ProcessingProgressSheet";
import { LibraryTrashList } from "@/features/rag/components/library/LibraryTrashList";
import { SourceAddMenu, SourceSaveDialog, type SaveTarget } from "@/features/sources/components/SourceCapture";
import { SourceStageCell } from "@/features/sources/components/SourceStageCell";
import {
  processSourceRow,
  readActionableSources,
  runSourceBulk,
  trashSource,
} from "@/features/sources/sourceActions";
import { isFileCanonicalExtract } from "@/features/sources/sourceRows";
import { useSourceStages } from "@/features/knowledge/hub/hooks/useSourceStages";
import {
  HUB_STAGE_LABEL,
  narrowByStage,
  stageCounts,
  stageSourceId,
  type HubStage,
} from "@/features/knowledge/hub/hubStage";
import { HUB_LIBRARY_SURFACE, buildHubWriteHandlers, hubSourceSummaries } from "@/features/knowledge/hub/hubAgentSurface";
import { HubGettingStarted } from "@/features/knowledge/hub/components/HubGettingStarted";
import { HubContainerGroupView } from "@/features/knowledge/hub/containerGroups/HubContainerGroupView";
import { HUB_GROUP_LABEL, catalogFiltersToGroup } from "@/features/knowledge/hub/containerGroups/groupFilters";
import { tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import Link from "next/link";
import { cn } from "@/utils/cn";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { buildAgentPayload } from "@/components/agent-copy/buildAgentPayload";
import { writeClipboard } from "@/components/agent-copy/clipboard";
import { buildRecordReferenceFence } from "@/features/matrx-envelope/recordReference";
import { saveTranscriptRowEdit } from "@/features/transcripts/browse/service";
import { exportTranscriptRows, transcriptExportConfirm } from "@/features/transcripts/browse/bulkExport";
import {
  TRANSCRIPT_COPY_LIST_KIND,
  TRANSCRIPT_COPY_ROW_KIND,
  transcriptCopyAgent,
  transcriptCopyHuman,
} from "@/features/transcripts/browse/copyRows";
import type { TranscriptListRow } from "@/features/transcripts/browse/types";
import { useTranscriptFacts } from "@/features/knowledge/hub/transcripts/useTranscriptFacts";
import { HubRowMenu, type HubMenuGroup } from "@/features/knowledge/hub/components/HubRowMenu";
import { TranscriptFacetBar } from "@/features/knowledge/hub/transcripts/TranscriptFacetBar";
import {
  TRANSCRIPT_KIND_LABEL,
  facetSelectionFromGroup,
  facetSelectionToGroup,
  hasFacetSelection,
  isTranscriptHit,
  narrowByTranscriptFacets,
  transcriptFacetCounts,
  transcriptMenu,
  transcriptReferenceType,
  transcriptRowHref,
  transcriptRowFacts,
  type HubTranscriptKind,
  type TranscriptMenuAction,
} from "@/features/knowledge/hub/transcripts/transcriptRows";
import { ReadFailure } from "@/components/read-state/ReadFailure";

const GROUP_ID = "knowledge-hub";
const GROUP_KEY = "knowledge-hub";

const LAYOUT_ICON: Record<HubLayout, React.ComponentType<{ className?: string }>> = {
  list: List,
  table: Table2,
  board: Kanban,
  gallery: LayoutGrid,
};
const LAYOUT_LABEL: Record<HubLayout, string> = {
  list: "List",
  table: "Table",
  board: "Board",
  gallery: "Gallery",
};

export const SAMPLE_WRITE_REFUSAL =
  "Sample data is for trying the hub — nothing was written. Switch back to your knowledge to file, keep or trash real items.";

function viewTitle(view: HubView, sidebar: HubSidebarData): string {
  switch (view.kind) {
    case "inbox":
      return "Inbox";
    case "kept":
      return "Kept";
    case "archived":
      return "Archived";
    case "everything":
      return "Everything";
    case "favorites":
      return "Favorites";
    case "trash":
      return "Trash";
    case "saved":
      return sidebar.savedViews.items.find((v) => v.id === view.id)?.name ?? "Saved view";
    case "kind":
      return HUB_KINDS.find((k) => k.key === view.key)?.label ?? view.key;
    case "group":
      return HUB_GROUP_LABEL[view.token];
    case "preset":
      return sidebar.savedViews.items.find((v) => v.preset === view.key)?.name ?? "Transcripts";
    case "container": {
      const token = view.type as (typeof HUB_CONTAINER_TOKENS)[number];
      const rows = sidebar.containers[token]?.items ?? [];
      return rows.find((r) => r.id === view.id)?.title ?? HUB_CONTAINER_LABEL[token] ?? tokenLabel(view.type);
    }
  }
}

/** One short line; the way forward is a button beside it, never a paragraph. */
function emptySentence(view: HubView, title: string, filtered: boolean): string {
  if (filtered) return "Nothing matches these filters.";
  switch (view.kind) {
    case "inbox":
      return "You're caught up.";
    case "kept":
      return "Nothing kept yet.";
    case "archived":
      return "Nothing archived.";
    case "favorites":
      return "No favorites yet.";
    case "trash":
      return "Trash is empty.";
    case "container":
      return "Nothing filed here yet.";
    case "kind":
    case "preset":
      return `No ${title.toLowerCase()} yet.`;
    case "saved":
      return "Nothing matches this view.";
    case "group":
      return "";
    case "everything":
      return "Nothing here yet.";
  }
}

/** Newest first by the date a row shows (updated, else created); undated rows last, order otherwise kept. */
function newestFirst(hits: KnowledgeHit[]): KnowledgeHit[] {
  const t = (h: KnowledgeHit) => {
    const v = Date.parse(h.updated_at ?? h.created_at ?? "");
    return Number.isFinite(v) ? v : -Infinity;
  };
  return hits
    .map((h, i) => ({ h, i, t: t(h) }))
    .sort((a, b) => b.t - a.t || a.i - b.i)
    .map((x) => x.h);
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);
}

export function KnowledgeHubPage({
  defaultLayout,
  cookieName,
}: {
  defaultLayout?: Layout;
  cookieName: string;
}) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { state, setState } = useHubUrlState();
  const sample = state.data === "sample";
  const sidebar = useHubSidebarData(state.data);
  const libraryIds =
    sidebar.containers.media_source_library.status === "ready"
      ? sidebar.containers.media_source_library.items.map((l) => l.id)
      : undefined;
  const idsByType = { media_source_library: libraryIds };
  // A preset opened by its key (`view=transcripts`, the retired list's address,
  // H6d): the installed row's definition (the code copy until rows load), with
  // what the address itself carries (words, reach, sort) on top — once per
  // visit, so clearing the preset's filters on purpose is never undone.
  const presetKey = state.view.kind === "preset" ? state.view.key : null;
  const presetRows = presetKey ? sidebar.savedViews.items.filter((v) => v.preset === presetKey) : [];
  const presetSavedView = presetRows.find((v) => !v.builtIn) ?? presetRows[0] ?? null;
  const codePreset = presetKey ? HUB_PRESETS.find((p) => p.key === presetKey) : undefined;
  const presetDef = presetSavedView?.definition ?? (codePreset ? presetDefinition(codePreset) : null);
  const appliedPreset = useRef<string | null>(null);
  const presetDefFor = (key: string) => {
    const rows = sidebar.savedViews.items.filter((v) => v.preset === key);
    const row = rows.find((v) => !v.builtIn) ?? rows[0];
    const code = HUB_PRESETS.find((p) => p.key === key);
    return row?.definition ?? (code ? presetDefinition(code) : null);
  };
  const presetPending = Boolean(presetKey && presetDef && appliedPreset.current !== presetKey);
  // The ONE active organization (the shell header's). The hub keeps none of its own: "Only my
  // organization" is stored as a word and resolved here on every run.
  const activeOrgId = useAppSelector(selectOrganizationId);
  const effectiveQuery = resolveOrganizationReach(
    presetPending && presetDef ? mergePresetQuery(presetDef.query, state.query) : state.query,
    activeOrgId,
  );
  // `library:*` (the Libraries preset) → every library this person can see.
  const expanded = expandAnyContainers(effectiveQuery, idsByType);
  // Ask (H4) answers over the same filter in a docked panel; the results keep listing it.
  const asking = state.query.mode === "ask";
  // Advanced → "Rerank results": undefined follows the organization's setting.
  const [rerank, setRerank] = useState<boolean | undefined>(undefined);
  const results = useKnowledgeResults(
    asking ? { ...expanded.query, mode: "find" } : expanded.query,
    state.data,
    undefined,
    rerank,
  );
  const activeOrgName = useAppSelector(selectOrganizationName);
  const [saveDialog, setSaveDialog] = useState<null | { mode: "create" } | { mode: "rename"; view: HubSavedView }>(null);
  const viewCountInputs = sidebar.savedViews.items
    .filter((v) => v.definition)
    .slice(0, 40)
    .flatMap((v) => {
      const x = expandAnyContainers(resolveOrganizationReach(v.definition!.query, activeOrgId), idsByType);
      return x.status === "pending" ? [] : [{ id: v.id, query: x.query }];
    });
  const { counts: viewCounts, refresh: refreshCounts } = useSavedViewCounts(
    viewCountInputs,
    state.data,
    runnerFor(state.data),
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [fileUnderFor, setFileUnderFor] = useState<KnowledgeHit[] | null>(null);
  const [mobilePane, setMobilePane] = useState<"sidebar" | "main">("main");
  const [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const searching = Boolean(state.query.text);

  // Favorites are the person's own stars (user_entity_state), titled by the registry.
  const favRefs = state.view.kind === "favorites"
    ? sidebar.favorites.items.map((f) => ({ token: f.entity, id: f.id }))
    : [];
  const { titleFor: favTitle } = useEntityTitles(favRefs);
  const favoriteHits: KnowledgeHit[] = favRefs
    .map((r) => ({ entity: r.token, id: r.id, title: favTitle(r) }))
    .filter((h) => !state.query.text || h.title.toLowerCase().includes(state.query.text.toLowerCase()));

  // Inbox / Kept / Archived read the person's own triage (platform.triage_items).
  const triageView: TriageState | null =
    !sample && (state.view.kind === "inbox" || state.view.kind === "kept" || state.view.kind === "archived")
      ? state.view.kind
      : null;
  const triage = useTriage(triageView, !sample);
  const hubTags = useHubTags(!sample);
  const triageHits = (triage.list.hits ?? []).filter(
    (h) => !state.query.text || h.title.toLowerCase().includes(state.query.text.toLowerCase()),
  );
  const triageSections: SectionState[] = triageView
    ? [
        {
          key: "sources",
          status: triage.list.status === "error" ? "error" : triage.list.status === "ready" ? "ready" : "loading",
          section: {
            key: "sources",
            label: TRIAGE_LABEL[triageView],
            count: triage.list.hits.length,
            items: triageHits,
            next_cursor: triage.list.nextCursor,
            error: triage.list.error ? { message: triage.list.error, retryable: true } : null,
          },
          loadingMore: triage.list.loadingMore,
          moreError: null,
        },
      ]
    : [];
  // Triage lists read the person's own rows; they filter by words only. Any
  // other filter (a #tag, a type…) is said, with the way to apply it.
  const triageFiltered =
    Boolean(triageView) &&
    Object.keys(normalizeQuery(state.query)).some((k) => !["text", "mode", "state", "sort"].includes(k));
  const [tagFor, setTagFor] = useState<KnowledgeHit[] | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  /** Bumped after a tag/file write: the peek remounts and re-reads where the item is filed. */
  const [filedVersion, setFiledVersion] = useState(0);

  const trashView = state.view.kind === "trash";
  // The Transcripts view reads the transcripts list's own server functions: every filter,
  // count and total over the WHOLE set, and search reaching into the transcript text.
  const transcriptsView = presetKey === "transcripts";
  const facetSel = transcriptsView ? facetSelectionFromGroup(state.group) : {};
  const listRestore = useListRestore(listRestoreKey(state));
  const transcriptList = useTranscriptList({
    enabled: transcriptsView && !sample && !trashView,
    text: state.query.text ?? "",
    selection: facetSel,
    orgId: effectiveQuery.organizations?.length === 1 ? effectiveQuery.organizations[0] : null,
    sort: state.query.sort === "title" ? "title" : "updated",
    initialDepth: listRestore.saved?.depth,
  });
  const serverTranscripts = transcriptsView && !sample && !trashView;
  /** After a write, every list that could show the change reads again. */
  const refreshResults = () => {
    results.refresh();
    if (serverTranscripts) transcriptList.refresh();
  };
  const listSections: SectionState[] = serverTranscripts ? transcriptList.sections : results.sections;
  const baseHits: KnowledgeHit[] =
    triageView
      ? triageHits
      : state.view.kind === "favorites"
      ? favoriteHits
      : serverTranscripts
        ? transcriptList.hits
        : searching
          ? searchHitsByItem(results.sections)
          : browseHits(results.sections);
  // Stage (Sources only): read from source_list_facts for the loaded Sources.
  const loadedSourceIds = baseHits.map(stageSourceId).filter((id): id is string => Boolean(id));
  const stages = useSourceStages(loadedSourceIds, !sample && !trashView);
  // Transcript rows' own fields (Status, Folder, Visibility, session vs cleanup) — H6d.
  const transcriptFacts = useTranscriptFacts(baseHits, !sample && !trashView);
  /** A transcript row's own fields: the server's list row when this view read it, else the facts read. */
  const factFor = (h: KnowledgeHit) => transcriptList.rowFor(h) ?? transcriptFacts.factFor(h);
  // Browsing a list, newest first: the rows arrive section by section (Sources, then records),
  // so they are put in date order here — the list sections them by day (Granola), and j/k walk
  // the same order the eye does. A title sort keeps its own order and no date sections.
  const dateOrdered = !searching && state.query.sort !== "title";
  // Facets filter on the server (useTranscriptList); only Stage narrows loaded Sources here,
  // and it says so ("Of N loaded").
  const narrowedHits = narrowByStage(baseHits, state.stage, stages.stageFor);
  // Sample data is a fixture held whole in the page, so its facets narrow it here.
  const facetedHits = sample && transcriptsView ? narrowByTranscriptFacets(narrowedHits, facetSel, factFor) : narrowedHits;
  // The server already orders the Transcripts view (newest first, or by relevance when searching).
  const hits: KnowledgeHit[] = dateOrdered && !serverTranscripts ? newestFirst(facetedHits) : facetedHits;
  const moreToLoad = listSections.some((s) => s.key !== "top_hit" && Boolean(s.section?.next_cursor));
  const stageNote = moreToLoad
    ? `Of ${loadedSourceIds.length} loaded`
    : null;
  const byKey = new Map(baseHits.map((h) => [hitKey(h), h]));
  const peekKey = state.peek ? `${state.peek.entity}:${state.peek.id}` : null;
  const peekHit = peekKey ? (byKey.get(peekKey) ?? null) : null;
  const selectedHits = [...selected].map((k) => byKey.get(k)).filter((h): h is KnowledgeHit => !!h);
  const title = viewTitle(state.view, sidebar);
  const openSavedView =
    state.view.kind === "saved"
      ? (sidebar.savedViews.items.find((v) => v.id === (state.view as { id: string }).id) ?? null)
      : presetSavedView;
  // The open view's OWN filters never show as removable chips — its name already says
  // them. A saved view is the person's own filter set, so its filters stay visible.
  const viewBaseQuery = selectionQuery(
    state.view,
    state.view.kind === "preset" ? presetDef : state.view.kind === "saved" ? (openSavedView?.definition ?? null) : null,
  ).query;
  const viewOwnQuery = state.view.kind === "saved" ? undefined : viewBaseQuery;
  const dirty = openSavedView ? viewIsDirty(openSavedView.definition, { query: state.query, layout: state.layout }) : false;
  // `library:*` waits on the libraries read; when that read FAILED it must say
  // so — "pending" forever ("Reading your libraries…") or "no libraries" are
  // both untrue then (RC-B12).
  const librariesRead = sidebar.containers.media_source_library;
  const librariesFailed = expanded.status === "pending" && librariesRead.status === "error";
  const noLibraries = expanded.status === "empty" && librariesRead.status === "ready";
  const expanding = expanded.status === "pending" && !librariesFailed;

  // A view LINK (`/knowledge?view=saved:<id>` with no filters — what a shared
  // view's address is) opens the view: once its definition has loaded, its
  // query and layout land in the URL. Once per view per visit, so clearing a
  // view's filters on purpose is never undone. (Felt in the H5 walk: a
  // teammate opening the shared link saw Everything.)
  const appliedViewLink = useRef<string | null>(null);
  useEffect(() => {
    if (state.view.kind !== "saved" || !openSavedView?.definition) return;
    if (appliedViewLink.current === openSavedView.id) return;
    appliedViewLink.current = openSavedView.id;
    if (isViewLinkOnly(state)) {
      const { query, layout } = selectionQuery(state.view, openSavedView.definition);
      write({ query, layout: layout ?? state.layout }, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.view, openSavedView?.id, openSavedView?.definition]);
  // The preset's own address: land its definition in the URL once rows have loaded.
  useEffect(() => {
    if (!presetKey || !presetDef || sidebar.savedViews.status === "loading") return;
    if (appliedPreset.current === presetKey) return;
    appliedPreset.current = presetKey;
    write({ query: mergePresetQuery(presetDef.query, state.query) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, presetDef, sidebar.savedViews.status]);
  // Known only when every section ANSWERED with a count: no sections yet (loading) or a section
  // that failed leaves the total unknown (undefined), never a confident 0.
  const total =
    listSections.length > 0 &&
    listSections.every((s) => s.status !== "error" && typeof s.section?.count === "number")
    ? listSections
        .filter((s) => s.key !== "top_hit" && s.key !== "segments")
        .reduce((n, s) => n + (s.section?.count ?? 0), 0)
    : undefined;

  // The person narrowed the view beyond its own definition (the empty sentence says "these filters").
  const viewFiltered =
    JSON.stringify(normalizeQuery(state.query)) !== JSON.stringify(normalizeQuery(viewBaseQuery));
  // "24 of 180" while more pages wait; "3 matching" when facets or Stage narrow the loaded rows.
  const narrowed = hits.length !== baseHits.length;
  const resultNoun = transcriptsView ? "transcript" : "item";
  const plural = (n: number) => `${n.toLocaleString("en-US")} ${resultNoun}${n === 1 ? "" : "s"}`;
  const resultCount =
    (searching && !serverTranscripts) ||
    triageView ||
    state.view.kind === "favorites" ||
    listSections.some((s) => s.status === "loading") ||
    // A section whose read failed makes any total short: no count, the section says the failure (RC-B12).
    listSections.some((s) => s.status === "error")
      ? null
      : narrowed
        ? `${hits.length.toLocaleString("en-US")} matching`
        : typeof total === "number" && total > hits.length
          ? `${hits.length.toLocaleString("en-US")} of ${plural(total)}`
          : hits.length
            ? plural(hits.length)
            : null;

  const write = (next: Partial<HubState>, opts?: { replace?: boolean }) =>
    setState({ ...state, ...next }, opts);

  const select = (picked: HubView) => {
    // A saved view that IS an addressable preset opens as the preset (its facets and address, H6d).
    const pickedPreset =
      picked.kind === "saved" ? sidebar.savedViews.items.find((v) => v.id === picked.id)?.preset : null;
    const view: HubView =
      pickedPreset && isHubPresetViewKey(pickedPreset) ? { kind: "preset", key: pickedPreset } : picked;
    if (view.kind === "preset") appliedPreset.current = view.key;
    const def =
      view.kind === "saved"
        ? (sidebar.savedViews.items.find((v) => v.id === view.id)?.definition ?? null)
        : null;
    if (view.kind === "saved" && !def) {
      toast.error("This saved view's definition could not be read, so it cannot be opened. It still exists; nothing was changed.");
      return;
    }
    const { query, layout } = selectionQuery(view, view.kind === "preset" ? presetDefFor(view.key) : def);
    setSelected(new Set());
    setFocusedKey(null);
    setMobilePane("main");
    write({ view, query, layout: layout ?? state.layout, peek: null, group: {} });
    if (picked.kind === "saved") {
      const sv = sidebar.savedViews.items.find((v) => v.id === picked.id);
      if (sv?.mine && !sample)
        void touchView(sv)
          .then(() => sidebar.savedViews.retry())
          .catch((err: unknown) =>
            recordToast.warning(
              { type: "platform_saved_view", id: sv.id, title: sv.name },
              `Opened, but "last used" was not recorded: ${err instanceof Error ? err.message : "the server refused."}`,
            ),
          );
    }
  };

  // ─── saved views (Linear custom views) ────────────────────────────────────

  const afterViewWrite = () => {
    sidebar.savedViews.retry();
    refreshCounts();
  };

  const saveNewView = async (values: SaveViewValues) => {
    if (sample) throw new Error(SAMPLE_WRITE_REFUSAL);
    let organizationId: string;
    try {
      organizationId = await ensureOrgId(activeOrgId);
    } catch (err) {
      // A saved view is filed in an organization. The dialog prints what it catches, so it
      // gets the platform's sentence with the remedy — never the transport's.
      if (isOrganizationRequiredError(err))
        throw new Error(organizationRefusalMessage({ subject: "This view", act: "saved" }));
      throw err;
    }
    const { id, pinError } = await createHubView({
      name: values.name,
      organizationId,
      shared: values.shared,
      pinned: values.pinned,
      definition: {
        query: normalizeQuery(state.query),
        layout: state.layout,
        notifyNewMatches: values.notify,
      },
    });
    afterViewWrite();
    write({ view: { kind: "saved", id } });
    const ref = { type: "platform_saved_view", id, title: values.name };
    if (pinError) recordToast.error(ref, pinError);
    else
      recordToast.success(
        ref,
        `Saved view "${values.name}"${values.shared ? `, shared with ${activeOrgName ?? "your organization"}` : ""}.`,
      );
  };

  const runViewWrite = async (v: HubSavedView, fn: () => Promise<unknown>, done: string) => {
    const ref = { type: "platform_saved_view", id: v.id, title: v.name };
    try {
      await fn();
      recordToast.success(ref, done);
      afterViewWrite();
    } catch (err) {
      // "Duplicate" files the copy in an organization; with none selected, say so with the remedy.
      if (presentOrganizationRefusal(err, { subject: `"${v.name}"`, act: "changed" })) return;
      recordToast.error(ref, err instanceof Error ? err.message : "The view was not changed.");
    }
  };

  const onViewAction = async (v: HubSavedView, action: SavedViewAction) => {
    if (sample && action !== "open") {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    const current = { query: normalizeQuery(state.query), layout: state.layout };
    switch (action) {
      case "open":
        return select({ kind: "saved", id: v.id });
      case "rename":
        return setSaveDialog({ mode: "rename", view: v });
      case "save_changes":
        return runViewWrite(v, () => saveViewChanges(v, current), `Saved the current filters to "${v.name}".`);
      case "share":
        return runViewWrite(v, () => setViewShared(v, true), `"${v.name}" is shared with the organization.`);
      case "unshare":
        return runViewWrite(v, () => setViewShared(v, false), `"${v.name}" is personal again.`);
      case "notify_on":
        return runViewWrite(v, 
          () => setViewNotify(v, true),
          `Noted. You'll be notified of new matches for "${v.name}" once notifications ship (coming soon).`,
        );
      case "notify_off":
        return runViewWrite(v, () => setViewNotify(v, false), `No notifications for "${v.name}".`);
      case "pin":
        return runViewWrite(v, () => setViewPinned(v.id, true), `Pinned "${v.name}" to your sidebar.`);
      case "unpin":
        return runViewWrite(v, () => setViewPinned(v.id, false), `Unpinned "${v.name}".`);
      case "duplicate":
        return runViewWrite(v, async () => {
          const { id, pinError } = await duplicateView(v, await ensureOrgId(activeOrgId));
          if (pinError) throw new Error(pinError);
          write({ view: { kind: "saved", id }, query: v.definition?.query ?? state.query, layout: v.definition?.layout ?? state.layout });
        }, `Made a personal copy of "${v.name}".`);
      case "delete": {
        const ok = await confirm({
          title: `Delete "${v.name}"?`,
          description:
            v.visibility !== "personal"
              ? "The view disappears for everyone in the organization it is shared with. The items it shows are not touched."
              : "The view disappears from your sidebar. The items it shows are not touched.",
          confirmLabel: "Delete view",
          variant: "destructive",
        });
        if (!ok) return;
        return runViewWrite(v, async () => {
          await deleteView(v);
          if (state.view.kind === "saved" && state.view.id === v.id) write({ view: { kind: "everything" } });
        }, `Deleted "${v.name}".`);
      }
    }
  };

  // ─── favorites (platform.user_entity_state only) ──────────────────────────

  const favoriteKeys = new Set(sidebar.favorites.items.map((f) => `${f.entity}:${f.id}`));
  const toggleFavorite = async (hit: KnowledgeHit) => {
    if (sample) {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    const target = actionTarget(hit);
    const on = !favoriteKeys.has(`${target.entity}:${target.id}`);
    const res = await favoritesService.setFavorite(target.entity, target.id, on);
    const ref = { type: target.entity, id: target.id, title: target.title };
    if (isScopesRpcErr(res)) {
      const why = (res.error as { message?: string })?.message ?? "the server refused.";
      recordToast.error(ref, `"${target.title}" was not ${on ? "added to" : "removed from"} Favorites: ${why}`);
      return;
    }
    sidebar.favorites.retry();
    recordToast.success(ref, on ? `Added "${target.title}" to Favorites.` : `Removed "${target.title}" from Favorites.`);
  };

  const openPeek = (hit: KnowledgeHit) => {
    setFocusedKey(hitKey(hit));
    write({ peek: { entity: hit.entity, id: hit.id } }, { replace: true });
  };
  const closePeek = () => write({ peek: null }, { replace: true });
  const openFull = (hit: KnowledgeHit) => {
    const href = openFullHref(hit);
    if (!href) {
      toast.info(`${tokenLabel(hit.entity)} has no page of its own yet; the peek shows everything the hub knows about it.`);
      return;
    }
    router.push(href);
  };
  const toggleSelect = (hit: KnowledgeHit) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const k = hitKey(hit);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  // ─── transcript rows (the retired Transcripts list's actions, H6d) ─────────

  const [renamingKey, setRenamingKey] = useState<string | null>(null);
  const sourceHref = (id: string) => tryGetEntityInfo("processed_document")?.hrefFor?.(id) ?? null;
  const transcriptKindLabel = (row: TranscriptListRow) =>
    TRANSCRIPT_KIND_LABEL[row.kind as HubTranscriptKind] ?? row.kind;
  const transcriptLink = (row: TranscriptListRow) => transcriptRowHref(row, sourceHref);
  const absolute = (href: string) => (href.startsWith("http") ? href : `${window.location.origin}${href}`);

  const copyText = async (text: string, done: string) => {
    try {
      await writeClipboard(text);
      toast.success(done);
    } catch (err) {
      toast.error(`Nothing was copied: ${err instanceof Error ? err.message : "the clipboard refused."}`);
    }
  };

  const transcriptAgentPayload = (rows: TranscriptListRow[]) =>
    buildAgentPayload({
      kind: rows.length === 1 ? TRANSCRIPT_COPY_ROW_KIND : TRANSCRIPT_COPY_LIST_KIND,
      location: "/knowledge?view=transcripts",
      description:
        rows.length === 1
          ? "One transcript item from the Knowledge hub — a transcript, studio session, cleanup session or transcript Source. Metadata only; no transcript body."
          : "Transcript items selected in the Knowledge hub. Metadata only; no transcript bodies.",
      data: rows.length === 1 ? transcriptCopyAgent(rows[0], transcriptLink(rows[0])) : rows.map((r) => transcriptCopyAgent(r, transcriptLink(r))),
      attributes: { rows: rows.length },
    });

  const onTranscriptAction = (hit: KnowledgeHit, action: TranscriptMenuAction) => {
    const fact = factFor(hit);
    const href = fact ? transcriptLink(fact) : (openFullHref(hit) ?? `/knowledge?peek=${hit.entity}:${hit.id}`);
    switch (action) {
      case "rename":
        if (sample) return toast.info(SAMPLE_WRITE_REFUSAL);
        setRenamingKey(hitKey(hit));
        return;
      case "copy":
        if (fact) void copyText(transcriptCopyHuman(fact, transcriptKindLabel(fact)), "Copied");
        return;
      case "copy-ai":
        if (fact) void copyText(transcriptAgentPayload([fact]), "Copied for AI");
        return;
      case "copy-link":
        void copyText(absolute(href), "Link copied");
        return;
      case "copy-reference":
        void copyText(
          buildRecordReferenceFence({ type: transcriptReferenceType(hit), id: hit.id, label: hit.title }),
          "Reference copied",
        );
        return;
    }
  };

  const commitRename = async (hit: KnowledgeHit, title: string) => {
    setRenamingKey(null);
    const fact = factFor(hit);
    const ref = { type: hit.entity, id: hit.id, title: hit.title };
    if (!fact) {
      recordToast.error(ref, `"${hit.title}" was not renamed: its record has not been read yet. Try again in a moment.`);
      return;
    }
    if (title.trim() === hit.title.trim()) return;
    try {
      await saveTranscriptRowEdit(fact, { title });
      recordToast.success({ ...ref, title: title.trim() }, `Renamed to "${title.trim()}".`);
      transcriptFacts.refresh();
      refreshResults();
    } catch (err) {
      recordToast.error(ref, `"${hit.title}" was not renamed: ${err instanceof Error ? err.message : "the server refused."}`);
    }
  };

  // Every row's menu (HubRowMenu): the keyboard's actions first, the kind's own destinations
  // under "Open with", then Copy, then Trash. The same verbs the keys advertise (s, e, t, m).
  const rowMenuNode = (hit: KnowledgeHit) => {
    const transcript = isTranscriptHit(hit);
    const entries = transcript ? transcriptMenu(hit, factFor(hit), sourceHref) : [];
    const opens = entries.filter((e) => e.section === "open" && e.href);
    const open = openFullHref(hit);
    const ref = entries.length ? (a: TranscriptMenuAction) => entries.some((e) => e.action === a) : () => false;
    const groups: HubMenuGroup[] = [
      {
        id: "main",
        items: [
          { id: "open", label: "Open", icon: ArrowUpRight, href: open, shortcut: "⌘↵" },
          ...(open ? [] : [{ id: "peek", label: "Open", icon: ArrowUpRight, onSelect: () => openPeek(hit), shortcut: "↵" }]),
          ...(hit.triage_state !== "kept"
            ? [{ id: "keep", label: "Keep", icon: Check, onSelect: () => void doTriage([hit], "kept"), shortcut: "S" }]
            : []),
          ...(hit.triage_state !== "archived"
            ? [{ id: "archive", label: "Archive", icon: Archive, onSelect: () => void doTriage([hit], "archived"), shortcut: "E" }]
            : []),
          ...(hit.triage_state && hit.triage_state !== "inbox"
            ? [{ id: "inbox", label: "Back to Inbox", icon: Inbox, onSelect: () => void doTriage([hit], "inbox"), shortcut: "I" }]
            : []),
          { id: "tag", label: "Tag…", icon: Hash, onSelect: () => setTagFor([hit]), shortcut: "T" },
          { id: "file", label: "File to…", icon: FolderInput, onSelect: () => setFileUnderFor([hit]), shortcut: "M" },
          ...(ref("rename") ? [{ id: "rename", label: "Rename", icon: Pencil, onSelect: () => onTranscriptAction(hit, "rename") }] : []),
        ],
      },
      ...(opens.length
        ? [
            {
              id: "open-with",
              submenu: { label: "Open with", icon: AppWindow },
              items: opens.map((e) => ({ id: e.id, label: e.label, icon: ArrowUpRight, href: e.href })),
            },
          ]
        : []),
      {
        id: "copy",
        submenu: { label: "Copy", icon: Copy },
        items: [
          ...(ref("copy") ? [{ id: "copy", label: "Copy", icon: Copy, onSelect: () => onTranscriptAction(hit, "copy") }] : []),
          ...(ref("copy-ai") ? [{ id: "copy-ai", label: "Copy for AI", icon: Sparkles, onSelect: () => onTranscriptAction(hit, "copy-ai") }] : []),
          {
            id: "copy-link",
            label: "Copy link",
            icon: Link2,
            onSelect: () => void copyText(absolute(open ?? `/knowledge?peek=${hit.entity}:${encodeURIComponent(hit.id)}`), "Link copied"),
          },
          {
            id: "copy-reference",
            label: "Copy reference",
            icon: ClipboardCopy,
            onSelect: () =>
              void copyText(
                buildRecordReferenceFence({ type: transcriptReferenceType(hit), id: hit.id, label: hit.title }),
                "Reference copied",
              ),
          },
        ],
      },
      { id: "trash", items: [{ id: "trash", label: "Move to Trash", icon: Trash2, destructive: true, onSelect: () => void doTrash([hit]) }] },
    ];
    return <HubRowMenu title={hit.title} groups={groups} />;
  };

  const selectedTranscriptRows = selectedHits
    .map((h) => factFor(h))
    .filter((r): r is TranscriptListRow => Boolean(r));
  const selectedTranscriptHits = selectedHits.filter(isTranscriptHit).length;

  const doTranscriptExport = async () => {
    const copy = transcriptExportConfirm(selectedTranscriptRows.length, selectedTranscriptHits);
    const ok = await confirm({ title: copy.title, description: copy.description, confirmLabel: copy.confirmLabel });
    if (!ok) return;
    try {
      const out = exportTranscriptRows(selectedTranscriptRows, { linkFor: (r) => absolute(transcriptLink(r)), kindLabel: transcriptKindLabel });
      toast.success(out.message ?? "Exported.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nothing was exported.");
    }
  };

  const handlers: ResultHandlers = {
    selected,
    focusedKey,
    peekKey,
    onToggleSelect: toggleSelect,
    onFocus: (h) => setFocusedKey(hitKey(h)),
    onOpen: openPeek,
    onOpenFull: openFull,
    onFilterTag: (name) => filterByTag(name),
    rowMenu: rowMenuNode,
    rowFacts: (h) =>
      isTranscriptHit(h) ? transcriptRowFacts(factFor(h), transcriptFacts.contentFor(h)) : [],
    rowContent: (h) => {
      if (!isTranscriptHit(h)) return undefined;
      const c = transcriptFacts.contentFor(h);
      return c ? { ...c, icon: TRANSCRIPT_MEDIA_ICON[c.mediaKind] } : undefined;
    },
    renamingKey,
    onRenameCommit: (h, title) => void commitRename(h, title),
    onRenameCancel: () => setRenamingKey(null),
  };

  // ─── writes ───────────────────────────────────────────────────────────────

  const doFileUnder = async (items: KnowledgeHit[], container: FileUnderContainer) => {
    if (sample) {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    setBusy(true);
    try {
      const outcome = await fileUnder(items, container, {
        add: (args) =>
          isAssociationTargetType(args.targetType)
            ? associationsService.add({ ...args, targetType: args.targetType })
            : Promise.resolve({
                ok: false as const,
                error: { message: `${tokenLabel(args.targetType)} is not a place things can be filed under.` },
              }),
        labelFor: tokenLabel,
      });
      if (outcome.failed.length) toast.error(outcome.sentence);
      else toast.success(outcome.sentence);
      if (outcome.ok) {
        setFiledVersion((n) => n + 1);
        refreshResults();
      }
    } finally {
      setBusy(false);
    }
  };

  const acceptSuggestion = (hit: KnowledgeHit, target: FiledRef) =>
    void doFileUnder([hit], { token: target.type, id: target.id, title: target.name ?? "Untitled" });

  // ─── triage (Readwise Reader) and tags ────────────────────────────────────

  /** Keep a Source through its keep door (which starts its processing), then file it. */
  const triageDoor = async (token: string, id: string, next: TriageState, orgId?: string | null) => {
    if (next === "kept" && token === "processed_document") {
      try {
        await keepSource(id, { organizationId: await ensureOrgId(orgId ?? activeOrgId) });
      } catch (err) {
        throw new Error(sourceRefusalSentence(err));
      }
    }
    await setTriageState(token, id, next);
  };

  const afterTriageWrite = () => {
    triage.refresh();
    refreshResults();
  };

  const doTriage = async (items: KnowledgeHit[], next: TriageState) => {
    if (sample) {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    if (!items.length) return;
    setBusy(true);
    try {
      const outcome = await triageItems(items, next, triageDoor);
      if (outcome.ok && triageView && triageView !== next) {
        const moved = new Set(
          uniqueTargets(items)
            .filter((t) => !outcome.failed.some((f) => f.target.id === t.id))
            .map((t) => `${t.entity}:${t.id}`),
        );
        const nextFocus = nextFocusAfterRemoval(hits.map(hitKey), moved, focusedKey);
        triage.removeLocally(moved);
        setFocusedKey(nextFocus);
        if (peekKey && moved.has(peekKey)) {
          const nh = nextFocus ? byKey.get(nextFocus) : undefined;
          write({ peek: nh ? { entity: nh.entity, id: nh.id } : null }, { replace: true });
        }
      }
      setSelected(new Set());
      const undo = outcome.undo.length
        ? {
            label: "Undo",
            onClick: () =>
              void undoTriage(outcome.undo, setTriageState).then((u) => {
                if (u.failed.length) toast.error(u.sentence);
                else toast.success(u.sentence);
                afterTriageWrite();
              }),
          }
        : undefined;
      if (outcome.failed.length) toast.error(outcome.sentence, undo ? { action: undo } : undefined);
      else toast.success(outcome.sentence, undo ? { action: undo } : undefined);
      if (outcome.ok) afterTriageWrite();
    } finally {
      setBusy(false);
    }
  };

  const doTag = async (items: KnowledgeHit[], name: string) => {
    if (sample) {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    setBusy(true);
    try {
      const outcome = await tagItems(items, name, fileUnderTag);
      if (outcome.failed.length || !outcome.ok) toast.error(outcome.sentence);
      else toast.success(outcome.sentence);
      if (outcome.ok) {
        setFiledVersion((n) => n + 1);
        hubTags.retry();
        refreshResults();
        triage.refresh();
      }
    } finally {
      setBusy(false);
    }
  };

  /** `#tag` → filter by it (the chip resolves to the tag scope when the query runs). */
  const filterByTag = (name: string) => {
    setSelected(new Set());
    setFocusedKey(null);
    write({
      view: { kind: "everything" },
      query: normalizeQuery({ mode: "find", within: [{ type: TAG_REF_TYPE, name }] }),
      peek: null,
    });
  };

  const doTrash = async (items: KnowledgeHit[]) => {
    if (sample) {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    const targets = uniqueTargets(items);
    const what = targets.length === 1 ? `"${targets[0].title}"` : `these ${targets.length} items`;
    const ok = await confirm({
      title: targets.length === 1 ? "Move to Trash?" : `Move ${targets.length} items to Trash?`,
      description: archiveConfirmSentence(what),
      confirmLabel: "Move to Trash",
      variant: "destructive",
    });
    if (!ok) return;
    setBusy(true);
    try {
      // A Source goes through its own trash door (a file's extract goes with its file).
      const outcome = await trashItems(items, async (token, id, noun) => {
        if (token !== "processed_document") return archiveRecord(token, id, noun);
        const row = (await readActionableSources([id])).get(id);
        if (!row) throw new Error(`${noun} is no longer listed, so it was not moved.`);
        await trashSource(row);
      });
      if (outcome.failed.length) toast.error(outcome.sentence);
      else toast.success(outcome.sentence);
      setSelected(new Set());
      if (outcome.ok) {
        if (peekKey && targets.some((t) => `${t.entity}:${t.id}` === peekKey)) closePeek();
        refreshResults();
      }
    } finally {
      setBusy(false);
    }
  };

  // ─── Sources: attach, process now, job progress (from the retired Sources page) ─

  const runner = useProcessingRunner();
  const [jobsOpen, setJobsOpen] = useState(false);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [saveTarget, setSaveTarget] = useState<SaveTarget | null>(null);
  const runningJobs = runner.jobs.filter((j) => j.status === "running").length;

  const sourceTargets = (items: KnowledgeHit[]) => uniqueTargets(items).filter((t) => t.entity === "processed_document");
  const skippedSentence = (items: KnowledgeHit[]) => {
    const skipped = uniqueTargets(items).length - sourceTargets(items).length;
    return skipped ? ` ${skipped === 1 ? "1 item is" : `${skipped} items are`} not a Source and ${skipped === 1 ? "was" : "were"} skipped.` : "";
  };

  const doAttach = async (items: KnowledgeHit[]) => {
    if (sample) {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    const ids = sourceTargets(items).map((t) => t.id);
    if (!ids.length) {
      toast.info("Attach works on Sources; none of the selected items is a Source.");
      return;
    }
    try {
      const rows = [...(await readActionableSources(ids)).values()];
      if (!rows.length) throw new Error("None of the selected Sources could be read, so nothing was attached.");
      setSaveTarget({
        items: rows.map((r) => ({
          processedDocumentId: r.id,
          name: r.name,
          organizationId: r.organization_id,
          isFileExtract: isFileCanonicalExtract(r),
        })),
        notices: [],
        defaultSave: false,
      });
      const skipped = skippedSentence(items);
      if (skipped) toast.info(skipped.trim());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The selected Sources could not be read.");
    }
  };

  const doProcess = async (items: KnowledgeHit[], label = "Processing") => {
    if (sample) {
      toast.info(SAMPLE_WRITE_REFUSAL);
      return;
    }
    const ids = sourceTargets(items).map((t) => t.id);
    if (!ids.length) {
      toast.info("Process now works on Sources; none of the selected items is a Source.");
      return;
    }
    setBusy(true);
    try {
      const rows = [...(await readActionableSources(ids)).values()];
      const outcome = await runSourceBulk(label, rows, (r) =>
        processSourceRow(r, stages.facts.get(r.id)?.currentDocumentId ?? null),
      );
      const sentence = `${outcome.sentence}${skippedSentence(items)}`;
      if (outcome.ok) toast.success(sentence);
      else toast.error(sentence);
      setSelected(new Set());
      stages.refresh();
      refreshResults();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Nothing was processed.");
    } finally {
      setBusy(false);
    }
  };

  const toggleStage = (st: HubStage) =>
    write({ stage: state.stage.includes(st) ? state.stage.filter((x) => x !== st) : [...state.stage, st] });

  const stageColumn = sample
    ? undefined
    : {
        label: (h: KnowledgeHit) => {
          const id = stageSourceId(h);
          if (!id) return "—";
          const st = stages.stageFor(id);
          return st ? HUB_STAGE_LABEL[st] : "Checking…";
        },
        cell: (h: KnowledgeHit) => {
          const id = stageSourceId(h);
          if (!id) return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <SourceStageCell
              facts={stages.facts.get(id)}
              read={{ loading: stages.loading, failed: stages.failedIds.has(id), retrying: false }}
              busy={busy}
              onReindex={() => void doProcess([h], "Re-indexing")}
              onRetryRead={() => stages.retry([id])}
            />
          );
        },
      };

  // ─── agent surface (the Knowledge Library surface the Sources page emitted) ─

  const peekSourceId = state.peek?.entity === "processed_document" ? state.peek.id : null;
  const getScope = () =>
    buildRagLibraryContextData({
      view: "library",
      summary: null,
      documents: hubSourceSummaries(hits, stages.facts),
      totalMatches: loadedSourceIds.length,
      searchQuery: state.query.text ?? "",
      statusFilter: "all",
      listLoading: results.sections.some((s) => s.status === "loading"),
      listError: null,
      selectedDocumentId: peekSourceId,
      jobs: runner.jobs,
      selectionText: typeof window !== "undefined" ? (window.getSelection()?.toString() ?? "") : "",
    });
  const getWriteHandlers = () =>
    buildHubWriteHandlers({
      setSearch: (text) => write({ query: normalizeQuery({ ...state.query, text }) }),
      showAllSources: () =>
        write({
          view: { kind: "kind", key: "processed_document" },
          query: { mode: "find", types: ["processed_document"], ...(state.query.text ? { text: state.query.text } : {}) },
          stage: [],
          peek: null,
        }),
      listedSourceIds: () => new Set(loadedSourceIds),
      openSource: (id) => write({ peek: { entity: "processed_document", id } }, { replace: true }),
      setCatalogFilters: (value) => {
        // The catalog's filters (the retired catalog list's write target) shape the Library catalog group.
        const current = state.view.kind === "group" && state.view.token === "library_catalog" ? state.group : {};
        const group = catalogFiltersToGroup(current, value);
        write({ view: { kind: "group", token: "library_catalog" }, query: { mode: "find" }, peek: null, group });
      },
    });

  // ─── keyboard (Linear) ────────────────────────────────────────────────────

  const moveFocus = (delta: number) => {
    if (!hits.length) return;
    const i = focusedKey ? hits.findIndex((h) => hitKey(h) === focusedKey) : -1;
    const next = Math.max(0, Math.min(hits.length - 1, i + delta));
    const h = hits[next];
    setFocusedKey(hitKey(h));
    if (state.peek) write({ peek: { entity: h.entity, id: h.id } }, { replace: true });
    if (typeof document !== "undefined")
      document.querySelector(`[data-hit-key="${CSS.escape(hitKey(h))}"]`)?.scrollIntoView({ block: "nearest" });
  };

  const onKey = (e: KeyboardEvent) => {
    if (fileUnderFor || filtersOpen || saveDialog || tagFor || helpOpen) return;
    // A container group lists links, not results: the result keys do not apply there.
    if (state.view.kind === "group") return;
    if (document.querySelector("[role=dialog][data-state=open], [role=alertdialog][data-state=open]")) return;
    const focused = focusedKey ? byKey.get(focusedKey) : undefined;
    if (e.key === "Escape") {
      if (isTypingTarget(e.target)) return;
      if (state.peek) {
        e.preventDefault();
        closePeek();
      } else if (selectedHits.length) {
        e.preventDefault();
        setSelected(new Set());
      }
      return;
    }
    if (e.altKey && !e.metaKey && !e.ctrlKey && e.code === "KeyV") {
      e.preventDefault();
      setSaveDialog({ mode: "create" });
      return;
    }
    if (isTypingTarget(e.target)) return;
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      const h = focused ?? peekHit;
      if (h) {
        e.preventDefault();
        openFull(h);
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const command = triageCommandForKey(e);
    if (command) {
      const targets = selectedHits.length ? selectedHits : focused ? [focused] : peekHit ? [peekHit] : [];
      if (command === "help") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (!targets.length) return;
      e.preventDefault();
      if (command === "keep") void doTriage(targets, "kept");
      else if (command === "archive") void doTriage(targets, "archived");
      else if (command === "inbox") void doTriage(targets, "inbox");
      else if (command === "file") setFileUnderFor(targets);
      else if (command === "tag") setTagFor(targets);
      return;
    }
    switch (e.key) {
      case "j":
      case "ArrowDown":
        e.preventDefault();
        moveFocus(1);
        break;
      case "k":
      case "ArrowUp":
        e.preventDefault();
        moveFocus(-1);
        break;
      case "Enter":
        if (focused) {
          e.preventDefault();
          openPeek(focused);
        }
        break;
      case "x":
        if (focused) {
          e.preventDefault();
          toggleSelect(focused);
        }
        break;
      case "f":
        e.preventDefault();
        setFiltersOpen(true);
        break;
      case "/":
        e.preventDefault();
        searchRef.current?.focus();
        break;
      case "a":
        if (peekHit?.suggestions?.length) {
          e.preventDefault();
          acceptSuggestion(peekHit, peekHit.suggestions[0].target);
        }
        break;
    }
  };
  const onKeyRef = useRef(onKey);
  useEffect(() => {
    onKeyRef.current = onKey;
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // ─── pieces ───────────────────────────────────────────────────────────────

  const titleFor = (ref: EntityRef): string => {
    if (ref.name) return ref.name;
    const token = ref.type as (typeof HUB_CONTAINER_TOKENS)[number];
    const row = sidebar.containers[token]?.items.find((r) => r.id === ref.id);
    return row?.title ?? tokenLabel(ref.type);
  };

  const onQueryChange = (next: KnowledgeQuery, opts: { typing: boolean }) =>
    write({ query: normalizeQuery(next), peek: opts.typing ? state.peek : state.peek }, { replace: opts.typing });

  const engineBanner = sample ? (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        Sample data — invented items for trying the hub. Nothing you do here is saved.
      </span>
      <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => write({ data: "live", peek: null })}>
        Show my knowledge
      </button>
    </div>
  ) : results.engine === "title_stand_in" ? (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
      <span className="min-w-0 flex-1">
        Full Knowledge search is not on the server yet, so this is matching titles only — passages, filters beyond type,
        and counts arrive with it.
      </span>
      <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => write({ data: "sample", peek: null })}>
        Try sample data
      </button>
    </div>
  ) : null;

  const bulkBar = selectedHits.length ? (
    <div
      className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs shadow-sm"
      role="toolbar"
      aria-label="Selected items"
    >
      {/* read-gate-exempt: count of rows the person selected on screen, local selection state */}
      <span className="px-1 font-medium tabular-nums">{selectedHits.length} selected</span>
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => setFileUnderFor(selectedHits)}>
        <FolderInput className="h-3.5 w-3.5" /> File under…
      </Button>
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => setTagFor(selectedHits)} title="Tag (t)">
        <Hash className="h-3.5 w-3.5" /> Tag…
      </Button>
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void doTriage(selectedHits, "kept")} title="Keep (s)">
        <Check className="h-3.5 w-3.5" /> Keep
      </Button>
      <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void doTriage(selectedHits, "archived")} title="Archive (e)">
        <Archive className="h-3.5 w-3.5" /> Archive
      </Button>
      {triageView && triageView !== "inbox" ? (
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void doTriage(selectedHits, "inbox")} title="Back to Inbox (i)">
          <Inbox className="h-3.5 w-3.5" /> Back to Inbox
        </Button>
      ) : null}
      {sourceTargets(selectedHits).length ? (
        <>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void doAttach(selectedHits)} title="Attach the selected Sources to a data store, project or Library">
            <Paperclip className="h-3.5 w-3.5" /> Attach…
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" disabled={busy} onClick={() => void doProcess(selectedHits)} title="Make the selected Sources searchable now">
            <Sparkles className="h-3.5 w-3.5" /> Process now
          </Button>
        </>
      ) : null}
      {selectedTranscriptHits ? (
        <>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1 text-xs"
            disabled={busy || !selectedTranscriptRows.length}
            onClick={() => void doTranscriptExport()}
            title={
              selectedTranscriptRows.length
                ? "Download a CSV of the selected transcript items"
                : "Reading the selected transcripts' details…"
            }
          >
            <Download className="h-3.5 w-3.5" /> Export
          </Button>
          {selectedTranscriptRows.length ? (
            <CopyButtons
              label="Transcripts"
              size="sm"
              human={() =>
                selectedTranscriptRows.map((r) => transcriptCopyHuman(r, transcriptKindLabel(r))).join("\n")
              }
              agent={() => transcriptAgentPayload(selectedTranscriptRows)}
              hide={["export"]}
            />
          ) : null}
        </>
      ) : null}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 gap-1 text-xs text-destructive hover:bg-destructive/10"
        disabled={busy}
        onClick={() => void doTrash(selectedHits)}
      >
        <Trash2 className="h-3.5 w-3.5" /> Trash
      </Button>
      <Button size="sm" variant="ghost" className="ml-auto h-7 w-7 p-0" aria-label="Clear selection (Esc)" onClick={() => setSelected(new Set())}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  ) : null;

  const LayoutIcon = LAYOUT_ICON[state.layout];
  // Wide pane: the four layouts side by side. Narrow pane: one button that says the current
  // layout and opens the four (Linear's Display menu) — seven icons do not fit a phone row.
  const layoutSwitch = (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 @2xl:hidden" aria-label={`Layout: ${LAYOUT_LABEL[state.layout]}. Change`}>
          <LayoutIcon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-xs">Layout</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={state.layout} onValueChange={(v) => write({ layout: v as HubLayout })}>
          {(Object.keys(LAYOUT_ICON) as HubLayout[]).map((l) => {
            const Icon = LAYOUT_ICON[l];
            return (
              <DropdownMenuRadioItem key={l} value={l} className="gap-2 text-xs">
                <Icon className="h-3.5 w-3.5" /> {LAYOUT_LABEL[l]}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    <ToggleGroup
      type="single"
      value={state.layout}
      onValueChange={(v) => v && write({ layout: v as HubLayout })}
      aria-label="Layout"
      className="hidden shrink-0 @2xl:flex"
    >
      {(Object.keys(LAYOUT_ICON) as HubLayout[]).map((l) => {
        const Icon = LAYOUT_ICON[l];
        return (
          <ToggleGroupItem key={l} value={l} aria-label={LAYOUT_LABEL[l]} title={LAYOUT_LABEL[l]} className="h-8 w-8 p-0">
            <Icon className="h-4 w-4" />
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
    </>
  );

  // A container group (Data stores, Libraries, the Library catalog): every container of one type,
  // each row opening its record page (the retired list pages' job, H6b).
  const groupView = state.view.kind === "group" ? state.view : null;
  const groupMain = groupView ? (
    <div className="flex h-full min-h-0 flex-col gap-2 px-4 pb-2 pt-3 md:px-4">
      <HubContainerGroupView
        key={groupView.token}
        token={groupView.token}
        group={state.group}
        onGroupChange={(group, opts) => write({ group }, opts)}
      />
    </div>
  ) : null;
  // A container's own record page (the store's members and access, a library's resync, a topic's triage).
  const containerRecordHref =
    state.view.kind === "container" ? (tryGetEntityInfo(state.view.type)?.hrefFor?.(state.view.id) ?? null) : null;

  // @container: the toolbar sizes to the MAIN PANE, not the window — with the peek open the
  // pane is narrow on a wide screen, and labels must fold to icons before the search box does.
  const resultsMain = (
    <div className="@container flex h-full min-h-0 flex-col gap-2 px-4 pb-2 pt-3 md:px-4">
      {engineBanner}
      {/* One toolbar, reflowed by the pane's width (CSS order):
            wide   — [search ........][settings][new][save][layout]
                     [facets ....................][count]
            narrow — [search .............................]
                     [facets → scroll]
                     [count ..........][settings][new][save][layout]
          so the search box always gets the full width it needs on a phone. */}
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        <div className="order-1 min-w-0 basis-full @2xl:basis-0 @2xl:flex-1">
          <HubFilterMenu
            open={filtersOpen}
            onOpenChange={setFiltersOpen}
            query={state.query}
            onQueryChange={(q) => write({ query: normalizeQuery(q) })}
            hits={hits}
            // read-gate-exempt: total is undefined (unknown) unless every section answered with a count
            total={total}
            stage={
              sample || trashView
                ? undefined
                : {
                    selected: state.stage,
                    counts: stageCounts(baseHits, stages.stageFor),
                    onToggle: toggleStage,
                    note: stageNote,
                  }
            }
          >
            <div>
              <HubSearchBox
                ref={searchRef}
                query={state.query}
                onQueryChange={onQueryChange}
                onOpenFilters={() => setFiltersOpen(true)}
                titleFor={titleFor}
                viewQuery={viewOwnQuery}
                placeholder={
                  state.view.kind === "preset" || state.view.kind === "kind"
                    ? `Search ${title.toLowerCase()}`
                    : undefined
                }
                onEnterResults={() => {
                  searchRef.current?.blur();
                  if (!focusedKey && hits[0]) setFocusedKey(hitKey(hits[0]));
                }}
              />
            </div>
          </HubFilterMenu>
        </div>
        {/* Trash lists trashed Sources only: views, layouts and search reach do not apply there. */}
        <div className={trashView ? "hidden" : "order-3 flex shrink-0 items-center gap-1 @2xl:order-1"}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label="Search settings" title="Search settings">
                <Settings2 className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel>Search reach</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={organizationReachOf(state.query)}
                onValueChange={(v) =>
                  write({
                    query: normalizeQuery({
                      ...state.query,
                      organizations: v === "active" ? [ACTIVE_ORGANIZATION] : undefined,
                    }),
                  })
                }
              >
                <DropdownMenuRadioItem value="all">Every organization I belong to</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="active" disabled={!activeOrgId}>
                  {activeOrgName ? `Only ${activeOrgName}` : "Only my current organization"}
                </DropdownMenuRadioItem>
                {organizationReachOf(state.query) === "pinned" ? (
                  <DropdownMenuRadioItem value="pinned" disabled>
                    The organizations this link names
                  </DropdownMenuRadioItem>
                ) : null}
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Rerank results</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={rerank === undefined ? "org" : rerank ? "on" : "off"}
                onValueChange={(v) => setRerank(v === "org" ? undefined : v === "on")}
              >
                <DropdownMenuRadioItem value="org">Use my organization&apos;s setting</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="on">Rerank passages (best first, about a second slower)</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="off">Don&apos;t rerank (fastest)</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          {dirty && openSavedView?.mine ? (
            <Button
              size="sm"
              variant="default"
              className="h-8 gap-1.5"
              onClick={() => void onViewAction(openSavedView, "save_changes")}
              title="Save these filters and layout to this view"
            >
              <Save className="h-3.5 w-3.5" /> Save changes
            </Button>
          ) : null}
          {transcriptsView ? (
            <Button asChild size="sm" className="h-8 gap-1.5 px-2.5 @max-3xl:w-8 @max-3xl:px-0">
              <Link href="/transcripts/new" aria-label="New transcript" title="Record, upload or paste a new transcript">
                <Plus className="h-4 w-4" />
                <span className="hidden @3xl:inline">New transcript</span>
              </Link>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setSaveDialog({ mode: "create" })}
            title="Save view (⌥V)"
          >
            <BookmarkPlus className="h-3.5 w-3.5" />
            <span className="hidden @3xl:inline">{dirty ? "Save as new view" : "Save view"}</span>
            <kbd className="ml-0.5 hidden rounded border border-border px-1 text-[10px] text-muted-foreground @4xl:inline">⌥V</kbd>
          </Button>
          {!searching ? layoutSwitch : null}
        </div>
        {!trashView && (transcriptsView || resultCount) ? (
          <>
            {/* Row break on a wide pane: facets and the count start their own line. */}
            <div className="order-2 hidden h-0 basis-full @2xl:block" aria-hidden />
            {transcriptsView ? (
              <div className="order-2 min-w-0 basis-full @2xl:basis-0 @2xl:flex-1">
              <TranscriptFacetBar
                // Whole-set counts from the server (trx_list_facets); Sample data counts its own fixture.
                counts={
                  serverTranscripts
                    ? ((transcriptList.facets ?? {}) as Record<TranscriptFacet, { value: string; count: number }[]>)
                    : transcriptFacetCounts(baseHits, transcriptFacts.factFor)
                }
                selection={facetSel}
                ready={serverTranscripts ? transcriptList.facets !== null || Boolean(transcriptList.facetsError) : true}
                onChange={(next) => {
                  // Scope is one choice (the list's scope), never two at once.
                  const scope = next.scope && next.scope.length > 1 ? [next.scope[next.scope.length - 1]] : next.scope;
                  write({ group: facetSelectionToGroup({ ...next, scope }, state.group) }, { replace: true });
                }}
                note={transcriptList.facetsError}
              />
              </div>
            ) : null}
            <span
              className={cn(
                "order-3 mr-auto shrink-0 text-xs tabular-nums text-muted-foreground @2xl:order-2 @2xl:ml-auto @2xl:mr-0",
                !transcriptsView && "@2xl:ml-0",
              )}
              aria-live="polite"
            >
              {/* read-gate-exempt: resultCount is null whenever any section's read is loading or failed — gated where it is derived */}
              {resultCount}
            </span>
          </>
        ) : null}
      </div>
      {bulkBar}
      {transcriptFacts.status === "error" && transcriptFacts.error ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs" role="status">
          <span className="min-w-0 flex-1">
            {transcriptFacts.error} Other rows are unaffected.
            <ErrorAlchemyMenu error={transcriptFacts.error} size="xs" />
          </span>
          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={transcriptFacts.retry}>
            Retry
          </button>
        </div>
      ) : null}
      {state.stage.length && !trashView ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="status">
          <span className="text-muted-foreground">Stage:</span>
          {state.stage.map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => toggleStage(st)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 hover:bg-accent"
              aria-label={`Remove the ${HUB_STAGE_LABEL[st]} filter`}
            >
              {HUB_STAGE_LABEL[st]} <X className="h-3 w-3" />
            </button>
          ))}
          {stageNote ? <span className="text-muted-foreground">{stageNote}</span> : null}
        </div>
      ) : null}
      {!trashView && stages.failedIds.size ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs" role="status">
          <span className="min-w-0 flex-1">
            The status of {stages.failedIds.size === 1 ? "1 Source" : `${stages.failedIds.size} Sources`} could not be read. Other rows are unaffected.
            <ErrorAlchemyMenu size="xs" />
          </span>
          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => stages.retry([...stages.failedIds])}>
            Retry all
          </button>
        </div>
      ) : null}
      {triageFiltered ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground" role="status">
          <span className="min-w-0 flex-1">
            {title} filters by words only.
          </span>
          <button
            type="button"
            className="font-medium text-foreground underline-offset-2 hover:underline"
            onClick={() => write({ view: { kind: "everything" }, query: normalizeQuery({ ...state.query, state: undefined }), peek: null })}
          >
            Apply them to Everything
          </button>
        </div>
      ) : null}
      {librariesFailed ? (
        <ReadFailure error={librariesRead.error ?? true} what="your libraries" onRetry={librariesRead.retry} className="m-2" />
      ) : noLibraries ? (
        <p className="px-2 py-4 text-sm text-muted-foreground" role="status">
          No libraries yet.
        </p>
      ) : expanding ? (
        <p className="px-2 py-4 text-sm text-muted-foreground" role="status">Reading your libraries…</p>
      ) : null}
      <div className={noLibraries || expanding || librariesFailed ? "hidden" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
        {trashView ? (
          <LibraryTrashList filterText={state.query.text} onMutated={() => refreshResults()} />
        ) : state.view.kind === "favorites" && sidebar.favorites.status !== "ready" ? (
          sidebar.favorites.status === "error" ? (
            <p className="px-2 py-4 text-sm text-destructive">
              {sidebar.favorites.error}
              <ErrorAlchemyMenu error={sidebar.favorites.error} size="xs" />
            </p>
          ) : (
            <p className="px-2 py-4 text-sm text-muted-foreground" role="status">Reading your favorites…</p>
          )
        ) : (
          // Searching keeps the view: the same layouts and facets, the matching items (a matching
          // passage folds into its item, highlighted) — never a separate page of typed sections.
          <BrowseResults
            layout={state.layout}
            highlight={searching ? (state.query.text ?? "") : ""}
            sections={triageView ? triageSections : state.view.kind === "favorites" ? [] : listSections}
            hits={hits}
            handlers={handlers}
            emptySentence={emptySentence(
              state.view,
              title,
              // Facets and Stage narrow outside the query: they are filters too.
              viewFiltered || hasFacetSelection(facetSel) || state.stage.length > 0,
            )}
            onShowMore={triageView ? triage.showMore : serverTranscripts ? () => transcriptList.showMore() : results.showMore}
            onRetry={triageView ? triage.refresh : serverTranscripts ? () => transcriptList.retry() : results.retry}
            stage={stageColumn}
            groupByDate={dateOrdered}
            emptyExtra={
              state.view.kind === "everything" && !sample ? (
                <HubGettingStarted />
              ) : transcriptsView && !viewFiltered && !hasFacetSelection(facetSel) ? (
                <Button asChild size="sm" className="h-8 gap-1.5">
                  <Link href="/transcripts/new">
                    <Plus className="h-4 w-4" /> Record, upload or paste a transcript
                  </Link>
                </Button>
              ) : null
            }
          />
        )}
      </div>
      <p className="hidden shrink-0 text-[11px] text-muted-foreground lg:block">
        <kbd>j</kbd>/<kbd>k</kbd> move · <kbd>↵</kbd> peek · <kbd>⌘↵</kbd> open · <kbd>x</kbd> select · <kbd>s</kbd> keep · <kbd>e</kbd> archive · <kbd>t</kbd> tag ·{" "}
        <kbd>m</kbd> file · <kbd>f</kbd> filter ·{" "}
        <kbd>/</kbd> search · <kbd>Esc</kbd> close ·{" "}
        <button type="button" className="underline-offset-2 hover:underline" onClick={() => setHelpOpen(true)}>
          <kbd>?</kbd> all shortcuts
        </button>
      </p>
    </div>
  );

  const main = groupMain ?? resultsMain;

  const sidebarNode = (
    <HubSidebar
      view={state.view.kind === "preset" && presetSavedView ? { kind: "saved", id: presetSavedView.id } : state.view}
      data={sidebar}
      sample={sample}
      onSelect={select}
      viewCounts={viewCounts}
      onSaveView={() => setSaveDialog({ mode: "create" })}
      onViewAction={(v, a) => void onViewAction(v, a)}
      triageCounts={
        sample
          ? undefined
          : {
              inbox: countText(triage.counts.inbox),
              kept: countText(triage.counts.kept),
              archived: countText(triage.counts.archived),
            }
      }
      tagsGroup={
        sample ? null : (
          <TagsSidebarGroup
            tags={hubTags}
            activeScopeId={state.view.kind === "container" && state.view.type === "scope" ? state.view.id : null}
            onSelect={(id) => select({ kind: "container", type: "scope", id })}
            onSelectName={filterByTag}
          />
        )
      }
    />
  );

  const askSources = results.sections.find((s) => s.key === "sources");
  const askSegments = results.sections.find((s) => s.key === "segments");
  const askNode = asking ? (
    <AskPanel
      query={{ ...expanded.query, mode: "ask" }}
      sources={askSources?.status === "ready" ? (askSources.section?.items ?? []) : undefined}
      segments={askSegments?.section?.items}
      onClose={() => write({ query: { ...state.query, mode: "find" } }, { replace: true })}
    />
  ) : null;

  const peekNode = peekKey ? (
    <HubPeek
      key={`${peekKey}:${filedVersion}`}
      hit={peekHit}
      peekKey={peekKey}
      sample={sample}
      onClose={closePeek}
      onOpenFull={openFull}
      onFileUnder={(h) => setFileUnderFor([h])}
      onAcceptSuggestion={acceptSuggestion}
      isFavorite={peekHit ? favoriteKeys.has(`${actionTarget(peekHit).entity}:${actionTarget(peekHit).id}`) : false}
      onToggleFavorite={(h) => void toggleFavorite(h)}
      extraActions={peekHit ? rowMenuNode(peekHit) : null}
      tagsSection={peekHit ? <PeekTags hit={peekHit} live={!sample} onFilter={filterByTag} /> : null}
    />
  ) : null;

  const header = (
    <RouteHeader
      left={
        <div className="flex min-w-0 items-center">
          {isMobile ? (
            mobilePane === "main" && !peekNode ? (
              <TapTargetButton
                icon={<PanelLeft className="h-4 w-4" />}
                ariaLabel="Views"
                onClick={() => setMobilePane("sidebar")}
              />
            ) : (
              <TapTargetButton
                icon={<ArrowLeft className="h-4 w-4" />}
                ariaLabel="Back to results"
                onClick={() => (peekNode ? closePeek() : setMobilePane("main"))}
              />
            )
          ) : null}
          <span className="truncate text-sm font-medium">{title}</span>
          {containerRecordHref && state.view.kind === "container" ? (
            <Link
              href={containerRecordHref}
              className="ml-2 shrink-0 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              title={`Open this ${tokenLabel(state.view.type).toLowerCase()}'s own page`}
            >
              Open {tokenLabel(state.view.type).toLowerCase()} page
            </Link>
          ) : null}
        </div>
      }
      right={
        <div className="flex items-center gap-1">
          {runner.jobs.length ? (
            <TapTargetButton
              icon={<Activity className="h-4 w-4" />}
              ariaLabel="Processing jobs"
              label={runningJobs ? `Processing ${runningJobs}` : "Jobs"}
              onClick={() => setJobsOpen(true)}
            />
          ) : null}
          <TapTargetButton
            icon={<FlaskConical className="h-4 w-4" />}
            ariaLabel={sample ? "Show my knowledge" : "Try sample data"}
            label={sample ? "My knowledge" : "Sample data"}
            onClick={() => write({ data: sample ? "live" : "sample", peek: null })}
          />
          {sample ? null : (
            <SourceAddMenu
              runner={runner}
              onLanded={() => {
                refreshResults();
                triage.refresh();
                stages.refresh();
              }}
              onJobStarted={(jobId) => {
                setFocusJobId(jobId);
                setJobsOpen(true);
              }}
            />
          )}
        </div>
      }
    />
  );

  const dialogs = (
    <>
    <SaveViewDialog
      open={saveDialog !== null}
      mode={saveDialog?.mode ?? "create"}
      initialName={saveDialog?.mode === "rename" ? saveDialog.view.name : ""}
      organizationName={activeOrgName}
      onOpenChange={(o) => {
        if (!o) setSaveDialog(null);
      }}
      onSubmit={async (values) => {
        if (saveDialog?.mode === "rename") {
          await renameView(saveDialog.view, values.name);
          recordToast.success(
            { type: "platform_saved_view", id: saveDialog.view.id, title: values.name },
            `Renamed to "${values.name}".`,
          );
          afterViewWrite();
        } else {
          await saveNewView(values);
        }
      }}
    />
    <TagDialog
      open={tagFor !== null}
      onOpenChange={(o) => {
        if (!o) setTagFor(null);
      }}
      count={tagFor ? uniqueTargets(tagFor).length : 0}
      tags={hubTags.items}
      onPick={(name) => {
        const items = tagFor ?? [];
        setTagFor(null);
        void doTag(items, name);
      }}
    />
    <TriageHelpSheet open={helpOpen} onOpenChange={setHelpOpen} />
    <SourceSaveDialog
      target={saveTarget}
      onClose={() => setSaveTarget(null)}
      onSettled={() => refreshResults()}
      onSaved={() => {
        setSelected(new Set());
        setFiledVersion((n) => n + 1);
        refreshResults();
        stages.refresh();
      }}
    />
    <ProcessingProgressSheet
      open={jobsOpen}
      onOpenChange={(o) => {
        setJobsOpen(o);
        if (!o) {
          refreshResults();
          stages.refresh();
        }
      }}
      jobs={runner.jobs}
      focusJobId={focusJobId}
      onCancel={runner.cancel}
      onDismiss={runner.dismiss}
      onCancelAll={runner.cancelAll}
      onDismissAll={runner.dismissAll}
    />
    <FileUnderDialog
      open={fileUnderFor !== null}
      onOpenChange={(o) => {
        if (!o) setFileUnderFor(null);
      }}
      count={fileUnderFor ? uniqueTargets(fileUnderFor).length : 0}
      orgId={activeOrgId ?? null}
      onPick={(container) => {
        const items = fileUnderFor ?? [];
        setFileUnderFor(null);
        void doFileUnder(items, container);
      }}
    />
    </>
  );

  if (isMobile) {
    return (
      <SurfaceRuntimeProvider surfaceName={HUB_LIBRARY_SURFACE} getScope={getScope} getWriteHandlers={getWriteHandlers} isEditable={false}>
        {header}
        <div className="h-full overflow-hidden pt-[var(--shell-header-h)]" data-testid="knowledge-hub-mobile">
          {askNode ? askNode : peekNode ? peekNode : mobilePane === "sidebar" ? sidebarNode : main}
        </div>
        {dialogs}
      </SurfaceRuntimeProvider>
    );
  }

  return (
    <SurfaceRuntimeProvider surfaceName={HUB_LIBRARY_SURFACE} getScope={getScope} getWriteHandlers={getWriteHandlers} isEditable={false}>
      {header}
      <div className="h-full w-full overflow-hidden" data-testid="knowledge-hub">
        <ClientGroup
          id={GROUP_ID}
          groupKey={GROUP_KEY}
          cookieName={cookieName}
          orientation="horizontal"
          defaultLayout={defaultLayout}
          className="h-full w-full"
        >
          <RegisteredPanel
            registerAs="sidebar"
            groupKey={GROUP_KEY}
            id="sidebar"
            collapsible
            collapsedSize="0%"
            defaultSize="18%"
            minSize="12%"
            maxSize="30%"
          >
            <div className="h-full overflow-hidden border-r border-border pt-[var(--shell-header-h)]">{sidebarNode}</div>
          </RegisteredPanel>
          <Handle hideWhenCollapsed={["sidebar"]} />
          <Panel id="main" minSize="30%">
            <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">{main}</div>
          </Panel>
          {peekNode ? (
            <>
              <Handle />
              <Panel id="peek" defaultSize="32%" minSize="22%" maxSize="55%">
                <div className="h-full overflow-hidden border-l border-border bg-card pt-[var(--shell-header-h)]">{peekNode}</div>
              </Panel>
            </>
          ) : null}
          {askNode ? (
            <>
              <Handle />
              <Panel id="ask" defaultSize="34%" minSize="24%" maxSize="55%">
                <div className="h-full overflow-hidden pt-[var(--shell-header-h)]">{askNode}</div>
              </Panel>
            </>
          ) : null}
        </ClientGroup>
      </div>
      {dialogs}
    </SurfaceRuntimeProvider>
  );
}
